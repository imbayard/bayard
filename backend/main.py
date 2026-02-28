import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)

from backend.claude_client import chat_stream, cleanup_mcp, init_mcp
from backend.agents.course_planner import generate_lesson_plan
from backend.api.lesson_plan_store import create_table as create_plans_table, set_plan, get_plans, delete_plan, update_plan_status
from backend.api.module_store import (
    create_table as create_modules_table,
    save_modules,
    get_modules,
    get_module,
    update_module,
    delete_module,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_mcp()
    await create_plans_table()
    await create_modules_table()
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
    topic: str
    experience: str
    explore: str
    avoid: str
    harshness: str


class SaveLessonPlanRequest(BaseModel):
    title: str
    plan: str
    modules: list[dict] = []


class UpdateModuleRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    key_points: list[str] | None = None
    challenge: str | None = None


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
    markdown, modules = await generate_lesson_plan(
        topic=req.topic,
        experience=req.experience,
        explore=req.explore,
        avoid=req.avoid,
        harshness=req.harshness,
    )
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
    return {"id": plan_id}


@app.get("/lesson-plans")
async def lesson_plans_list():
    plans = await get_plans()
    return {"plans": plans}


@app.put("/lesson-plan/{plan_id}")
async def lesson_plan_update_status(plan_id: int, body: dict):
    await update_plan_status(plan_id, body["status"])
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


@app.delete("/module/{module_id}")
async def module_delete(module_id: int):
    await delete_module(module_id)
    return {"ok": True}
