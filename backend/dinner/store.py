import json

from backend.config import DATA_DIR
from contextlib import asynccontextmanager

import aiosqlite

DB_PATH = DATA_DIR / "dinner.db"


@asynccontextmanager
async def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def create_table() -> None:
    async with get_db() as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                servings REAL NOT NULL,
                ingredients TEXT NOT NULL DEFAULT '[]',
                steps TEXT NOT NULL DEFAULT '[]',
                tags TEXT NOT NULL DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        await db.commit()


def _row_to_recipe(row: aiosqlite.Row) -> dict:
    d = dict(row)
    d["ingredients"] = json.loads(d["ingredients"])
    d["steps"] = json.loads(d["steps"])
    d["tags"] = json.loads(d["tags"])
    return d


async def create_recipe(
    name: str, servings: float, ingredients: list[dict], steps: list[str], tags: list[str]
) -> int:
    async with get_db() as db:
        cursor = await db.execute(
            "INSERT INTO recipes (name, servings, ingredients, steps, tags) VALUES (?, ?, ?, ?, ?)",
            (name, servings, json.dumps(ingredients), json.dumps(steps), json.dumps(tags)),
        )
        await db.commit()
        return cursor.lastrowid


async def get_recipes() -> list[dict]:
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM recipes ORDER BY name")
        return [_row_to_recipe(row) for row in await cursor.fetchall()]


async def get_recipe(recipe_id: int) -> dict | None:
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,))
        row = await cursor.fetchone()
        return _row_to_recipe(row) if row else None


async def update_recipe(
    recipe_id: int, name: str, servings: float, ingredients: list[dict], steps: list[str], tags: list[str]
) -> None:
    async with get_db() as db:
        await db.execute(
            "UPDATE recipes SET name = ?, servings = ?, ingredients = ?, steps = ?, tags = ? WHERE id = ?",
            (name, servings, json.dumps(ingredients), json.dumps(steps), json.dumps(tags), recipe_id),
        )
        await db.commit()


async def delete_recipe(recipe_id: int) -> None:
    async with get_db() as db:
        await db.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
        await db.commit()


async def suggest_ingredients(prefix: str) -> list[str]:
    """Distinct ingredient names seen across all recipes, prefix-matched.

    Recipe counts stay small for a single user, so scanning everything in
    Python beats maintaining a separate normalized ingredients table.
    """
    recipes = await get_recipes()
    names = {ing["name"] for r in recipes for ing in r["ingredients"]}
    prefix = prefix.lower()
    return sorted(n for n in names if n.lower().startswith(prefix))


async def suggest_tags(prefix: str) -> list[str]:
    recipes = await get_recipes()
    tags = {t for r in recipes for t in r["tags"]}
    prefix = prefix.lower()
    return sorted(t for t in tags if t.lower().startswith(prefix))
