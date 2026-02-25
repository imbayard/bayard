import pathlib
import aiosqlite

DB_PATH = pathlib.Path(__file__).parent.parent / "data" / "lesson-plan.db"


async def create_table() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS lesson_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                plan TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        await db.commit()


async def set_plan(title: str, plan: str) -> int:
    """Insert a lesson plan and return its new id."""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute(
            "INSERT INTO lesson_plans (title, plan) VALUES (?, ?)",
            (title, plan),
        )
        await db.commit()
        return cursor.lastrowid


async def delete_plan(plan_id: int) -> None:
    """Delete a lesson plan by id. Foreign key cascade removes associated modules."""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("DELETE FROM lesson_plans WHERE id = ?", (plan_id,))
        await db.commit()


async def get_plans() -> list[dict]:
    """Return all lesson plans ordered newest first."""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, title, plan, created_at FROM lesson_plans ORDER BY created_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
