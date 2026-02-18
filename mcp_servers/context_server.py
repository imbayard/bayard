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

server = Server("context")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_context",
            description="Retrieve all stored user preferences from the local SQLite context store.",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="set_context",
            description="Store or update a user preference key/value pair in the local SQLite context store.",
            inputSchema={
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "Preference key, e.g. 'equipment', 'goals'"},
                    "value": {"type": "string", "description": "Preference value"},
                },
                "required": ["key", "value"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    # TODO: read/write data/context.db via aiosqlite
    return [TextContent(type="text", text=f"[stub] {name} called with {arguments}")]


if __name__ == "__main__":
    import asyncio
    asyncio.run(stdio_server(server))
