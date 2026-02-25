# Bayard — Project Reference

A local AI coaching app. Single user (Bayard). Teaches you anything you want to learn.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + TypeScript + Vite (`frontend/`) |
| Backend | FastAPI + Python 3.10 (`backend/`) |
| AI | Anthropic Claude API (via `anthropic` SDK) |
| Tools | MCP (Model Context Protocol) subprocess servers |
| DB | SQLite only — one database (`lesson-plan.db`) + one for MCP context |

Run backend: `uvicorn backend.main:app --reload` from repo root
Run frontend: `npm run dev` from `frontend/`

---

## Repo Structure

```
backend/
  main.py                  — FastAPI app, lifespan, all endpoints
  claude_client.py         — Chat streaming + MCP session lifecycle
  agents/
    course_planner.py      — Two-step generation: plan overview markdown + save_modules tool call
  api/
    lesson_plan_store.py   — SQLite CRUD for lesson plans (lesson-plan.db)
    module_store.py        — SQLite CRUD for modules (same lesson-plan.db, FK to lesson_plans)

mcp_servers/
  wger_server.py           — Exercise search via wger.de API
  context_server.py        — User preference key/value store (context.db)
  strava_server.py         — Strava activity tools (stubbed)

frontend/src/
  types.ts                 — Shared TS interfaces (Module)
  App.tsx                  — Chat UI + header + view toggle
  dashboard/
    Dashboard.tsx          — Goals list + plan viewer modal (plan + modules)
    LearnForm.tsx          — 7-step carousel modal (questions → review → title → save)
    ModuleCard.tsx         — Reusable module card (name, description, key_points, challenge)

data/                      — Created at runtime, gitignored
  context.db               — User preferences (key/value)
  lesson-plan.db           — Saved lesson plans + modules
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat/stream` | SSE streaming chat with Claude + MCP tools |
| POST | `/lesson-plan/generate` | Generate plan overview + extract modules; returns `{markdown, modules}` |
| POST | `/lesson-plan/save` | Save `{title, plan, modules}` to DB, returns `{id}` |
| GET | `/lesson-plans` | List all saved plans, newest first |
| DELETE | `/lesson-plan/{id}` | Delete plan + cascade-delete its modules |
| GET | `/lesson-plan/{id}/modules` | List modules for a saved plan |
| PUT | `/module/{id}` | Partial update a module (name, description, key_points, challenge) |
| DELETE | `/module/{id}` | Delete a single module |

---

## Key Decisions

- **SQLite only** — no external DB, ever.
- **Single user** — no auth, no multi-tenancy.
- **MCP for tools** — each integration is an isolated subprocess. Adding a new tool = new MCP server.
- **Lesson plans are markdown** — overview only (title, purpose, instructor directives, curriculum overview). Module detail lives in the `modules` table.
- **Course planner is two LLM calls** — call 1: generate plan overview (no tools). Call 2: forced `save_modules` tool call to extract structured module data. Both use `claude-sonnet-4-5`.
- **Modules table** — `plan_id` FK with `ON DELETE CASCADE`. `key_points` stored as JSON string. `position` column maintains order.
- **Chat uses `claude-3-haiku`** — cheaper for conversational turns.
- **Inline styles only** — `React.CSSProperties` objects in an `s` constant at the bottom of each component. No CSS modules, no Tailwind.

---

## Current State

**Working:**
- Chat with streaming responses
- Wger exercise search (by muscle group, returns exercises with videos)
- User preference memory (`get_context` / `set_context` → `context.db`)
- Full lesson plan creation flow: 5 intake questions → plan overview + 6 modules → review (collapsible agent instructions + module cards) → title → saved to DB
- Dashboard: lists saved plans, click to view (collapsible plan + module cards, copy button), hover to delete (with confirm)

**Stubbed / not wired yet:**
- Strava integration (MCP server exists, API calls not implemented)
- "Start learning" — plan is saved but chat doesn't yet load it as context for a session

---

## Ignore

`bootcamp/` — Bayard's Python interview training. Unrelated to this app.
