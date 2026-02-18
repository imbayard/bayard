"""
Anthropic SDK client + MCP tool loop.

TODO:
- Initialize Anthropic client from ANTHROPIC_API_KEY
- Spin up MCP server subprocesses (strava, wger, context) via stdio transport
- Implement agentic tool loop:
    1. Send message + history to Claude with available tools
    2. If Claude returns tool_use blocks, route to the appropriate MCP server
    3. Send tool results back to Claude
    4. Repeat until Claude returns a final text response
- Replace the stub below with the real implementation
"""


async def chat(message: str, history: list) -> str:
    # Stub — replace with real Anthropic SDK call + MCP tool loop
    return f"[stub] Received: {message}"
