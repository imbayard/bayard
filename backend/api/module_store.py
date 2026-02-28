import json
import pathlib
import aiosqlite

DB_PATH = pathlib.Path(__file__).parent.parent / "data" / "lesson-plan.db"


async def create_table() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                key_points TEXT NOT NULL,
                challenge TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        await db.commit()


async def save_modules(plan_id: int, modules: list[dict]) -> None:
    """Bulk insert modules for a plan."""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        for i, m in enumerate(modules):
            await db.execute(
                """INSERT INTO modules (plan_id, position, name, description, key_points, challenge)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (plan_id, i + 1, m["name"], m["description"], json.dumps(m["key_points"]), m["challenge"]),
            )
        await db.commit()


async def get_modules(plan_id: int) -> list[dict]:
    """Return all modules for a plan ordered by position."""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM modules WHERE plan_id = ? ORDER BY position", (plan_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d["key_points"] = json.loads(d["key_points"])
                result.append(d)
            return result


async def get_module(module_id: int) -> dict | None:
    """Return a single module by id."""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM modules WHERE id = ?", (module_id,)) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            d = dict(row)
            d["key_points"] = json.loads(d["key_points"])
            return d


async def update_module(module_id: int, fields: dict) -> None:
    """Partial update — only name, description, key_points, challenge are writable."""
    allowed = {"name", "description", "key_points", "challenge"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    if "key_points" in updates:
        updates["key_points"] = json.dumps(updates["key_points"])
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [module_id]
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute(f"UPDATE modules SET {set_clause} WHERE id = ?", values)
        await db.commit()


async def delete_module(module_id: int) -> None:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("DELETE FROM modules WHERE id = ?", (module_id,))
        await db.commit()
