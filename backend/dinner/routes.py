import datetime
import random
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import planner, shopping, store
from .tags import normalize_tags

router = APIRouter(prefix="/dinner")


class Ingredient(BaseModel):
    qty: str
    unit: str
    name: str
    optional: bool = False


class RecipeIn(BaseModel):
    name: str
    servings: float
    ingredients: list[Ingredient]
    steps: list[str]
    tags: list[str] = []


class PlanSlot(BaseModel):
    day: int
    meal: Literal["lunch", "dinner"]
    servings: int = 0
    recipe_id: int | None = None
    source: Literal["generated", "leftover", "manual"] | None = None
    source_day: int | None = None
    batch_servings: float | None = None
    flagged: bool = False
    swapped_out: list[int] = []


class GenerateIn(BaseModel):
    slots: list[PlanSlot]
    mode: Literal["generate", "fill"] = "generate"
    seed: int | None = None
    prefs: list[int] = []  # the draft's selected tag ids; empty = no constraint


class SlotActionIn(BaseModel):
    slots: list[PlanSlot]
    day: int
    meal: Literal["lunch", "dinner"] = "dinner"
    to_day: int | None = None
    recipe_id: int | None = None
    prefs: list[int] = []  # honored by swap only; manual picks are a free override


class PreferencesIn(BaseModel):
    tag_ids: list[int]


class PlanIn(BaseModel):
    week_start: datetime.date
    slots: list[PlanSlot]


class TagIn(BaseModel):
    name: str
    category_id: int | None = None


class TagPatch(BaseModel):
    """Send `name` to rename, `category_id` (null = uncategorized) to move; omitted = unchanged."""
    name: str | None = None
    category_id: int | None = None


class CategoryIn(BaseModel):
    name: str


class ShoppingStateIn(BaseModel):
    week: datetime.date
    key: str
    status: Literal["checked", "removed"] | None = None


class StapleIn(BaseModel):
    name: str
    quantity: str = ""
    unit: str = ""

    def clean(self) -> tuple[str, str | None, str | None]:
        name = self.name.strip()
        if not name:
            raise HTTPException(422, "Staple name is required.")
        return name, self.quantity.strip() or None, self.unit.strip() or None


async def _plan(action, slots: list[PlanSlot], *args, prefs: list[int] | None = None) -> list[dict]:
    """Run a planner action on the client's draft against the current recipe box.
    With `prefs` (tag ids) the action also gets them grouped by category plus the registry lookup."""
    kwargs = {"prefs": await store.pref_groups(prefs), "cats": await store.tag_categories()} if prefs else {}
    try:
        return action([s.model_dump() for s in slots], await store.get_recipes(), *args, **kwargs)
    except planner.PlanError as e:
        raise HTTPException(409, str(e))


@router.get("/recipes")
async def list_recipes():
    return await store.get_recipes()


@router.post("/recipes")
async def create_recipe(recipe: RecipeIn):
    recipe_id = await store.create_recipe(
        recipe.name,
        recipe.servings,
        [i.model_dump() for i in recipe.ingredients],
        recipe.steps,
        normalize_tags(recipe.tags, await store.registry_names()),
    )
    return await store.get_recipe(recipe_id)


@router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: int):
    recipe = await store.get_recipe(recipe_id)
    if recipe is None:
        raise HTTPException(404, "Recipe not found.")
    return recipe


@router.put("/recipes/{recipe_id}")
async def update_recipe(recipe_id: int, recipe: RecipeIn):
    if await store.get_recipe(recipe_id) is None:
        raise HTTPException(404, "Recipe not found.")
    await store.update_recipe(
        recipe_id,
        recipe.name,
        recipe.servings,
        [i.model_dump() for i in recipe.ingredients],
        recipe.steps,
        normalize_tags(recipe.tags, await store.registry_names()),
    )
    return await store.get_recipe(recipe_id)


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: int):
    await store.delete_recipe(recipe_id)
    return {"ok": True}


@router.get("/ingredients")
async def suggest_ingredients(q: str = ""):
    return await store.suggest_ingredients(q)


@router.get("/tags")
async def suggest_tags(q: str = ""):
    return await store.suggest_tags(q)


async def _registry(write, *args):
    """Run a registry write, map rule violations to HTTP errors, answer with the fresh registry."""
    try:
        await write(*args)
    except store.TagError as e:
        raise HTTPException(e.status, str(e))
    return await store.get_registry()


@router.get("/tag-registry")
async def tag_registry():
    return await store.get_registry()


@router.post("/tag-registry/tags")
async def create_tag(body: TagIn):
    """Create a tag — or adopt a free-form one in use — optionally straight into a category."""
    return await _registry(store.create_tag, body.name, body.category_id)


@router.patch("/tag-registry/tags/{tag_id}")
async def update_tag(tag_id: int, body: TagPatch):
    set_category = "category_id" in body.model_fields_set
    return await _registry(store.update_tag, tag_id, body.name, body.category_id, set_category)


@router.delete("/tag-registry/tags/{tag_id}")
async def delete_tag(tag_id: int):
    return await _registry(store.delete_tag, tag_id)


@router.post("/tag-registry/categories")
async def create_category(body: CategoryIn):
    return await _registry(store.create_category, body.name)


@router.patch("/tag-registry/categories/{category_id}")
async def rename_category(category_id: int, body: CategoryIn):
    return await _registry(store.rename_category, category_id, body.name)


@router.delete("/tag-registry/categories/{category_id}")
async def delete_category(category_id: int):
    """Its tags stay, uncategorized."""
    return await _registry(store.delete_category, category_id)


# Plan drafts live client-side; these endpoints are stateless — draft in, new draft out.


@router.get("/preferences")
async def get_preferences():
    """Standing defaults a new week's draft starts from: selected tag ids."""
    return {"tag_ids": await store.get_preferences()}


@router.put("/preferences")
async def set_preferences(body: PreferencesIn):
    """Replace the defaults ("Save as default"). Unknown ids are dropped."""
    await store.set_preferences(body.tag_ids)
    return {"tag_ids": await store.get_preferences()}


@router.post("/plan/generate")
async def generate_plan(body: GenerateIn):
    return await _plan(planner.generate, body.slots, body.mode, random.Random(body.seed), prefs=body.prefs)


@router.post("/plan/swap")
async def swap_dinner(body: SlotActionIn):
    return await _plan(planner.swap_dinner, body.slots, body.day, prefs=body.prefs)


@router.post("/plan/leftover/delete")
async def delete_leftover(body: SlotActionIn):
    return await _plan(planner.delete_leftover, body.slots, body.day)


@router.post("/plan/leftover/move")
async def move_leftover(body: SlotActionIn):
    if body.to_day is None:
        raise HTTPException(422, "to_day is required.")
    return await _plan(planner.move_leftover, body.slots, body.day, body.to_day)


@router.post("/plan/pick")
async def manual_pick(body: SlotActionIn):
    if body.recipe_id is None:
        raise HTTPException(422, "recipe_id is required.")
    return await _plan(planner.manual_pick, body.slots, body.day, body.meal, body.recipe_id)


@router.post("/plans")
async def save_plan(body: PlanIn):
    if body.week_start.weekday() != 6:
        raise HTTPException(422, "week_start must be a Sunday.")
    try:
        slots = planner.finalize([s.model_dump() for s in body.slots])
    except planner.PlanError as e:
        raise HTTPException(409, str(e))
    plan_id = await store.save_plan(body.week_start.isoformat(), slots)
    return await store.get_plan(plan_id)


@router.get("/plans")
async def list_plans(week: datetime.date | None = None):
    return await store.get_plans(week.isoformat() if week else None)


@router.get("/plans/{plan_id}")
async def get_plan(plan_id: int):
    plan = await store.get_plan(plan_id)
    if plan is None:
        raise HTTPException(404, "Plan not found.")
    return plan


@router.get("/shopping-list")
async def shopping_list(week: datetime.date):
    """The week's latest saved plan, dumped into a list, staples appended, with check-off state merged in.

    No saved plan → no list at all, staples included: the list is rebuilt from the plan.
    """
    plans = await store.get_plans(week.isoformat())
    if not plans:
        return {"plan_id": None, "recipes": [], "items": []}
    plan = await store.get_plan(plans[0]["id"])
    state = await store.get_shopping_state(week.isoformat())
    built = shopping.build(plan["slots"], await store.get_recipes())
    items = built["items"] + shopping.staples_section(await store.get_staples())
    return {
        "plan_id": plan["id"],
        "recipes": built["recipes"],
        "items": [i | {"status": state.get(i["key"])} for i in items],
    }


@router.put("/shopping-list/item")
async def set_shopping_item(body: ShoppingStateIn):
    await store.set_shopping_state(body.week.isoformat(), body.key, body.status)
    return {"ok": True}


@router.get("/staples")
async def list_staples():
    return await store.get_staples()


@router.post("/staples")
async def create_staple(body: StapleIn):
    return await store.get_staple(await store.create_staple(*body.clean()))


@router.put("/staples/{staple_id}")
async def update_staple(staple_id: int, body: StapleIn):
    if await store.get_staple(staple_id) is None:
        raise HTTPException(404, "Staple not found.")
    await store.update_staple(staple_id, *body.clean())
    return await store.get_staple(staple_id)


@router.delete("/staples/{staple_id}")
async def delete_staple(staple_id: int):
    await store.delete_staple(staple_id)
    return {"ok": True}
