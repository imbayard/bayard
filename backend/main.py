import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)

from backend.claude_client import chat_stream, cleanup_mcp, init_mcp
from backend.agents.course_planner import generate_lesson_plan
from backend.api.lesson_plan_store import create_table, set_plan, get_plans, delete_plan


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_mcp()
    await create_table()
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
    markdown = await generate_lesson_plan(
        topic=req.topic,
        experience=req.experience,
        explore=req.explore,
        avoid=req.avoid,
        harshness=req.harshness,
    )
    return {"markdown": markdown}


@app.post("/lesson-plan/save")
async def lesson_plan_save(req: SaveLessonPlanRequest):
    new_id = await set_plan(req.title, req.plan)
    return {"id": new_id}


@app.get("/lesson-plans")
async def lesson_plans_list():
    plans = await get_plans()
    return {"plans": plans}


@app.delete("/lesson-plan/{plan_id}")
async def lesson_plan_delete(plan_id: int):
    await delete_plan(plan_id)
    return {"ok": True}
