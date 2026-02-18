import os
from anthropic import AsyncAnthropic
from dotenv import load_dotenv

load_dotenv()

_client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = (
    "You are Coach, a personal AI training and nutrition assistant. "
    "You have access to the user's Strava activity data and Wger fitness/nutrition data. "
    "Be concise, specific, and actionable."
)


async def chat(message: str, history: list) -> str:
    # Build messages list from history + new user message
    messages = [*history, {"role": "user", "content": message}]

    response = await _client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    return response.content[0].text
