import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)

from backend.claude_client import chat_stream, cleanup_mcp, init_mcp


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


@app.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest):
    return StreamingResponse(
        chat_stream(req.message, req.history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
