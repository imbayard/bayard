"""Shopping list tests. Run: python -m unittest backend.dinner.test_shopping"""

import datetime
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path

from . import routes, store
from .shopping import build, parse_qty, staple_key, staples_section


def ing(qty: str, unit: str, name: str, optional: bool = False) -> dict:
    return {"qty": qty, "unit": unit, "name": name, "optional": optional}


def slot(day: int, meal: str, recipe_id: int | None, servings: int, source: str = "generated", batch=None) -> dict:
    return {"day": day, "meal": meal, "recipe_id": recipe_id, "servings": servings, "source": source,
            "batch_servings": batch}


RECIPES = [
    {"id": 1, "name": "Chili", "servings": 4,
     "ingredients": [ing("1", "lb", "Ground beef"), ing("1/2", "cup", "onion"), ing("a pinch", "", "salt")]},
    {"id": 2, "name": "Tacos", "servings": 2,
     "ingredients": [ing("0.5", "lb", "ground beef"), ing("1", "cup", "Onion"), ing("2", "", "lime", optional=True)]},
]


class ParseQty(unittest.TestCase):
    def test_forms(self):
        self.assertEqual(parse_qty("2"), 2)
        self.assertEqual(parse_qty("1.5"), Fraction(3, 2))
        self.assertEqual(parse_qty("1 1/2"), Fraction(3, 2))
        self.assertIsNone(parse_qty(""))
        self.assertIsNone(parse_qty("a pinch"))
        self.assertIsNone(parse_qty("1/0"))


class Build(unittest.TestCase):
    def by_key(self, slots):
        return {i["key"]: i for i in build(slots, RECIPES)["items"]}

    def test_scales_by_batch_and_combines_case_insensitively(self):
        # Chili batch 8 = ×2; Tacos 2 servings = ×1.
        items = self.by_key([slot(0, "dinner", 1, 2, batch=8), slot(1, "dinner", 2, 2, batch=2)])
        self.assertEqual(items["ground beef|lb"]["qty"], "2.5")
        self.assertEqual(items["onion|cup"]["qty"], "2")
        self.assertEqual(
            items["ground beef|lb"]["sources"], [{"recipe": "Chili", "qty": "2"}, {"recipe": "Tacos", "qty": "0.5"}]
        )

    def test_recipes_in_plan_order(self):
        built = build([slot(3, "dinner", 1, 4, batch=4), slot(1, "lunch", 2, 2, source="manual")], RECIPES)
        self.assertEqual(built["recipes"], ["Tacos", "Chili"])

    def test_leftovers_and_skipped_slots_add_nothing(self):
        items = self.by_key([
            slot(0, "dinner", 1, 4, batch=4),
            slot(1, "lunch", 1, 2, source="leftover"),
            slot(2, "dinner", 2, 0, batch=None),
        ])
        self.assertEqual(items["ground beef|lb"]["qty"], "1")
        self.assertNotIn("lime|", items)

    def test_standalone_lunch_uses_its_servings(self):
        items = self.by_key([slot(1, "lunch", 2, 4, source="manual")])
        self.assertEqual(items["lime|"]["qty"], "4")

    def test_text_qty_and_optional(self):
        items = self.by_key([slot(0, "dinner", 1, 4, batch=4), slot(1, "dinner", 2, 2, batch=2)])
        self.assertEqual(items["salt|"]["qty"], "a pinch")
        self.assertTrue(items["lime|"]["optional"])
        self.assertFalse(items["onion|cup"]["optional"])


class Staples(unittest.TestCase):
    STAPLES = [{"id": 7, "name": "Onion", "quantity": "2", "unit": "cup"}, {"id": 8, "name": "coffee", "quantity": None, "unit": None}]

    def test_as_entered_never_scaled(self):
        lines = staples_section(self.STAPLES)
        self.assertEqual([(l["key"], l["qty"], l["unit"]) for l in lines], [("staple:7", "2", "cup"), ("staple:8", "", "")])
        self.assertTrue(all(l["staple"] and l["sources"] == [] for l in lines))

    def test_not_merged_with_matching_recipe_item(self):
        # Chili ×2 has onion|cup = 1; the "Onion 2 cup" staple stays its own line.
        recipe_items = build([slot(0, "dinner", 1, 8, batch=8)], RECIPES)["items"]
        keys = [i["key"] for i in recipe_items + staples_section(self.STAPLES)]
        self.assertEqual(keys.count("onion|cup"), 1)
        self.assertIn("staple:7", keys)
        self.assertEqual(next(i for i in recipe_items if i["key"] == "onion|cup")["qty"], "1")


class StapleRoutes(unittest.IsolatedAsyncioTestCase):
    """Store + route against a throwaway DB — never the real dinner.db."""

    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.real_path = store.DB_PATH
        store.DB_PATH = Path(self.tmp.name) / "dinner.db"
        await store.create_table()

    async def asyncTearDown(self):
        store.DB_PATH = self.real_path
        self.tmp.cleanup()

    async def test_staples_need_a_saved_plan(self):
        await store.create_staple("Coffee", None, None)
        week = datetime.date(2026, 11, 22)
        self.assertEqual((await routes.shopping_list(week))["items"], [])
        await store.save_plan(week.isoformat(), [])
        items = (await routes.shopping_list(week))["items"]
        self.assertEqual([i["name"] for i in items], ["Coffee"])

    async def test_check_off_independent_per_week_and_staple(self):
        coffee = await store.create_staple("Coffee", None, None)
        yogurt = await store.create_staple("Yogurt", "4", "cups")
        this_week, next_week = datetime.date(2026, 11, 22), datetime.date(2026, 11, 29)
        for week in (this_week, next_week):
            await store.save_plan(week.isoformat(), [])
        await store.set_shopping_state(this_week.isoformat(), staple_key(coffee), "checked")

        def status(lst):
            return {i["name"]: i["status"] for i in lst["items"]}

        self.assertEqual(status(await routes.shopping_list(this_week)), {"Coffee": "checked", "Yogurt": None})
        self.assertEqual(status(await routes.shopping_list(next_week)), {"Coffee": None, "Yogurt": None})
        self.assertNotEqual(staple_key(coffee), staple_key(yogurt))

    async def test_crud(self):
        made = await routes.create_staple(routes.StapleIn(name="  Yogurt ", quantity="", unit="tub"))
        self.assertEqual((made["name"], made["quantity"], made["unit"]), ("Yogurt", None, "tub"))
        await routes.update_staple(made["id"], routes.StapleIn(name="Greek yogurt", quantity="2"))
        self.assertEqual(await store.get_staples(), [{"id": made["id"], "name": "Greek yogurt", "quantity": "2", "unit": None}])
        await routes.delete_staple(made["id"])
        self.assertEqual(await store.get_staples(), [])


if __name__ == "__main__":
    unittest.main()
