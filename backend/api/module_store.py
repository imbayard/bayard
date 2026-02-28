from backend.api.db import get_db


async def create_table() -> None:
    async with get_db() as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'locked',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        await db.commit()


async def save_modules(plan_id: int, modules: list[dict]) -> None:
    """Bulk insert modules for a plan."""
    async with get_db() as db:
        for i, m in enumerate(modules):
            await db.execute(
                """INSERT INTO modules (plan_id, position, name, description, type, status)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (plan_id, i + 1, m["name"], m["description"], m["type"], "locked"),
            )
        await db.commit()


async def get_modules(plan_id: int) -> list[dict]:
    """Return all modules for a plan ordered by position."""
    async with get_db() as db:
        async with db.execute(
            "SELECT * FROM modules WHERE plan_id = ? ORDER BY position", (plan_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def get_module(module_id: int) -> dict | None:
    """Return a single module by id."""
    async with get_db() as db:
        async with db.execute("SELECT * FROM modules WHERE id = ?", (module_id,)) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            return dict(row)


async def update_module(module_id: int, fields: dict) -> None:
    """Partial update — only name, description, type, status are writable."""
    allowed = {"name", "description", "type", "status"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [module_id]
    async with get_db() as db:
        await db.execute(f"UPDATE modules SET {set_clause} WHERE id = ?", values)
        await db.commit()


async def delete_module(module_id: int) -> None:
    async with get_db() as db:
        await db.execute("DELETE FROM modules WHERE id = ?", (module_id,))
        await db.commit()
