import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, RedirectResponse
from google_auth_oauthlib.flow import Flow
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)

from backend.claude_client import chat_stream, cleanup_mcp, init_mcp
from backend.agents.course_planner import generate_lesson_plan
from backend.agents.artifact_seeder import seed_artifacts
from backend.agents.artifact_generator import generate_artifact
from backend.api.lesson_plan_store import create_table as create_plans_table, set_plan, get_plans, delete_plan, update_plan_status
from backend.api.module_store import (
    create_table as create_modules_table,
    save_modules,
    get_modules,
    get_module,
    update_module,
    complete_module,
    delete_module,
    get_all_modules,
)
from backend.api import google_calendar
from backend.api.artifact_store import (
    create_table as create_artifacts_table,
    get_artifacts,
    get_artifact,
    update_artifact,
    delete_artifact,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_mcp()
    await create_plans_table()
    await create_modules_table()
    await create_artifacts_table()
    yield
    await cleanup_mcp()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: list = []


class LessonPlanRequest(BaseModel):
    prompt: str


class SaveLessonPlanRequest(BaseModel):
    title: str
    plan: str
    modules: list[dict] = []


class UpdatePlanStatusRequest(BaseModel):
    status: str


class UpdateModuleRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    type: str | None = None
    status: str | None = None


class UpdateArtifactRequest(BaseModel):
    data: dict


class CreateModuleBlockRequest(BaseModel):
    module_id: int
    start_time: str   # "YYYY-MM-DDTHH:MM" naive local time
    end_time: str


class CreateHabitRequest(BaseModel):
    title: str
    days_of_week: list[int]   # 0=Mon … 6=Sun
    start_time: str            # "HH:MM"
    duration_minutes: int


_CREDENTIALS_FILE = Path(__file__).parent / "credentials.json"
_TOKEN_FILE = Path(__file__).parent / "token.json"
_OAUTH_SCOPES = ["https://www.googleapis.com/auth/calendar"]
_OAUTH_REDIRECT = "http://localhost:8000/oauth/callback"
_oauth_flow: Flow | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest):
    return StreamingResponse(
        chat_stream(req.message, req.history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/lesson-plan/generate")
async def lesson_plan_generate(req: LessonPlanRequest):
    markdown, modules = await generate_lesson_plan(prompt=req.prompt)
    logging.info("generate: plan_length=%d modules=%d", len(markdown), len(modules))
    if not markdown:
        logging.warning("generate: plan text is empty")
    if not modules:
        logging.warning("generate: no modules captured")
    return {"markdown": markdown, "modules": modules}


@app.post("/lesson-plan/save")
async def lesson_plan_save(req: SaveLessonPlanRequest):
    plan_id = await set_plan(req.title, req.plan)
    if req.modules:
        await save_modules(plan_id, req.modules)
        saved_modules = await get_modules(plan_id)
        await seed_artifacts(saved_modules)
    return {"id": plan_id}


@app.get("/lesson-plans")
async def lesson_plans_list():
    plans = await get_plans()
    return {"plans": plans}


@app.put("/lesson-plan/{plan_id}")
async def lesson_plan_update_status(plan_id: int, req: UpdatePlanStatusRequest):
    await update_plan_status(plan_id, req.status)
    return {"ok": True}


@app.delete("/lesson-plan/{plan_id}")
async def lesson_plan_delete(plan_id: int):
    await delete_plan(plan_id)
    return {"ok": True}


@app.get("/lesson-plan/{plan_id}/modules")
async def lesson_plan_modules(plan_id: int):
    modules = await get_modules(plan_id)
    return {"modules": modules}


@app.put("/module/{module_id}")
async def module_update(module_id: int, req: UpdateModuleRequest):
    fields = req.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    await update_module(module_id, fields)
    return {"ok": True}


@app.post("/module/{module_id}/complete")
async def module_complete(module_id: int):
    module = await get_module(module_id)
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    await complete_module(module_id)
    return {"ok": True}


@app.delete("/module/{module_id}")
async def module_delete(module_id: int):
    await delete_module(module_id)
    return {"ok": True}


@app.get("/module/{module_id}/artifacts")
async def module_artifacts(module_id: int):
    artifacts = await get_artifacts(module_id)
    return {"artifacts": artifacts}


@app.get("/artifact/{artifact_id}")
async def artifact_get(artifact_id: int):
    artifact = await get_artifact(artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return artifact


@app.put("/artifact/{artifact_id}")
async def artifact_update(artifact_id: int, req: UpdateArtifactRequest):
    await update_artifact(artifact_id, req.data)
    return {"ok": True}


@app.delete("/artifact/{artifact_id}")
async def artifact_delete(artifact_id: int):
    await delete_artifact(artifact_id)
    return {"ok": True}


@app.post("/artifact/{artifact_id}/generate")
async def artifact_generate(artifact_id: int):
    artifact = await get_artifact(artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    module = await get_module(artifact["module_id"])
    await generate_artifact(artifact, module)
    return await get_artifact(artifact_id)


# ── Modules (all) ─────────────────────────────────────────────────────────────

@app.get("/modules")
async def modules_all():
    return {"modules": await get_all_modules()}


# ── OAuth ──────────────────────────────────────────────────────────────────────

@app.get("/oauth/status")
async def oauth_status():
    return {"authenticated": google_calendar.is_authenticated()}


@app.get("/oauth/start")
async def oauth_start():
    global _oauth_flow
    if not _CREDENTIALS_FILE.exists():
        raise HTTPException(400, "credentials.json not found in backend/. See setup instructions.")
    _oauth_flow = Flow.from_client_secrets_file(
        str(_CREDENTIALS_FILE),
        scopes=_OAUTH_SCOPES,
        redirect_uri=_OAUTH_REDIRECT,
    )
    auth_url, _ = _oauth_flow.authorization_url(prompt="consent")
    return RedirectResponse(auth_url)


@app.get("/oauth/callback")
async def oauth_callback(code: str):
    global _oauth_flow
    if _oauth_flow is None:
        raise HTTPException(400, "No OAuth flow in progress. Visit /oauth/start first.")
    _oauth_flow.fetch_token(code=code)
    _TOKEN_FILE.write_text(_oauth_flow.credentials.to_json())
    _oauth_flow = None
    return {"ok": True, "message": "Authenticated! You can close this tab."}


# ── Calendar ───────────────────────────────────────────────────────────────────

@app.get("/calendar/events")
async def calendar_events(start: str, end: str):
    if not google_calendar.is_authenticated():
        raise HTTPException(401, "Google Calendar not connected.")
    return {"events": google_calendar.get_events(start, end)}


@app.post("/calendar/module-blocks")
async def calendar_create_module_block(req: CreateModuleBlockRequest):
    module = await get_module(req.module_id)
    if module is None:
        raise HTTPException(404, "Module not found")
    event_id = google_calendar.create_module_block(
        req.module_id, module["name"], req.start_time, req.end_time
    )
    return {"id": event_id}


@app.post("/calendar/habits")
async def calendar_create_habit(req: CreateHabitRequest):
    event_id = google_calendar.create_habit(
        req.title, req.days_of_week, req.start_time, req.duration_minutes
    )
    return {"id": event_id}


@app.delete("/calendar/events/{event_id:path}")
async def calendar_delete_event(event_id: str):
    google_calendar.delete_event(event_id)
    return {"ok": True}
