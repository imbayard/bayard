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

load_dotenv()

log = logging.getLogger(__name__)

_client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

MODEL = "claude-3-haiku-20240307"

SYSTEM_PROMPT = (
    "You are Coach, a personal AI training and nutrition assistant. "
    "When a user asks about exercises or training for a specific activity or goal, "
    "be concise and specific. "
    "When exercises have video URLs, include them as markdown links — e.g. [Watch video](url) — so the user can view the demonstration."
)

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
    async with stdio_client(wger_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            _sessions["wger"] = session
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


async def _get_all_tools() -> list[dict]:
    tools = []
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


def _preamble_for_tool(name: str, tool_input: dict) -> str:
    if name == "search_exercises":
        muscles: list[str] = tool_input.get("muscle_names", [])
        if not muscles:
            return "Searching for exercises..."
        if len(muscles) == 1:
            return f"Looking for exercises targeting {muscles[0]}..."
        last = muscles[-1]
        rest = ", ".join(muscles[:-1])
        return f"Looking for exercises targeting {rest} and {last}..."
    return f"Using {name.replace('_', ' ')}..."


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
