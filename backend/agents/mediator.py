import json
from backend.agents.base import client
from backend.config import MODEL_CHAT


def _system_prompt(label: str, topic: str, points: list[str]) -> str:
    bullet_list = "\n".join(f"- {p}" for p in points)
    return (
        f"You are {label} in a structured debate on the topic: \"{topic}\".\n\n"
        f"Your position is defined by these points:\n{bullet_list}\n\n"
        "Rules for every response:\n"
        "1. Keep it to 2-3 sentences MAX. This is a conversation, not an essay.\n"
        "2. Be direct and punchy — react to what was just said, push back, concede points.\n"
        "3. Use markdown: **bold** for emphasis, `code` for technical terms.\n"
        "4. No bullet points, no lists, no headers. Just talk.\n"
        "5. NEVER prefix your response with your name or label. Just speak directly."
    )


async def mediator_stream(
    topic: str,
    bot_a_name: str,
    bot_a_points: list[str],
    bot_b_name: str,
    bot_b_points: list[str],
    history: list[dict],
):
    """Run 4 turns (A→B→A→B) and yield SSE events for each."""

    system_a = _system_prompt(bot_a_name, topic, bot_a_points)
    system_b = _system_prompt(bot_b_name, topic, bot_b_points)

    # Build separate message histories for each bot.
    # Each bot sees the full conversation but from their own system prompt.
    def build_messages(perspective: str) -> list[dict]:
        msgs = []
        for m in history:
            speaker = m["speaker"]
            content = m["content"]
            if speaker == "mediator":
                msgs.append({"role": "user", "content": f"[Mediator]: {content}"})
            elif speaker == perspective:
                msgs.append({"role": "assistant", "content": content})
            else:
                msgs.append({"role": "user", "content": f"[{m['name']}]: {content}"})
        return msgs

    turn_order = [
        ("a", bot_a_name, system_a),
        ("b", bot_b_name, system_b),
        ("a", bot_a_name, system_a),
        ("b", bot_b_name, system_b),
    ]

    for bot_id, name, system in turn_order:
        msgs = build_messages(bot_id)

        # Signal which bot is about to speak
        yield f"event: speaker\ndata: {json.dumps({'id': bot_id, 'name': name})}\n\n"

        # Stream response
        full_content = ""
        async with client.messages.stream(
            model=MODEL_CHAT,
            max_tokens=256,
            system=system,
            messages=msgs if msgs else [{"role": "user", "content": "Begin your opening argument."}],
        ) as stream:
            async for text in stream.text_stream:
                full_content += text
                yield f"event: delta\ndata: {json.dumps({'id': bot_id, 'text': text})}\n\n"

        yield f"event: turn_done\ndata: {json.dumps({'id': bot_id, 'content': full_content})}\n\n"

        # Add this turn to history so the next bot sees it
        history.append({"speaker": bot_id, "name": name, "content": full_content})

    yield "event: done\ndata: {}\n\n"
