"""Shopping list tests. Run: python -m unittest backend.dinner.test_shopping"""

import unittest
from fractions import Fraction

from .shopping import build, parse_qty


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


if __name__ == "__main__":
    unittest.main()
