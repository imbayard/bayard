import json

from backend.config import DATA_DIR
from contextlib import asynccontextmanager

import aiosqlite

from .tags import TAG_REGISTRY, normalize_tag

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
        # Meal plans: every save is a new row, so past weeks stay as history.
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS meal_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                week_start TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS meal_plan_slots (
                plan_id INTEGER NOT NULL REFERENCES meal_plans(id),
                day INTEGER NOT NULL,
                meal TEXT NOT NULL,
                servings INTEGER NOT NULL,
                recipe_id INTEGER,
                source TEXT,
                source_day INTEGER,
                batch_servings REAL,
                flagged INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (plan_id, day, meal)
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
    """Registry tags first (even if unused yet), then everything else seen across recipes."""
    recipes = await get_recipes()
    tags = {t for r in recipes for t in r["tags"]}
    prefix = prefix.lower()
    registry = [t for t in TAG_REGISTRY if t.startswith(prefix)]
    others = sorted(t for t in tags if normalize_tag(t) not in TAG_REGISTRY and t.lower().startswith(prefix))
    return registry + others


async def save_plan(week_start: str, slots: list[dict]) -> int:
    async with get_db() as db:
        cursor = await db.execute("INSERT INTO meal_plans (week_start) VALUES (?)", (week_start,))
        plan_id = cursor.lastrowid
        await db.executemany(
            """INSERT INTO meal_plan_slots
               (plan_id, day, meal, servings, recipe_id, source, source_day, batch_servings, flagged)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (plan_id, s["day"], s["meal"], s["servings"], s["recipe_id"], s["source"],
                 s["source_day"], s["batch_servings"], int(s["flagged"]))
                for s in slots
            ],
        )
        await db.commit()
        return plan_id


async def get_plans(week_start: str | None = None) -> list[dict]:
    """Saved plans, newest first — optionally just the ones for one week."""
    query = "SELECT * FROM meal_plans"
    params: tuple = ()
    if week_start:
        query += " WHERE week_start = ?"
        params = (week_start,)
    async with get_db() as db:
        cursor = await db.execute(query + " ORDER BY id DESC", params)
        return [dict(row) for row in await cursor.fetchall()]


async def get_plan(plan_id: int) -> dict | None:
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM meal_plans WHERE id = ?", (plan_id,))
        plan = await cursor.fetchone()
        if plan is None:
            return None
        cursor = await db.execute(
            "SELECT * FROM meal_plan_slots WHERE plan_id = ? ORDER BY meal DESC, day", (plan_id,)
        )
        slots = [dict(row) | {"flagged": bool(row["flagged"])} for row in await cursor.fetchall()]
        for s in slots:
            del s["plan_id"]
        return dict(plan) | {"slots": slots}
