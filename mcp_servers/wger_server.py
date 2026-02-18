"""
Wger MCP Server

Exposes Wger exercise and nutrition tools to Claude via the MCP stdio transport.
Auth: API key in .env (WGER_API_KEY). Base URL: https://wger.de/api/v2/

TODO: implement each tool by calling the Wger REST API.
"""

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

server = Server("wger")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="search_exercises",
            description="Search Wger exercises by muscle group, equipment, or category.",
            inputSchema={
                "type": "object",
                "properties": {
                    "muscle_group": {"type": "string", "description": "e.g. 'quadriceps', 'core'"},
                    "equipment": {"type": "string", "description": "e.g. 'barbell', 'bodyweight'"},
                    "category": {"type": "string", "description": "e.g. 'Legs', 'Chest'"},
                },
            },
        ),
        Tool(
            name="get_nutritional_info",
            description="Look up macro information for a food ingredient by name.",
            inputSchema={
                "type": "object",
                "properties": {
                    "ingredient_name": {"type": "string", "description": "Food name to look up, e.g. 'chicken breast'"}
                },
                "required": ["ingredient_name"],
            },
        ),
        Tool(
            name="create_workout_plan",
            description="Create a named workout plan in Wger and return its ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "Plan name / description"}
                },
                "required": ["description"],
            },
        ),
        Tool(
            name="add_exercise_to_plan",
            description="Add a specific exercise with sets and reps to an existing Wger workout plan.",
            inputSchema={
                "type": "object",
                "properties": {
                    "plan_id": {"type": "integer", "description": "Wger plan ID returned by create_workout_plan"},
                    "exercise_id": {"type": "integer", "description": "Wger exercise ID"},
                    "sets": {"type": "integer", "description": "Number of sets"},
                    "reps": {"type": "integer", "description": "Number of reps per set"},
                },
                "required": ["plan_id", "exercise_id", "sets", "reps"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    # TODO: call Wger REST API with WGER_API_KEY
    return [TextContent(type="text", text=f"[stub] {name} called with {arguments}")]


if __name__ == "__main__":
    import asyncio
    asyncio.run(stdio_server(server))
