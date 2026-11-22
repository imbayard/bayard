import json

from backend.config import DATA_DIR
from contextlib import asynccontextmanager

import aiosqlite

from .tags import (
    DINNER_TAG,
    LUNCH_TAG,
    MEAL_CATEGORY,
    PROTECTED_CATEGORIES,
    PROTECTED_TAGS,
    SEED,
    clean_name,
    tag_key,
)

DB_PATH = DATA_DIR / "dinner.db"


class TagError(Exception):
    """Registry rule broken; `status` is the HTTP code the route should answer with."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


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
        # Check-off state lives per week, not per plan, so re-saving the plan keeps it.
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS shopping_item_state (
                week_start TEXT NOT NULL,
                item_key TEXT NOT NULL,
                status TEXT NOT NULL,
                PRIMARY KEY (week_start, item_key)
            )"""
        )
        # Tag registry. Recipes reference tags by name (JSON list), not by id.
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS tag_categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE
            )"""
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                category_id INTEGER REFERENCES tag_categories(id)
            )"""
        )
        await _seed_registry(db)
        await db.commit()


async def _category_id(db: aiosqlite.Connection, name: str) -> int:
    await db.execute("INSERT OR IGNORE INTO tag_categories (name) VALUES (?)", (name,))
    cursor = await db.execute("SELECT id FROM tag_categories WHERE name = ?", (name,))
    return (await cursor.fetchone())["id"]


async def _seed_registry(db: aiosqlite.Connection) -> None:
    """Starter tags only into an empty registry (never clobbers edits); protected rows always."""
    cursor = await db.execute("SELECT COUNT(*) FROM tags")
    if (await cursor.fetchone())[0] == 0:
        for category, names in SEED.items():
            category_id = await _category_id(db, category) if category else None
            await db.executemany(
                "INSERT OR IGNORE INTO tags (name, category_id) VALUES (?, ?)",
                [(n, category_id) for n in names],
            )
    meal_id = await _category_id(db, MEAL_CATEGORY)
    await db.executemany("INSERT OR IGNORE INTO tags (name) VALUES (?)", [(t,) for t in PROTECTED_TAGS])
    await db.execute(
        "UPDATE tags SET category_id = ? WHERE name IN (?, ?)", (meal_id, LUNCH_TAG, DINNER_TAG)
    )


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


async def suggest_tags(prefix: str) -> list[dict]:
    """Registry tags first (even if unused yet, with their category), then free-form ones seen
    across recipes. Each item: {"name", "category"} — category is None when uncategorized/free-form."""
    categories = await tag_categories()
    registered = {tag_key(t) for t in categories}
    prefix = tag_key(prefix)
    registry = [
        {"name": t, "category": c}
        for t, c in sorted(categories.items(), key=lambda kv: kv[0].lower())
        if tag_key(t).startswith(prefix)
    ]
    seen = {tag_key(t): t for r in await get_recipes() for t in r["tags"]}
    others = sorted(
        (t for k, t in seen.items() if k not in registered and k.startswith(prefix)), key=str.lower
    )
    return registry + [{"name": t, "category": None} for t in others]


# --- Tag registry -----------------------------------------------------------------------------
# Reads hand plain data to the route layer (planner.py stays I/O-free). Writes enforce the
# protected rows and cascade name changes into recipes.tags inside the same transaction.


async def registry_names() -> list[str]:
    """Canonical spellings of every registry tag — pass to tags.normalize_tags()."""
    return list(await tag_categories())


async def tag_categories() -> dict[str, str | None]:
    """Registry tag name → its category name (None if uncategorized)."""
    async with get_db() as db:
        cursor = await db.execute(
            """SELECT t.name, c.name AS category FROM tags t
               LEFT JOIN tag_categories c ON c.id = t.category_id ORDER BY t.id"""
        )
        return {row["name"]: row["category"] for row in await cursor.fetchall()}


async def get_registry() -> dict:
    """Editor/checklist view: categories (with their tags), uncategorized tags, and free-form
    tags in use. Tags carry `recipe_count` so the UI can confirm deletes."""
    counts: dict[str, int] = {}
    spelling: dict[str, str] = {}
    for r in await get_recipes():
        for k in {tag_key(t) for t in r["tags"]}:
            counts[k] = counts.get(k, 0) + 1
        for t in r["tags"]:
            spelling.setdefault(tag_key(t), t)
    protected_tags = {tag_key(t) for t in PROTECTED_TAGS}
    protected_cats = {tag_key(c) for c in PROTECTED_CATEGORIES}
    async with get_db() as db:
        cats = await (await db.execute("SELECT id, name FROM tag_categories ORDER BY id")).fetchall()
        tags = await (await db.execute("SELECT id, name, category_id FROM tags ORDER BY id")).fetchall()
    out_tags = [
        dict(t) | {"protected": tag_key(t["name"]) in protected_tags, "recipe_count": counts.get(tag_key(t["name"]), 0)}
        for t in tags
    ]
    registered = {tag_key(t["name"]) for t in tags}
    return {
        "categories": [
            dict(c)
            | {
                "protected": tag_key(c["name"]) in protected_cats,
                "tags": [t for t in out_tags if t["category_id"] == c["id"]],
            }
            for c in cats
        ],
        "uncategorized": [t for t in out_tags if t["category_id"] is None],
        "free_form": sorted(
            ({"name": spelling[k], "recipe_count": n} for k, n in counts.items() if k not in registered),
            key=lambda t: t["name"].lower(),
        ),
    }


async def _rewrite_recipe_tags(db: aiosqlite.Connection, old: str, new: str | None) -> int:
    """Replace (or with None, strip) every spelling of `old` in recipes.tags. Returns recipes touched."""
    key = tag_key(old)
    touched = 0
    for row in await (await db.execute("SELECT id, tags FROM recipes")).fetchall():
        tags = json.loads(row["tags"])
        if not any(tag_key(t) == key for t in tags):
            continue
        rewritten = [new if tag_key(t) == key else t for t in tags]
        rewritten = list(dict.fromkeys(t for t in rewritten if t is not None))
        if rewritten != tags:
            await db.execute("UPDATE recipes SET tags = ? WHERE id = ?", (json.dumps(rewritten), row["id"]))
            touched += 1
    return touched


async def _fetch(db: aiosqlite.Connection, table: str, row_id: int) -> aiosqlite.Row:
    row = await (await db.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,))).fetchone()
    if row is None:
        raise TagError(404, "Tag not found." if table == "tags" else "Category not found.")
    return row


async def _check_free(db: aiosqlite.Connection, table: str, name: str, row_id: int | None = None) -> str:
    """Cleaned name, or TagError if empty or another row already has it (case-insensitive)."""
    name = clean_name(name)
    if not name:
        raise TagError(422, "Name is required.")
    row = await (await db.execute(f"SELECT id FROM {table} WHERE name = ?", (name,))).fetchone()
    if row is not None and row["id"] != row_id:
        raise TagError(409, f"“{name}” already exists.")
    return name


def _protected_tag(name: str) -> bool:
    return tag_key(name) in {tag_key(t) for t in PROTECTED_TAGS}


def _protected_category(name: str) -> bool:
    return tag_key(name) in {tag_key(c) for c in PROTECTED_CATEGORIES}


async def create_tag(name: str, category_id: int | None = None) -> int:
    """Add a tag. Naming a free-form tag already in use adopts it: recipes take the new spelling."""
    async with get_db() as db:
        name = await _check_free(db, "tags", name)
        if category_id is not None:
            await _fetch(db, "tag_categories", category_id)
        cursor = await db.execute("INSERT INTO tags (name, category_id) VALUES (?, ?)", (name, category_id))
        await _rewrite_recipe_tags(db, name, name)
        await db.commit()
        return cursor.lastrowid


async def update_tag(tag_id: int, name: str | None = None, category_id: int | None = None,
                     set_category: bool = False) -> None:
    """Rename (cascades to recipes) and/or move to a category (`set_category`; None = uncategorized).
    Protected tags can't be renamed or recategorized."""
    async with get_db() as db:
        tag = await _fetch(db, "tags", tag_id)
        if _protected_tag(tag["name"]):
            raise TagError(400, f"“{tag['name']}” is a built-in tag and can't be changed.")
        if set_category:
            if category_id is not None:
                await _fetch(db, "tag_categories", category_id)
            await db.execute("UPDATE tags SET category_id = ? WHERE id = ?", (category_id, tag_id))
        if name is not None:
            name = await _check_free(db, "tags", name, tag_id)
            await db.execute("UPDATE tags SET name = ? WHERE id = ?", (name, tag_id))
            await _rewrite_recipe_tags(db, tag["name"], name)
            await _rewrite_recipe_tags(db, name, name)  # free-form spellings of the new name merge in
        await db.commit()


async def delete_tag(tag_id: int) -> int:
    """Remove a tag from the registry and strip it from every recipe. Returns recipes touched."""
    async with get_db() as db:
        tag = await _fetch(db, "tags", tag_id)
        if _protected_tag(tag["name"]):
            raise TagError(400, f"“{tag['name']}” is a built-in tag and can't be deleted.")
        await db.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
        touched = await _rewrite_recipe_tags(db, tag["name"], None)
        await db.commit()
        return touched


async def create_category(name: str) -> int:
    async with get_db() as db:
        name = await _check_free(db, "tag_categories", name)
        cursor = await db.execute("INSERT INTO tag_categories (name) VALUES (?)", (name,))
        await db.commit()
        return cursor.lastrowid


async def rename_category(category_id: int, name: str) -> None:
    async with get_db() as db:
        category = await _fetch(db, "tag_categories", category_id)
        if _protected_category(category["name"]):
            raise TagError(400, f"“{category['name']}” is a built-in category and can't be renamed.")
        name = await _check_free(db, "tag_categories", name, category_id)
        await db.execute("UPDATE tag_categories SET name = ? WHERE id = ?", (name, category_id))
        await db.commit()


async def delete_category(category_id: int) -> None:
    """Delete a category; its tags stay, uncategorized."""
    async with get_db() as db:
        category = await _fetch(db, "tag_categories", category_id)
        if _protected_category(category["name"]):
            raise TagError(400, f"“{category['name']}” is a built-in category and can't be deleted.")
        await db.execute("UPDATE tags SET category_id = NULL WHERE category_id = ?", (category_id,))
        await db.execute("DELETE FROM tag_categories WHERE id = ?", (category_id,))
        await db.commit()


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


async def get_shopping_state(week_start: str) -> dict[str, str]:
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT item_key, status FROM shopping_item_state WHERE week_start = ?", (week_start,)
        )
        return {row["item_key"]: row["status"] for row in await cursor.fetchall()}


async def set_shopping_state(week_start: str, item_key: str, status: str | None) -> None:
    async with get_db() as db:
        if status is None:
            await db.execute(
                "DELETE FROM shopping_item_state WHERE week_start = ? AND item_key = ?", (week_start, item_key)
            )
        else:
            await db.execute(
                """INSERT INTO shopping_item_state (week_start, item_key, status) VALUES (?, ?, ?)
                   ON CONFLICT (week_start, item_key) DO UPDATE SET status = excluded.status""",
                (week_start, item_key, status),
            )
        await db.commit()
