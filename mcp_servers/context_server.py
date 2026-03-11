"""
Context MCP Server

Persists user preferences as key/value pairs in a local SQLite database (data/context.db).
Claude calls get_context at the start of each conversation and set_context when the user
states a preference (e.g. "remember I have a gym membership").

TODO: implement SQLite read/write in each tool handler.
"""

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
import asyncio
import pathlib
from pydantic import BaseModel, Field
import aiosqlite
import json

server = Server("context")


class GetContextTool(BaseModel):
    pass


class SetContextTool(BaseModel):
    key: str = Field(..., description="Preference key, e.g. 'equipment', 'goals'")
    value: str = Field(..., description="Preference Value")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_context",
            description="Retrieve all stored user preferences from the local SQLite context store.",
            inputSchema=GetContextTool.model_json_schema(),
        ),
        Tool(
            name="set_context",
            description="Store or update a user preference key/value pair in the local SQLite context store.",
            inputSchema=SetContextTool.model_json_schema(),
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    # TODO: read/write data/context.db via aiosqlite
    if name != "get_context" and name != "set_context":
        return [TextContent(type="text", text=f"Name {name} doesn't exist")]

    if name == "get_context":
        user_context = await get_context()
        return [TextContent(type="text", text=json.dumps(user_context))]

    if name == "set_context":
        key = arguments["key"]
        value = arguments["value"]

        if key is None or value is None:
            return [
                TextContent(
                    type="text",
                    text=f"[set_context] bad arguments for tool call {arguments}",
                )
            ]

        await set_context(key, value)
        return [TextContent(text=f"[set_context] Context set with {key}, {value}.")]


import os as _os
_default_dir = pathlib.Path(__file__).parent.parent / "data"
DB_PATH = pathlib.Path(_os.environ.get("DB_DIR", str(_default_dir))) / "context.db"


async def create_table():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """
                CREATE TABLE IF NOT EXISTS user_context (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT NOT NULL UNIQUE,
                    value TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )"""
        )
        await db.commit()


async def set_context(key: str, value: str) -> None:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            "INSERT INTO user_context (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        await db.commit()


async def get_context():
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT key, value FROM user_context") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def main() -> None:
    await create_table()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream, write_stream, server.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
