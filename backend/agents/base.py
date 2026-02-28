import os
from anthropic import AsyncAnthropic
from dotenv import load_dotenv

load_dotenv()

client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


async def forced_tool_call(
    system: str,
    user_content: str,
    tool: dict,
    model: str,
    max_tokens: int = 2048,
) -> dict:
    response = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        tools=[tool],
        tool_choice={"type": "any"},
        messages=[{"role": "user", "content": user_content}],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == tool["name"]:
            return block.input
    return {}
