import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

logging.basicConfig(level=logging.INFO)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.claude_client import chat, cleanup_mcp, init_mcp


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


class ChatResponse(BaseModel):
    response: str


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    response = await chat(req.message, req.history)
    return ChatResponse(response=response)
