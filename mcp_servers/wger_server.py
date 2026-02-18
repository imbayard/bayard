"""
Wger MCP Server

Exposes Wger exercise tools to Claude via the MCP stdio transport.
Auth: API key in .env (WGER_API_KEY). Base URL: https://wger.de/api/v2/
"""

import asyncio
import html
import json
import os
import re
import sys

import httpx
from dotenv import load_dotenv
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

load_dotenv()

WGER_BASE = "https://wger.de/api/v2"
WGER_API_KEY = os.environ.get("WGER_API_KEY", "")

# Wger muscle IDs — https://wger.de/api/v2/muscle/
MUSCLE_NAME_TO_ID: dict[str, int] = {
    "biceps": 1,
    "biceps brachii": 1,
    "anterior deltoid": 2,
    "deltoid": 2,
    "shoulder": 2,
    "shoulders": 2,
    "serratus anterior": 3,
    "serratus": 3,
    "pectoralis major": 4,
    "pectoralis": 4,
    "pecs": 4,
    "chest": 4,
    "triceps brachii": 5,
    "triceps": 5,
    "rectus abdominis": 6,
    "abs": 6,
    "abdominals": 6,
    "core": 6,
    "gastrocnemius": 7,
    "calf": 7,
    "calves": 7,
    "gluteus maximus": 8,
    "glutes": 8,
    "gluteus": 8,
    "trapezius": 9,
    "traps": 9,
    "quadriceps femoris": 10,
    "quadriceps": 10,
    "quads": 10,
    "biceps femoris": 11,
    "hamstrings": 11,
    "hamstring": 11,
    "latissimus dorsi": 12,
    "lats": 12,
    "upper back": 12,
    "brachialis": 13,
    "obliquus externus abdominis": 14,
    "obliques": 14,
    "oblique": 14,
    "soleus": 15,
}


def _strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _is_english(translation: dict) -> bool:
    lang = translation.get("language")
    if isinstance(lang, int):
        return lang == 2
    if isinstance(lang, dict):
        return lang.get("id") == 2 or lang.get("shortName", "").lower() == "en"
    if isinstance(lang, str):
        return lang.lower() in ("en", "english")
    return False


server = Server("wger")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="search_exercises",
            description=(
                "Fetch exercises from Wger that target specific muscle groups - use when the user wants exercises either for muscles or for activities. "
                "Pass the muscle groups most relevant to the user's activity or goal. "
                "Returns exercises with name, category, primary/secondary muscles, and equipment."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "muscle_names": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Muscle group names to target. "
                            "Supported values: biceps, triceps, chest, shoulders, lats, upper back, traps, "
                            "abs, core, obliques, quadriceps, quads, hamstrings, glutes, calves, brachialis, soleus."
                        ),
                    }
                },
                "required": ["muscle_names"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name != "search_exercises":
        return [TextContent(type="text", text=f"Unknown tool: {name}")]

    muscle_names: list[str] = arguments.get("muscle_names", [])

    # Map names → IDs (deduplicated)
    muscle_ids: set[int] = set()
    unrecognized: list[str] = []
    for m in muscle_names:
        mid = MUSCLE_NAME_TO_ID.get(m.strip().lower())
        if mid:
            muscle_ids.add(mid)
        else:
            unrecognized.append(m)

    if not muscle_ids:
        return [
            TextContent(
                type="text",
                text=json.dumps(
                    {
                        "error": "No recognized muscle groups",
                        "unrecognized": unrecognized,
                    }
                ),
            )
        ]

    headers = {"Authorization": f"Token {WGER_API_KEY}"} if WGER_API_KEY else {}
    seen_ids: set[int] = set()
    exercises: list[dict] = []
    print("Calling wger to get excercises for muscle groups", muscle_names, file=sys.stderr)
    async with httpx.AsyncClient(timeout=15) as client:
        for muscle_id in muscle_ids:
            resp = await client.get(
                f"{WGER_BASE}/exerciseinfo/",
                headers=headers,
                params={
                    "format": "json",
                    "language": 2,
                    "muscles": muscle_id,
                    "limit": 10,
                },
            )
            resp.raise_for_status()

            for ex in resp.json().get("results", []):
                if ex["id"] in seen_ids:
                    continue
                seen_ids.add(ex["id"])

                en = next(
                    (t for t in ex.get("translations", []) if _is_english(t)), None
                )
                if not en or not en.get("name"):
                    continue

                raw_desc = en.get("description", "")
                videos = [v["video"] for v in ex.get("videos", []) if v.get("video")]

                exercises.append(
                    {
                        "id": ex["id"],
                        "name": en["name"],
                        "category": ex.get("category", {}).get("name", ""),
                        "muscles_primary": [
                            m["name_en"] for m in ex.get("muscles", [])
                        ],
                        "muscles_secondary": [
                            m["name_en"] for m in ex.get("muscles_secondary", [])
                        ],
                        "equipment": [e["name"] for e in ex.get("equipment", [])]
                        or ["bodyweight"],
                        "description": _strip_html(raw_desc) if raw_desc else "",
                        "videos": videos,
                    }
                )

    result: dict = {"exercises": exercises, "count": len(exercises)}
    print("Response from wger: ", exercises, file=sys.stderr)
    if unrecognized:
        result["unrecognized_muscles"] = unrecognized

    return [TextContent(type="text", text=json.dumps(result, indent=2))]


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream, write_stream, server.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
