import json
from backend.agents.base import client
from backend.config import MODEL_CHAT


def _system_prompt(label: str, topic: str, points: list[str]) -> str:
    bullet_list = "\n".join(f"- {p}" for p in points)
    return (
        f'You are an expert advisor for the {label} position on: "{topic}".\n\n'
        f"Your position:\n{bullet_list}\n\n"
        "The mediator will share what the opponent said. Help them craft a sharp response.\n\n"
        "STRICT rules:\n"
        "- 1-3 sentences ONLY. Never more. Be punchy.\n"
        "- No bullet points, no lists, no headers, no preamble.\n"
        "- Never prefix with your name.\n"
        "- Use **bold** for emphasis."
    )


def _last_bot_response(thread: list[dict]) -> str | None:
    for entry in reversed(thread):
        if entry["speaker"] != "mediator":
            return entry["content"]
    return None


def _build_msgs(thread: list[dict]) -> list[dict]:
    msgs = []
    for m in thread:
        if m["speaker"] == "mediator":
            msgs.append({"role": "user", "content": m["content"]})
        else:
            msgs.append({"role": "assistant", "content": m["content"]})
    return msgs


async def _stream_bot(bot_id, name, system, msgs):
    """Yield SSE events for a single bot turn. Returns full response text."""
    yield f"event: speaker\ndata: {json.dumps({'id': bot_id, 'name': name})}\n\n"

    full_content = ""
    async with client.messages.stream(
        model=MODEL_CHAT,
        max_tokens=256,
        system=system,
        messages=msgs,
    ) as stream:
        async for text in stream.text_stream:
            full_content += text
            yield f"event: delta\ndata: {json.dumps({'id': bot_id, 'text': text})}\n\n"

    yield f"event: turn_done\ndata: {json.dumps({'id': bot_id, 'content': full_content})}\n\n"
    # Stash the full content so the caller can read it
    yield full_content


async def mediator_stream(
    topic: str,
    bot_a_name: str,
    bot_a_points: list[str],
    bot_b_name: str,
    bot_b_points: list[str],
    thread_a: list[dict],
    thread_b: list[dict],
    target: str,
    question: str,
):
    """
    Single-turn round (except opening which is 2 turns).
      "a"        — A speaks (with optional mediator question)
      "b"        — B speaks (with optional mediator question)
      "continue" — whichever side didn't speak last goes next
    Opening (both threads empty): both speak, A then B.
    """
    system_a = _system_prompt(bot_a_name, topic, bot_a_points)
    system_b = _system_prompt(bot_b_name, topic, bot_b_points)

    last_a = _last_bot_response(thread_a)
    last_b = _last_bot_response(thread_b)

    # Opening: both threads empty → both bots give opening statements
    opening = not thread_a and not thread_b

    if opening:
        order = [
            ("a", bot_a_name, system_a, thread_a, None, bot_b_name, ""),
            ("b", bot_b_name, system_b, thread_b, None, bot_a_name, ""),
        ]
    elif target == "a":
        order = [("a", bot_a_name, system_a, thread_a, last_b, bot_b_name, question)]
    elif target == "b":
        order = [("b", bot_b_name, system_b, thread_b, last_a, bot_a_name, question)]
    else:  # continue — opposite of whoever spoke last
        a_len = len([m for m in thread_a if m["speaker"] == "a"])
        b_len = len([m for m in thread_b if m["speaker"] == "b"])
        if a_len > b_len:
            order = [("b", bot_b_name, system_b, thread_b, last_a, bot_a_name, "")]
        else:
            order = [("a", bot_a_name, system_a, thread_a, last_b, bot_b_name, "")]

    first_response = None

    for (
        bot_id,
        name,
        system,
        thread,
        opponent_last,
        opponent_name,
        mediator_text,
    ) in order:
        # During opening, second bot gets first bot's fresh response
        if opening and first_response is not None:
            opponent_last = first_response

        msgs = _build_msgs(thread)

        # Build the new user message
        parts = []
        if opponent_last:
            parts.append(f"[{opponent_name}'s latest statement]: {opponent_last}")
        if mediator_text:
            parts.append(f"[Mediator]: {mediator_text}")

        if parts:
            msgs.append({"role": "user", "content": "\n\n".join(parts)})
        elif not msgs:
            msgs.append(
                {
                    "role": "user",
                    "content": "The mediator has opened the floor. Present your opening perspective.",
                }
            )

        # Stream this bot's response
        full_content = ""
        async for chunk in _stream_bot(bot_id, name, system, msgs):
            if not chunk.startswith("event:"):
                full_content = chunk  # last yield is the full text
            else:
                yield chunk

        if first_response is None:
            first_response = full_content

    yield "event: done\ndata: {}\n\n"
