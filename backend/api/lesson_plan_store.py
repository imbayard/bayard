import aiosqlite
from backend.api.db import get_db


async def create_table() -> None:
    async with get_db() as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS lesson_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                plan TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        # Migrate existing DBs that don't have the status column yet
        try:
            await db.execute("ALTER TABLE lesson_plans ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
        except aiosqlite.OperationalError:
            pass  # column already exists
        await db.commit()


async def set_plan(title: str, plan: str) -> int:
    """Insert a lesson plan and return its new id."""
    async with get_db() as db:
        cursor = await db.execute(
            "INSERT INTO lesson_plans (title, plan) VALUES (?, ?)",
            (title, plan),
        )
        await db.commit()
        return cursor.lastrowid


async def update_plan_status(plan_id: int, status: str) -> None:
    """Update the status of a lesson plan. Valid values: 'active', 'completed'."""
    if status not in ("active", "completed"):
        raise ValueError(f"Invalid status: {status!r}")
    async with get_db() as db:
        await db.execute(
            "UPDATE lesson_plans SET status = ? WHERE id = ?",
            (status, plan_id),
        )
        await db.commit()


async def delete_plan(plan_id: int) -> None:
    """Delete a lesson plan by id. Foreign key cascade removes associated modules."""
    async with get_db() as db:
        await db.execute("DELETE FROM lesson_plans WHERE id = ?", (plan_id,))
        await db.commit()


async def get_plans() -> list[dict]:
    """Return all lesson plans ordered newest first."""
    async with get_db() as db:
        async with db.execute(
            "SELECT id, title, plan, status, created_at FROM lesson_plans ORDER BY created_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
