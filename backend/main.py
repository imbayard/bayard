import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)

from backend.claude_client import chat_stream, cleanup_mcp, init_mcp
from backend.agents.course_planner import generate_lesson_plan


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_mcp()
    yield
    await cleanup_mcp()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    history: list = []


class LessonPlanRequest(BaseModel):
    topic: str
    experience: str
    explore: str
    avoid: str
    harshness: str


@app.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest):
    return StreamingResponse(
        chat_stream(req.message, req.history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/lesson-plan/generate")
async def lesson_plan_endpoint(req: LessonPlanRequest):
    markdown = await generate_lesson_plan(
        topic=req.topic,
        experience=req.experience,
        explore=req.explore,
        avoid=req.avoid,
        harshness=req.harshness,
    )
    return {"markdown": markdown}
