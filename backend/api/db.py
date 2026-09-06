import aiosqlite
from contextlib import asynccontextmanager

from backend.config import DATA_DIR

DB_PATH = DATA_DIR / "lesson-plan.db"


@asynccontextmanager
async def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        db.row_factory = aiosqlite.Row
        yield db
