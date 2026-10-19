from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import store

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
        recipe.tags,
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
        recipe.tags,
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
