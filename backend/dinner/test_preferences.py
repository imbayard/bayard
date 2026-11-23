"""Preference defaults + plumbing tests. Run: python -m pytest backend/dinner/test_preferences.py

Temp dinner.db per test (see test_tags.TempDB) — never the real data/dinner.db.
"""

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from . import planner, store
from .routes import router
from .tags import LUNCH_TAG
from .test_tags import TempDB, run


def client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class Defaults(TempDB):
    def test_round_trip(self):
        c = client()
        self.assertEqual(c.get("/dinner/preferences").json(), {"tag_ids": []})
        ids = [self.tag_id("cold"), self.tag_id("Mexican")]
        self.assertEqual(c.put("/dinner/preferences", json={"tag_ids": ids + [9999]}).json(), {"tag_ids": sorted(ids)})
        self.assertEqual(c.get("/dinner/preferences").json(), {"tag_ids": sorted(ids)})
        c.put("/dinner/preferences", json={"tag_ids": []})
        self.assertEqual(run(store.get_preferences()), [])

    def test_delete_tag_drops_preference(self):
        run(store.set_preferences([self.tag_id("cold"), self.tag_id("Mexican")]))
        run(store.delete_tag(self.tag_id("cold")))
        self.assertEqual(run(store.get_preferences()), [self.tag_id("Mexican")])

    def test_rename_keeps_preference(self):
        run(store.set_preferences([self.tag_id("cold")]))
        run(store.update_tag(self.tag_id("cold"), name="chilled"))
        self.assertEqual(run(store.pref_groups(run(store.get_preferences()))), {"temperature": {"chilled"}})

    def test_groups_skip_meal_and_uncategorized(self):
        ids = [self.tag_id(n) for n in ("cold", "Mexican", "Asian", LUNCH_TAG, "good for meal prep")]
        self.assertEqual(run(store.pref_groups(ids)), {"temperature": {"cold"}, "cuisine": {"Mexican", "Asian"}})


class Routes(TempDB):
    def slots(self, servings: int = 2) -> list[dict]:
        slots = planner.blank_draft()
        for s in slots:
            s["servings"] = servings if s["meal"] == "dinner" else 0
        return slots

    def test_generate_and_swap_honor_prefs(self):
        cold = [self.recipe("Cold"), self.recipe("cold", "Mexican")]
        self.recipe("hot")
        self.recipe()
        c = client()
        prefs = [self.tag_id("cold")]
        slots = c.post("/dinner/plan/generate", json={"slots": self.slots(), "seed": 1, "prefs": prefs}).json()
        dinners = [s for s in slots if s["meal"] == "dinner"]
        self.assertEqual({s["recipe_id"] for s in dinners} - {None}, set(cold))
        self.assertEqual(sum(s["flagged"] for s in dinners), 5)  # pool ran dry → flagged, as before
        day = next(s["day"] for s in dinners if s["recipe_id"] is not None)
        swapped = c.post("/dinner/plan/swap", json={"slots": slots, "day": day, "prefs": prefs})
        self.assertEqual(swapped.status_code, 409)  # the other cold recipe is already used

    def test_no_prefs_means_no_filter(self):
        ids = {self.recipe("hot"), self.recipe()}
        out = client().post("/dinner/plan/generate", json={"slots": self.slots(), "seed": 1}).json()
        self.assertEqual({s["recipe_id"] for s in out if s["meal"] == "dinner"} - {None}, ids)

    def test_registry_reaches_planner_without_prefs(self):
        # Cuisine bias needs the registry lookup even when the request carries no prefs.
        self.recipe("Mexican")
        self.recipe("mexican")
        asian = self.recipe("Asian")
        slots = self.slots(0)
        for s in slots[:2]:
            s["servings"] = 2
        for seed in range(10):
            out = client().post("/dinner/plan/generate", json={"slots": slots, "seed": seed}).json()
            self.assertIn(asian, {s["recipe_id"] for s in out})

    def test_accept_ignores_prefs(self):
        out = client().post("/dinner/plans", json={"week_start": "2026-11-22", "slots": self.slots(0),
                                                   "prefs": [self.tag_id("cold")]})
        self.assertEqual(out.status_code, 200)
        self.assertNotIn("prefs", out.json())


if __name__ == "__main__":
    unittest.main()
