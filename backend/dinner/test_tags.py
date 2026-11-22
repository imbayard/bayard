"""Tag registry tests. Run: python -m pytest backend/dinner/test_tags.py

Each test gets a fresh temp dinner.db (store.DB_PATH patched) — never the real data/dinner.db.
"""

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from . import store
from .routes import router
from .tags import DINNER_TAG, LUNCH_TAG, MEAL_PREP_TAG, normalize_tag, normalize_tags


def run(coro):
    return asyncio.run(coro)


class TempDB(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        patcher = mock.patch.object(store, "DB_PATH", Path(tmp.name) / "dinner.db")
        patcher.start()
        self.addCleanup(patcher.stop)
        run(store.create_table())

    def tag_id(self, name: str) -> int:
        reg = run(store.get_registry())
        tags = reg["uncategorized"] + [t for c in reg["categories"] for t in c["tags"]]
        return next(t["id"] for t in tags if t["name"] == name)

    def category_id(self, name: str) -> int:
        return next(c["id"] for c in run(store.get_registry())["categories"] if c["name"] == name)

    def recipe(self, *tags: str) -> int:
        return run(store.create_recipe("r", 2, [], [], list(tags)))

    def tags_of(self, recipe_id: int) -> list[str]:
        return run(store.get_recipe(recipe_id))["tags"]


class Seed(TempDB):
    def test_starter_registry(self):
        cats = run(store.tag_categories())
        self.assertEqual(cats[LUNCH_TAG], "meal")
        self.assertEqual(cats[DINNER_TAG], "meal")
        self.assertEqual(cats["cold"], "temperature")
        self.assertEqual(cats["Mexican"], "cuisine")
        self.assertIsNone(cats[MEAL_PREP_TAG])

    def test_idempotent_and_keeps_edits(self):
        run(store.delete_tag(self.tag_id("Mexican")))
        run(store.update_tag(self.tag_id("hot"), name="spicy"))
        run(store.create_table())
        run(store.create_table())
        cats = run(store.tag_categories())
        self.assertNotIn("Mexican", cats)
        self.assertNotIn("hot", cats)
        self.assertIn("spicy", cats)
        self.assertEqual(len(cats), 11)  # 12 starters, one deleted, nothing re-seeded

    def test_protected_rows_restored(self):
        # Someone deleting rows behind the app's back: startup puts the protected ones back.
        async def wipe():
            async with store.get_db() as db:
                await db.execute("DELETE FROM tags WHERE name IN ('lunch', 'good for meal prep')")
                await db.execute("DELETE FROM tag_categories WHERE name = 'meal'")
                await db.commit()

        run(wipe())
        run(store.create_table())
        cats = run(store.tag_categories())
        self.assertEqual(cats[LUNCH_TAG], "meal")
        self.assertEqual(cats[DINNER_TAG], "meal")
        self.assertIn(MEAL_PREP_TAG, cats)


class Protected(TempDB):
    def assertStatus(self, status, coro):
        with self.assertRaises(store.TagError) as cm:
            run(coro)
        self.assertEqual(cm.exception.status, status)

    def test_tags(self):
        for name in (MEAL_PREP_TAG, LUNCH_TAG, DINNER_TAG):
            self.assertStatus(400, store.update_tag(self.tag_id(name), name="x"))
            self.assertStatus(400, store.update_tag(self.tag_id(name), category_id=None, set_category=True))
            self.assertStatus(400, store.delete_tag(self.tag_id(name)))

    def test_meal_category(self):
        meal = self.category_id("meal")
        self.assertStatus(400, store.rename_category(meal, "meals"))
        self.assertStatus(400, store.delete_category(meal))

    def test_starters_editable(self):
        run(store.update_tag(self.tag_id("Asian"), name="Thai"))
        run(store.rename_category(self.category_id("temperature"), "temp"))
        self.assertEqual(run(store.tag_categories())["Thai"], "cuisine")
        self.assertEqual(run(store.tag_categories())["cold"], "temp")

    def test_duplicates_rejected(self):
        self.assertStatus(409, store.create_tag("  MEXICAN "))
        self.assertStatus(409, store.update_tag(self.tag_id("hot"), name="Cold"))
        self.assertStatus(409, store.create_category("Cuisine"))
        self.assertStatus(422, store.create_tag("  "))

    def test_route_answers_400(self):
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        response = client.delete(f"/dinner/tag-registry/tags/{self.tag_id(LUNCH_TAG)}")
        self.assertEqual(response.status_code, 400)
        response = client.patch(f"/dinner/tag-registry/categories/{self.category_id('meal')}", json={"name": "x"})
        self.assertEqual(response.status_code, 400)


class Cascades(TempDB):
    def test_rename_rewrites_recipes(self):
        a = self.recipe("mexican", "hot")
        b = self.recipe("Tex Mex", "Mexican")  # rename onto a free-form spelling merges, no dupes
        c = self.recipe("cold")
        run(store.update_tag(self.tag_id("Mexican"), name="tex mex"))
        self.assertEqual(self.tags_of(a), ["tex mex", "hot"])
        self.assertEqual(self.tags_of(b), ["tex mex"])
        self.assertEqual(self.tags_of(c), ["cold"])

    def test_delete_strips(self):
        a = self.recipe("Italian", "hot")
        b = self.recipe("italian")
        self.assertEqual(self.tag_count("Italian"), 2)
        self.assertEqual(run(store.delete_tag(self.tag_id("Italian"))), 2)
        self.assertEqual(self.tags_of(a), ["hot"])
        self.assertEqual(self.tags_of(b), [])

    def tag_count(self, name: str) -> int:
        reg = run(store.get_registry())
        tags = reg["uncategorized"] + [t for c in reg["categories"] for t in c["tags"]]
        return next(t["recipe_count"] for t in tags if t["name"] == name)

    def test_category_delete_uncategorizes(self):
        run(store.delete_category(self.category_id("cuisine")))
        cats = run(store.tag_categories())
        self.assertIsNone(cats["Mexican"])
        self.assertNotIn("cuisine", [c["name"] for c in run(store.get_registry())["categories"]])

    def test_adopt_free_form(self):
        r = self.recipe("Weeknight", "WEEKNIGHT ")
        self.assertEqual(run(store.get_registry())["free_form"], [{"name": "Weeknight", "recipe_count": 1}])
        run(store.create_tag("weeknight", self.category_id("meal")))
        self.assertEqual(self.tags_of(r), ["weeknight"])
        self.assertEqual(run(store.tag_categories())["weeknight"], "meal")
        self.assertEqual(run(store.get_registry())["free_form"], [])

    def test_patch_route_omitted_vs_null(self):
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        tag = self.tag_id("hot")
        client.patch(f"/dinner/tag-registry/tags/{tag}", json={"name": "Spicy"})
        self.assertEqual(run(store.tag_categories())["Spicy"], "temperature")  # category untouched
        reg = client.patch(f"/dinner/tag-registry/tags/{tag}", json={"category_id": None}).json()
        self.assertIn("Spicy", [t["name"] for t in reg["uncategorized"]])

    def test_assign_and_unassign_category(self):
        tag = self.tag_id("hot")
        run(store.update_tag(tag, category_id=self.category_id("cuisine"), set_category=True))
        self.assertEqual(run(store.tag_categories())["hot"], "cuisine")
        run(store.update_tag(tag, category_id=None, set_category=True))
        self.assertIsNone(run(store.tag_categories())["hot"])


class Normalize(TempDB):
    def test_against_db(self):
        registry = run(store.registry_names())
        self.assertEqual(normalize_tag("  good  FOR meal prep ", registry), MEAL_PREP_TAG)
        self.assertEqual(normalize_tag("mexican", registry), "Mexican")
        self.assertEqual(normalize_tag(" Weeknight ", registry), "Weeknight")
        run(store.update_tag(self.tag_id("Mexican"), name="Tex-Mex"))
        self.assertEqual(normalize_tag("tex-mex", run(store.registry_names())), "Tex-Mex")
        self.assertEqual(normalize_tags(["LUNCH", "lunch", " ", "Dinner"], registry), [LUNCH_TAG, DINNER_TAG])

    def test_default_registry_is_protected_tags(self):
        # planner.py calls normalize_tag without a registry; meal prep must still match.
        self.assertEqual(normalize_tag("Good For Meal Prep"), MEAL_PREP_TAG)

    def test_recipe_routes_normalize(self):
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        body = {"name": "Chili", "servings": 4, "ingredients": [], "steps": [],
                "tags": ["Good For Meal Prep", "mexican", "Weeknight"]}
        created = client.post("/dinner/recipes", json=body).json()
        self.assertEqual(created["tags"], [MEAL_PREP_TAG, "Mexican", "Weeknight"])
        updated = client.put(f"/dinner/recipes/{created['id']}", json=body | {"tags": ["GOOD FOR MEAL PREP"]}).json()
        self.assertEqual(updated["tags"], [MEAL_PREP_TAG])


class Suggest(TempDB):
    def test_registry_first_with_category(self):
        self.recipe("aardvark", "mexican", "zesty")
        names = run(store.suggest_tags(""))
        registry_count = len(run(store.registry_names()))
        self.assertEqual([t["name"] for t in names[registry_count:]], ["aardvark", "zesty"])
        self.assertIn({"name": "Mexican", "category": "cuisine"}, names[:registry_count])
        self.assertIn({"name": MEAL_PREP_TAG, "category": None}, names[:registry_count])
        self.assertNotIn("mexican", [t["name"] for t in names])  # free-form spelling of a registry tag

    def test_prefix(self):
        self.recipe("comfort")
        self.assertEqual(run(store.suggest_tags("CO")), [{"name": "cold", "category": "temperature"},
                                                         {"name": "comfort", "category": None}])


if __name__ == "__main__":
    unittest.main()
