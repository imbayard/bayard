"""
Strava MCP Server

Exposes Strava read tools to Claude via the MCP stdio transport.
Auth: OAuth2 refresh token stored in .env (STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN).

TODO: implement each tool by calling the Strava v3 API.
"""

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
import asyncio

server = Server("strava")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_latest_activity",
            description="Fetch the user's most recent Strava activity with type, HR, pace, distance, and map polyline.",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="get_activities",
            description="List Strava activities, optionally filtered by type and date range.",
            inputSchema={
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "description": "Activity type, e.g. 'Run', 'Ride'",
                    },
                    "after": {
                        "type": "string",
                        "description": "ISO date string — return activities after this date",
                    },
                    "before": {
                        "type": "string",
                        "description": "ISO date string — return activities before this date",
                    },
                    "per_page": {
                        "type": "integer",
                        "description": "Max results (default 30)",
                    },
                },
            },
        ),
        Tool(
            name="get_activity_detail",
            description="Fetch full detail for a specific Strava activity by ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "activity_id": {
                        "type": "integer",
                        "description": "Strava activity ID",
                    }
                },
                "required": ["activity_id"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    # TODO: exchange refresh token for access token, call Strava v3 API
    return [TextContent(type="text", text=f"[stub] {name} called with {arguments}")]


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream, write_stream, server.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
