import asyncio
import logging
import os
import pathlib
import sys
from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from backend.config import MODEL_CHAT
from backend.agents.course_planner import generate_lesson_plan
from backend.agents.artifact_seeder import seed_artifacts
from backend.api.artifact_store import get_artifacts
from backend.api.lesson_plan_store import set_plan, get_plan, get_plans
from backend.api.module_store import save_modules, get_modules

load_dotenv()

log = logging.getLogger(__name__)

_client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

MODEL = MODEL_CHAT

SYSTEM_PROMPT = (
    "You are Coach — a direct, no-nonsense personal coach. "
    "Be terse. No filler, no preamble, no closing summaries.\n\n"
    "To create a lesson plan: ask the user what they want to learn, why, their experience level, anything to avoid, and how hard to push them. "
    "Once they answer, call create_lesson_plan. After it returns, tell them to open the Dashboard.\n\n"
    "To analyze a lesson: call analyze_lesson. "
    "Report overall performance, module results, quiz scores, strengths, and next steps."
)


LIST_LESSON_PLANS_TOOL = {
    "name": "list_lesson_plans",
    "description": "List all saved lesson plans with titles and status.",
    "input_schema": {"type": "object", "properties": {}, "required": []},
}

CREATE_LESSON_PLAN_TOOL = {
    "name": "create_lesson_plan",
    "description": "Generate and save a full lesson plan from the user's intake response. Only call this after the user has answered the intake question.",
    "input_schema": {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "The user's free-text response to the intake question",
            }
        },
        "required": ["prompt"],
    },
}

_sessions: dict[str, ClientSession] = {}
_tool_index: dict[str, ClientSession] = {}
_mcp_task: asyncio.Task | None = None
_shutdown: asyncio.Event | None = None


async def _mcp_lifecycle(ready: asyncio.Event, shutdown: asyncio.Event) -> None:
    server_path = str(
        pathlib.Path(__file__).parent.parent / "mcp_servers" / "wger_server.py"
    )
    wger_params = StdioServerParameters(
        command=sys.executable,
        args=[server_path],
        env=None,  # inherit parent environment
        stderr=sys.stderr,
    )
    context_server_path = str(
        pathlib.Path(__file__).parent.parent / "mcp_servers" / "context_server.py"
    )
    user_context_params = StdioServerParameters(
        command=sys.executable, args=[context_server_path], env=None, stderr=sys.stderr
    )
    async with stdio_client(wger_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            _sessions["wger"] = session
            tools_result = await session.list_tools()
            for tool in tools_result.tools:
                _tool_index[tool.name] = session
            async with stdio_client(user_context_params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    _sessions["context"] = session
                    tools_result = await session.list_tools()
                    for tool in tools_result.tools:
                        _tool_index[tool.name] = session
                    ready.set()
                    await shutdown.wait()


async def init_mcp() -> None:
    global _mcp_task, _shutdown
    ready = asyncio.Event()
    _shutdown = asyncio.Event()
    _mcp_task = asyncio.create_task(_mcp_lifecycle(ready, _shutdown))

    # Race: either ready fires (success) or the task exits early (failure), 30s timeout
    ready_task = asyncio.create_task(ready.wait())
    done, _ = await asyncio.wait(
        {_mcp_task, ready_task},
        return_when=asyncio.FIRST_COMPLETED,
        timeout=30.0,
    )
    ready_task.cancel()

    if not done:
        _mcp_task.cancel()
        raise RuntimeError("MCP server startup timed out after 30s")
    if _mcp_task in done:
        exc = _mcp_task.exception() if not _mcp_task.cancelled() else None
        # Unwrap anyio ExceptionGroup to surface the real inner error
        while hasattr(exc, "exceptions") and exc.exceptions:
            exc = exc.exceptions[0]
        raise RuntimeError(
            f"MCP server failed to start: {type(exc).__name__}: {exc}"
        ) from exc


async def cleanup_mcp() -> None:
    if _shutdown:
        _shutdown.set()
    if _mcp_task and not _mcp_task.done():
        try:
            await asyncio.wait_for(_mcp_task, timeout=5.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            _mcp_task.cancel()


async def _build_analyze_tool() -> dict:
    plans = await get_plans()
    if plans:
        listing = "\n".join(f"  {p['id']}: {p['title']} ({p['status']})" for p in plans)
        description = f"Analyze a lesson plan. Available plans:\n{listing}"
        enum = [p["id"] for p in plans]
    else:
        description = "Analyze a lesson plan. No plans saved yet."
        enum = None
    schema: dict = {"type": "integer", "description": "ID of the lesson plan to analyze"}
    if enum:
        schema["enum"] = enum
    return {
        "name": "analyze_lesson",
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": {"plan_id": schema},
            "required": ["plan_id"],
        },
    }


async def _get_all_tools() -> list[dict]:
    tools = [CREATE_LESSON_PLAN_TOOL, await _build_analyze_tool(), LIST_LESSON_PLANS_TOOL]
    for session in _sessions.values():
        result = await session.list_tools()
        for t in result.tools:
            tools.append(
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.inputSchema,
                }
            )
    return tools


async def _handle_create_lesson_plan(prompt: str) -> str:
    plan_text, modules = await generate_lesson_plan(prompt)
    title = next(
        (line.lstrip("#").strip() for line in plan_text.splitlines() if line.startswith("# ")),
        "New Lesson Plan",
    )
    plan_id = await set_plan(title, plan_text)
    if modules:
        await save_modules(plan_id, modules)
        # Re-fetch from DB so each module carries its DB-assigned id,
        # which seed_artifacts needs to create artifact rows.
        saved_modules = await get_modules(plan_id)
        await seed_artifacts(saved_modules)
    return f"Lesson plan '{title}' created with {len(modules)} modules."


async def _handle_list_lesson_plans() -> str:
    plans = await get_plans()
    if not plans:
        return "No lesson plans found."
    return "\n".join(f"ID {p['id']}: {p['title']} ({p['status']})" for p in plans)


async def _handle_analyze_lesson(plan_id: int) -> str:
    plan = await get_plan(plan_id)
    if not plan:
        return f"No lesson plan found with ID {plan_id}."
    modules = await get_modules(plan_id)
    lines = [
        f"# Lesson: {plan['title']}",
        f"## Curriculum Rubric\n{plan['plan']}",
        "## Module Results",
    ]
    for m in modules:
        lines.append(f"\n### Module {m['position']}: {m['name']} ({m['type']}, {m['status']})")
        lines.append(f"Goal: {m['description']}")
        for a in await get_artifacts(m["id"]):
            if not a["data"]:
                continue
            lines.append(f"\n#### {a['type']}")
            d = a["data"]
            if a["type"] == "quiz" and d.get("responses"):
                qs, rs = d["questions"], d["responses"]
                score = sum(1 for i, r in enumerate(rs) if r["selected"] == qs[i]["answer"])
                lines.append(f"Score: {score}/{len(qs)}")
                for i, (q, r) in enumerate(zip(qs, rs)):
                    correct = r["selected"] == q["answer"]
                    answer = q["answer"]
                    mark = "✓" if correct else f"✗ (correct: {answer})"
                    lines.append(f"Q{i+1}: {q['question']}\n  User: {r['selected']} {mark}")
            elif a["type"] == "checklist" and d.get("items"):
                checked = d.get("checked", [])
                done = sum(1 for c in checked if c)
                lines.append(f"Completed: {done}/{len(d['items'])}")
                for item, c in zip(d["items"], checked + [False] * len(d["items"])):
                    lines.append(f"  {'✓' if c else '○'} {item}")
            elif a["type"] == "exercise":
                lines.append(f"Objective: {d.get('objective', '')}")
    return "\n".join(lines)


def _preamble_for_tool(name: str, tool_input: dict) -> str:
    if name == "create_lesson_plan":
        return "Generating your lesson plan…"
    if name == "analyze_lesson":
        return "Analyzing your lesson…"
    if name == "list_lesson_plans":
        return "Looking up your lesson plans…"
    if name == "search_exercises":
        muscles: list[str] = tool_input.get("muscle_names", [])
        if not muscles:
            return "Searching for exercises…"
        if len(muscles) == 1:
            return f"Looking for exercises targeting {muscles[0]}…"
        last = muscles[-1]
        rest = ", ".join(muscles[:-1])
        return f"Looking for exercises targeting {rest} and {last}…"
    return f"Using {name.replace('_', ' ')}…"


async def chat_stream(message: str, history: list) -> AsyncIterator[str]:
    messages = [*history, {"role": "user", "content": message}]
    tools = await _get_all_tools()
    kwargs: dict = {"tools": tools} if tools else {}

    # Phase 1: resolve tool calls non-streaming
    while True:
        response = await _client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=messages,
            **kwargs,
        )

        if response.stop_reason != "tool_use":
            break  # fall through to streaming final answer

        # Emit preamble for each tool block
        for block in response.content:
            if block.type == "tool_use":
                preamble = _preamble_for_tool(block.name, block.input)
                yield f"event: preamble\ndata: {preamble}\n\n"

        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            if block.name == "create_lesson_plan":
                try:
                    log.info("Tool call: create_lesson_plan")
                    content = await _handle_create_lesson_plan(block.input["prompt"])
                    log.info("Tool result: %s", content)
                except Exception as exc:
                    content = f"Failed to create lesson plan: {exc}"
            elif block.name == "analyze_lesson":
                try:
                    log.info("Tool call: analyze_lesson")
                    content = await _handle_analyze_lesson(block.input["plan_id"])
                    log.info("Tool result: %s", content[:200])
                except Exception as exc:
                    content = f"Failed to analyze lesson: {exc}"
            elif block.name == "list_lesson_plans":
                try:
                    log.info("Tool call: list_lesson_plans")
                    content = await _handle_list_lesson_plans()
                    log.info("Tool result: %s", content)
                except Exception as exc:
                    content = f"Failed to list lesson plans: {exc}"
            else:
                session = _tool_index.get(block.name)
                if session:
                    try:
                        log.info("Tool call: %s %s", block.name, block.input)
                        result = await session.call_tool(block.name, block.input)
                        content = "\n".join(
                            c.text for c in result.content if hasattr(c, "text")
                        )
                        log.info("Tool result: %s", content)
                    except Exception as exc:
                        content = f"Tool error: {exc}"
                else:
                    content = f"Unknown tool: {block.name}"

            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": content,
                }
            )

        messages.append({"role": "user", "content": tool_results})

    # Phase 2: stream the final response
    async with _client.messages.stream(
        model=MODEL,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=messages,
        **kwargs,
    ) as stream:
        async for text_delta in stream.text_stream:
            safe = text_delta.replace("\n", "\\n")
            yield f"event: response.message\ndata: {safe}\n\n"

    yield "event: done\ndata: \n\n"
