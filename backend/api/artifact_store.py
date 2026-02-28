import json
from backend.api.db import get_db


async def create_table() -> None:
    async with get_db() as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS artifacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                data TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        await db.commit()


async def save_artifacts(assignments: list[dict]) -> None:
    """Bulk insert artifact stubs. Each dict must have module_id and type."""
    async with get_db() as db:
        for a in assignments:
            await db.execute(
                "INSERT INTO artifacts (module_id, type) VALUES (?, ?)",
                (a["module_id"], a["type"]),
            )
        await db.commit()


async def get_artifacts(module_id: int) -> list[dict]:
    async with get_db() as db:
        async with db.execute(
            "SELECT * FROM artifacts WHERE module_id = ? ORDER BY id", (module_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d["data"] = json.loads(d["data"])
                result.append(d)
            return result


async def get_artifact(artifact_id: int) -> dict | None:
    async with get_db() as db:
        async with db.execute(
            "SELECT * FROM artifacts WHERE id = ?", (artifact_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            d = dict(row)
            d["data"] = json.loads(d["data"])
            return d


async def update_artifact(artifact_id: int, data: dict) -> None:
    async with get_db() as db:
        await db.execute(
            "UPDATE artifacts SET data = ? WHERE id = ?",
            (json.dumps(data), artifact_id),
        )
        await db.commit()


async def delete_artifact(artifact_id: int) -> None:
    async with get_db() as db:
        await db.execute("DELETE FROM artifacts WHERE id = ?", (artifact_id,))
        await db.commit()
