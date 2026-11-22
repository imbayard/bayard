"""Saved plan → draft → re-accept, through the routes. Run: python -m pytest backend/dinner/test_plans.py

Temp dinner.db per test (see test_tags.TempDB) — never the real data/dinner.db.
"""

from . import planner, store
from .tags import MEAL_PREP_TAG
from .test_preferences import client
from .test_tags import TempDB, run

WEEK = "2026-11-22"  # a Sunday


def dinner(slots: list[dict], day: int) -> dict:
    return next(s for s in slots if s["meal"] == "dinner" and s["day"] == day)


class ReopenPlan(TempDB):
    def test_saved_plan_round_trips_into_a_draft_and_reaccept_appends(self):
        c = client()
        prep = run(store.create_recipe("chili", 10, [], [], [MEAL_PREP_TAG]))
        plain = run(store.create_recipe("tacos", 2, [], [], []))
        slots = planner.blank_draft()
        for s in slots:
            s["servings"] = 1 if (s["meal"], s["day"]) in {("dinner", 0), ("dinner", 3), ("lunch", 1)} else 0
        slots = c.post("/dinner/plan/pick", json={"slots": slots, "day": 0, "meal": "dinner", "recipe_id": prep}).json()
        slots = c.post("/dinner/plan/pick", json={"slots": slots, "day": 3, "meal": "dinner", "recipe_id": plain}).json()
        first = c.post("/dinner/plans", json={"week_start": WEEK, "slots": slots}).json()

        # Edit: the latest saved plan's slots become the draft (no swapped_out saved) and accept planner actions.
        latest = c.get(f"/dinner/plans?week={WEEK}").json()[0]
        draft = c.get(f"/dinner/plans/{latest['id']}").json()["slots"]
        self.assertTrue(all("swapped_out" not in s for s in draft))
        moved = c.post("/dinner/plan/move", json={"slots": draft, "day": 0, "meal": "dinner", "to_day": 3})
        self.assertEqual(moved.status_code, 200)
        self.assertEqual(dinner(moved.json(), 3)["recipe_id"], prep)

        second = c.post("/dinner/plans", json={"week_start": WEEK, "slots": moved.json()}).json()
        plans = c.get(f"/dinner/plans?week={WEEK}").json()
        self.assertEqual([p["id"] for p in plans], [second["id"], first["id"]])
        self.assertEqual(dinner(c.get(f"/dinner/plans/{first['id']}").json()["slots"], 0)["recipe_id"], prep)

    def test_invalid_drop_is_a_409(self):
        c = client()
        res = c.post("/dinner/plan/move", json={"slots": planner.blank_draft(), "day": 0, "meal": "dinner", "to_day": 1})
        self.assertEqual(res.status_code, 409)
        self.assertIn("Nothing to move", res.json()["detail"])
