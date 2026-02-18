# Coach — AI Training & Nutrition Assistant

### Product Requirements Document (Local Dev)

---

## What It Does

A conversational AI coach that reads your Strava activity and Wger fitness/nutrition data, reasons over it with Claude, and can write workout plans back to Wger. Runs entirely locally.

---

## Example Conversations

| User Says                                                   | What Happens                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| "Analyze my latest run"                                     | Pulls most recent Strava activity, returns HR zone breakdown, pace, and recovery recommendation |
| "Give me a workout that'll help with snowboarding"          | Queries Wger exercise DB filtered by relevant muscle groups, writes a plan back to Wger         |
| "What should I eat tonight? I have chicken, rice, broccoli" | Wger nutrition lookup + Claude generates a meal with macro estimates                            |
| "How have my runs been this month?"                         | Aggregates Strava activity history, identifies trends                                           |
| "Remember I have a gym membership"                          | Persists to local context store, informs future workout suggestions                             |

---

## Architecture

```
Browser (React SPA)
      │
      │ HTTP (localhost:8000)
      ▼
FastAPI Backend
      │
      ├── Claude (via Anthropic SDK)
      │       │ tool calls
      │       ▼
      ├── Strava MCP Server    →  Strava API (read)
      ├── Wger MCP Server      →  Wger API (read + write)
      └── Context MCP Server   →  SQLite (local, read + write)
```

Claude acts as the orchestrator — it decides which tools to call based on the user message, synthesizes results into a conversational response.

---

## Serving It Locally (Simple)

**Backend:** FastAPI with Uvicorn. One command, auto-reloads on save.

```bash
uvicorn backend.main:app --reload --port 8000
```

**Frontend:** Plain React served via Vite dev server. No build step needed during development.

```bash
npm create vite@latest frontend -- --template react
cd frontend && npm install && npm run dev  # serves on localhost:5173
```

**MCP Servers:** Each runs as a local subprocess spun up by the FastAPI backend at startup — no separate terminal needed. Use the `mcp` Python SDK with `stdio` transport.

---

## File Structure

```
bayard/
├── .env
├── requirements.txt
├── mcp_servers/
│   ├── strava_server.py      # MCP: Strava read tools
│   ├── wger_server.py        # MCP: Wger read + write tools
│   └── context_server.py     # MCP: SQLite user preferences
├── backend/
│   ├── main.py               # FastAPI app, /chat endpoint, MCP subprocess mgmt
│   └── claude_client.py      # Anthropic SDK, tool loop, MCP wiring
└── frontend/
    └── src/
        └── App.tsx           # Chat UI, nothing else needed
```

---

## MCP Tools (per server)

### Strava Server

| Tool                  | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `get_latest_activity` | Most recent activity with type, HR, pace, distance, map polyline |
| `get_activities`      | List of activities, filterable by type and date range            |
| `get_activity_detail` | Full detail for a specific activity ID                           |

### Wger Server

| Tool                   | Description                                   |
| ---------------------- | --------------------------------------------- |
| `search_exercises`     | Search by muscle group, equipment, category   |
| `get_nutritional_info` | Look up ingredient macros by name             |
| `create_workout_plan`  | Write a named workout plan to Wger            |
| `add_exercise_to_plan` | Add a specific exercise + sets/reps to a plan |

### Context Server

| Tool          | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| `get_context` | Retrieve all stored user preferences                            |
| `set_context` | Store a key/value preference (equipment, dislikes, goals, etc.) |

---

## APIs & Auth

| Service   | Auth Method                                                        | Notes                                  |
| --------- | ------------------------------------------------------------------ | -------------------------------------- |
| Strava    | OAuth2 — one-time browser flow, then store refresh token in `.env` | Scope: `activity:read_all`             |
| Wger      | API key                                                            | Free account at wger.de, key in `.env` |
| Anthropic | API key                                                            | In `.env`                              |

---

## Data Flow: Single Turn

1. User sends message via React chat UI → `POST /chat`
2. FastAPI passes message + conversation history to `claude_client.py`
3. Claude evaluates message, emits tool calls as needed
4. Backend routes tool calls to appropriate MCP server subprocess
5. MCP server makes API call, returns structured result
6. Claude synthesizes final response
7. Response streams back to frontend

---

## Context / Memory (Nice to Have)

Store user preferences in a local SQLite file (`data/context.db`) via the Context MCP server. Claude automatically calls `get_context` at the start of each conversation to inject preferences into its system prompt. User can set preferences conversationally ("remember I hate running in the rain") and Claude calls `set_context` to persist them.

---

## MVP Scope Boundaries

**In scope:**

- Chat interface (no auth, single user, local only)
- Strava read, Wger read + write workout plans
- Streaming responses
- Basic conversation history within a session

**Out of scope for MVP:**

- Multi-user
- Wger nutrition plan write (read only for meals)
- Strava write
- Deployment of any kind
