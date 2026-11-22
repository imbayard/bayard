"""Generator tests. Run: python -m unittest backend.dinner.test_planner"""

import random
import unittest

from .planner import (
    PlanError,
    blank_draft,
    delete_leftover,
    eligible,
    finalize,
    generate,
    manual_pick,
    move_leftover,
    swap_dinner,
    tags_in,
)

PREP = "good for meal prep"


def recipe(id: int, servings: float = 2, prep: bool = False) -> dict:
    return {"id": id, "name": f"r{id}", "servings": servings, "tags": [PREP] if prep else []}


def draft(dinners: dict[int, int] | None = None, lunches: dict[int, int] | None = None) -> list[dict]:
    slots = blank_draft()
    for s in slots:
        source = dinners if s["meal"] == "dinner" else lunches
        s["servings"] = (source or {}).get(s["day"], 0)
    return slots


def every(day_from: int, day_to: int, servings: int) -> dict[int, int]:
    return {d: servings for d in range(day_from, day_to + 1)}


def at(slots: list[dict], day: int, meal: str) -> dict:
    return next(s for s in slots if s["day"] == day and s["meal"] == meal)


def rng(seed: int = 0) -> random.Random:
    return random.Random(seed)


class GenerateTests(unittest.TestCase):
    def test_no_recipe_repeats_across_dinners(self):
        recipes = [recipe(i) for i in range(1, 10)]
        for seed in range(20):
            out = generate(draft(every(0, 6, 2)), recipes, rng=rng(seed))
            ids = [at(out, d, "dinner")["recipe_id"] for d in range(7)]
            self.assertEqual(len(set(ids)), 7)

    def test_leftover_lunches_do_not_count_as_repeats(self):
        recipes = [recipe(1, servings=4, prep=True), recipe(2)]
        out = generate(draft({0: 2, 1: 2}, {1: 2}), recipes, rng=rng())
        self.assertEqual(at(out, 0, "dinner")["recipe_id"], 1)
        self.assertEqual(at(out, 1, "lunch")["recipe_id"], 1)
        self.assertEqual(at(out, 1, "dinner")["recipe_id"], 2)

    def test_zero_serving_slots_are_skipped(self):
        out = generate(draft({0: 2, 3: 2}, {2: 0}), [recipe(i) for i in range(1, 5)], rng=rng())
        for s in out:
            if s["servings"] == 0:
                self.assertIsNone(s["recipe_id"])
                self.assertFalse(s["flagged"])
        self.assertIsNotNone(at(out, 0, "dinner")["recipe_id"])
        self.assertIsNotNone(at(out, 3, "dinner")["recipe_id"])

    def test_lunches_are_never_generated_on_their_own(self):
        out = generate(draft(lunches=every(1, 7, 1)), [recipe(i) for i in range(1, 5)], rng=rng())
        self.assertTrue(all(at(out, d, "lunch")["flagged"] for d in range(1, 8)))

    def test_leftovers_reach_two_days_at_most(self):
        recipes = [recipe(1, servings=10, prep=True)]
        out = generate(draft({0: 1}, every(1, 7, 1)), recipes, rng=rng())
        fed = [d for d in range(1, 8) if at(out, d, "lunch")["source"] == "leftover"]
        self.assertEqual(fed, [1, 2])
        self.assertTrue(at(out, 3, "lunch")["flagged"])

    def test_saturday_dinner_only_feeds_sunday_lunch(self):
        out = generate(draft({6: 1}, {7: 1}), [recipe(1, servings=10, prep=True)], rng=rng())
        self.assertEqual(at(out, 7, "lunch")["source_day"], 6)

    def test_batch_cap_is_three_times_servings(self):
        # cap = 6: dinner 2 + Mon 2 + Tue 2 = 6 fits; one more serving on Tue would not.
        out = generate(draft({0: 2}, {1: 2, 2: 2}), [recipe(1, servings=2, prep=True)], rng=rng())
        self.assertEqual(at(out, 0, "dinner")["batch_servings"], 6)
        self.assertEqual(at(out, 2, "lunch")["source"], "leftover")

        out = generate(draft({0: 2}, {1: 2, 2: 3}), [recipe(1, servings=2, prep=True)], rng=rng())
        self.assertEqual(at(out, 0, "dinner")["batch_servings"], 4)
        self.assertTrue(at(out, 2, "lunch")["flagged"])

    def test_lunches_fill_greedily_in_day_order(self):
        # Mon (5) busts the cap of 6, so Tue isn't reached either — whole lunches, in order.
        out = generate(draft({0: 2}, {1: 5, 2: 1}), [recipe(1, servings=2, prep=True)], rng=rng())
        self.assertTrue(at(out, 1, "lunch")["flagged"])
        self.assertTrue(at(out, 2, "lunch")["flagged"])

    def test_meal_prep_preferred_when_lunches_need_covering(self):
        recipes = [recipe(i) for i in range(1, 10)] + [recipe(99, servings=4, prep=True)]
        for seed in range(20):
            out = generate(draft({0: 2}, {1: 2}), recipes, rng=rng(seed))
            self.assertEqual(at(out, 0, "dinner")["recipe_id"], 99)

    def test_meal_prep_covering_most_lunch_servings_wins(self):
        recipes = [recipe(1, servings=1, prep=True), recipe(2, servings=4, prep=True)]
        for seed in range(20):
            out = generate(draft({0: 1}, {1: 1, 2: 2}), recipes, rng=rng(seed))
            self.assertEqual(at(out, 0, "dinner")["recipe_id"], 2)

    def test_falls_back_to_any_recipe_when_no_meal_prep_fits(self):
        out = generate(draft({0: 2}, {1: 2}), [recipe(1, servings=1, prep=True), recipe(2)], rng=rng())
        self.assertIsNotNone(at(out, 0, "dinner")["recipe_id"])
        self.assertTrue(at(out, 1, "lunch")["flagged"])

    def test_earlier_dinner_claims_shared_lunch(self):
        recipes = [recipe(1, servings=10, prep=True), recipe(2, servings=10, prep=True)]
        out = generate(draft({0: 1, 1: 1}, {2: 1}), recipes, rng=rng())
        self.assertEqual(at(out, 2, "lunch")["source_day"], 0)

    def test_unfillable_dinner_is_flagged_not_repeated(self):
        out = generate(draft(every(0, 2, 2)), [recipe(1), recipe(2)], rng=rng())
        self.assertEqual(sum(at(out, d, "dinner")["flagged"] for d in range(3)), 1)

    def test_seed_makes_generation_deterministic(self):
        recipes = [recipe(i) for i in range(1, 10)]
        a = generate(draft(every(0, 6, 2)), recipes, rng=rng(7))
        b = generate(draft(every(0, 6, 2)), recipes, rng=rng(7))
        self.assertEqual(a, b)


class FillEmptiesTests(unittest.TestCase):
    def test_fill_keeps_existing_picks(self):
        recipes = [recipe(i) for i in range(1, 10)]
        slots = draft(every(0, 6, 2))
        at(slots, 0, "dinner").update(recipe_id=5, source="manual")
        at(slots, 3, "dinner").update(recipe_id=6, source="generated")
        out = generate(slots, recipes, mode="fill", rng=rng())
        self.assertEqual(at(out, 0, "dinner")["recipe_id"], 5)
        self.assertEqual(at(out, 0, "dinner")["source"], "manual")
        self.assertEqual(at(out, 3, "dinner")["recipe_id"], 6)
        ids = [at(out, d, "dinner")["recipe_id"] for d in range(7)]
        self.assertEqual(len(set(ids)), 7)

    def test_fill_chains_new_dinners_into_empty_lunches(self):
        recipes = [recipe(1), recipe(2, servings=4, prep=True)]
        slots = draft({0: 2, 1: 2}, {2: 2})
        at(slots, 0, "dinner").update(recipe_id=1, source="generated")
        out = generate(slots, recipes, mode="fill", rng=rng())
        self.assertEqual(at(out, 1, "dinner")["recipe_id"], 2)
        self.assertEqual(at(out, 2, "lunch")["source_day"], 1)

    def test_fill_does_not_extend_existing_dinners(self):
        recipes = [recipe(1, servings=10, prep=True)]
        slots = draft({0: 1}, {1: 1})
        at(slots, 0, "dinner").update(recipe_id=1, source="generated")
        out = generate(slots, recipes, mode="fill", rng=rng())
        self.assertTrue(at(out, 1, "lunch")["flagged"])


class SwapTests(unittest.TestCase):
    def test_swap_excludes_current_and_previously_swapped(self):
        recipes = [recipe(i) for i in range(1, 4)]
        out = generate(draft({0: 2}), recipes, rng=rng())
        seen = [at(out, 0, "dinner")["recipe_id"]]
        for _ in range(2):
            out = swap_dinner(out, recipes, 0, rng=rng())
            seen.append(at(out, 0, "dinner")["recipe_id"])
        self.assertEqual(sorted(seen), [1, 2, 3])
        with self.assertRaises(PlanError):
            swap_dinner(out, recipes, 0, rng=rng())

    def test_swap_to_plain_dinner_frees_and_rehomes_lunches(self):
        # Sun prep dinner feeds Tue; Mon prep dinner has room. Swap Sun to a plain recipe:
        # Tue gets re-homed to Mon's batch, Mon lunch (only reachable from Sun) gets flagged.
        recipes = [recipe(1, servings=4, prep=True), recipe(2, servings=4, prep=True), recipe(3)]
        slots = draft({0: 1, 1: 1}, {1: 1, 2: 1})
        at(slots, 0, "dinner").update(recipe_id=1, source="generated")
        at(slots, 1, "dinner").update(recipe_id=2, source="generated")
        at(slots, 1, "lunch").update(recipe_id=1, source="leftover", source_day=0)
        at(slots, 2, "lunch").update(recipe_id=1, source="leftover", source_day=0)
        at(slots, 0, "dinner")["swapped_out"] = []
        out = swap_dinner(slots, recipes, 0, rng=rng())
        self.assertEqual(at(out, 0, "dinner")["recipe_id"], 3)
        self.assertEqual(at(out, 0, "dinner")["batch_servings"], 1)
        self.assertTrue(at(out, 1, "lunch")["flagged"])
        self.assertEqual(at(out, 2, "lunch")["source_day"], 1)
        self.assertEqual(at(out, 2, "lunch")["recipe_id"], 2)
        self.assertEqual(at(out, 1, "dinner")["batch_servings"], 2)

    def test_swap_to_meal_prep_dinner_rechains(self):
        recipes = [recipe(1, servings=10, prep=True), recipe(2, servings=10, prep=True)]
        out = generate(draft({0: 1}, {1: 1, 2: 1}), recipes, rng=rng())
        first = at(out, 0, "dinner")["recipe_id"]
        out = swap_dinner(out, recipes, 0, rng=rng())
        new = at(out, 0, "dinner")["recipe_id"]
        self.assertNotEqual(new, first)
        self.assertEqual([at(out, d, "lunch")["recipe_id"] for d in (1, 2)], [new, new])
        self.assertEqual(at(out, 0, "dinner")["batch_servings"], 3)


class LeftoverTests(unittest.TestCase):
    def setUp(self):
        # Sun and Mon dinners are both meal prep with room; Sun claims Mon + Tue lunch first.
        self.recipes = [recipe(1, servings=10, prep=True), recipe(2, servings=10, prep=True)]
        self.slots = generate(draft({0: 1, 1: 1}, {1: 1, 2: 1, 3: 1}), self.recipes, rng=rng())
        self.sun = at(self.slots, 0, "dinner")["recipe_id"]
        self.mon = at(self.slots, 1, "dinner")["recipe_id"]

    def test_setup_chaining(self):
        self.assertEqual([at(self.slots, d, "lunch")["source_day"] for d in (1, 2, 3)], [0, 0, 1])

    def test_delete_refills_from_another_dinner(self):
        out = delete_leftover(self.slots, self.recipes, 2)
        self.assertEqual(at(out, 2, "lunch")["source_day"], 1)
        self.assertEqual(at(out, 2, "lunch")["recipe_id"], self.mon)
        self.assertEqual(at(out, 0, "dinner")["batch_servings"], 2)
        self.assertEqual(at(out, 1, "dinner")["batch_servings"], 3)

    def test_delete_flags_when_no_other_dinner_qualifies(self):
        out = delete_leftover(self.slots, self.recipes, 1)  # only Sun reaches Mon lunch
        self.assertTrue(at(out, 1, "lunch")["flagged"])
        self.assertEqual(at(out, 0, "dinner")["batch_servings"], 2)

    def test_delete_respects_other_dinners_cap(self):
        # Mon's batch (dinner 2 + Wed lunch 1) already sits at its cap of 3, so Tue can't move over.
        recipes = [recipe(1, servings=10, prep=True), recipe(2, servings=1, prep=True)]
        slots = draft({0: 1, 1: 2}, {1: 1, 2: 1, 3: 1})
        at(slots, 0, "dinner").update(recipe_id=1, source="generated")
        at(slots, 1, "dinner").update(recipe_id=2, source="generated")
        at(slots, 1, "lunch").update(recipe_id=1, source="leftover", source_day=0)
        at(slots, 2, "lunch").update(recipe_id=1, source="leftover", source_day=0)
        at(slots, 3, "lunch").update(recipe_id=2, source="leftover", source_day=1)
        out = delete_leftover(slots, recipes, 2)
        self.assertTrue(at(out, 2, "lunch")["flagged"])
        self.assertEqual(at(out, 1, "dinner")["batch_servings"], 3)

    def test_move_blocked_when_target_occupied(self):
        with self.assertRaisesRegex(PlanError, "already taken"):
            move_leftover(self.slots, self.recipes, 1, 2)

    def test_move_blocked_outside_source_reach(self):
        slots = delete_leftover(self.slots, self.recipes, 3)
        with self.assertRaisesRegex(PlanError, "only reach"):
            move_leftover(slots, self.recipes, 1, 3)

    def test_move_blocked_past_cap(self):
        recipes = [recipe(1, servings=1, prep=True)]  # cap 3
        slots = generate(draft({0: 1}, {1: 2, 2: 3}), recipes, rng=rng())
        self.assertTrue(at(slots, 2, "lunch")["flagged"])
        with self.assertRaisesRegex(PlanError, "past"):
            move_leftover(slots, recipes, 1, 2)

    def test_move_to_open_slot_in_reach(self):
        recipes = [recipe(1, servings=10, prep=True)]
        slots = draft({0: 1}, {1: 1, 2: 4})
        at(slots, 0, "dinner").update(recipe_id=1, source="generated")
        at(slots, 1, "lunch").update(recipe_id=1, source="leftover", source_day=0)
        out = move_leftover(slots, recipes, 1, 2)
        self.assertEqual(at(out, 2, "lunch")["source_day"], 0)
        self.assertTrue(at(out, 1, "lunch")["flagged"])
        self.assertEqual(at(out, 0, "dinner")["batch_servings"], 5)


class ManualPickTests(unittest.TestCase):
    def test_manual_lunch_is_standalone(self):
        recipes = [recipe(1)]
        out = manual_pick(draft(lunches={3: 2}), recipes, 3, "lunch", 1)
        self.assertEqual(at(out, 3, "lunch")["source"], "manual")
        self.assertFalse(at(out, 3, "lunch")["flagged"])

    def test_manual_pick_rejects_leftover_slot(self):
        recipes = [recipe(1, servings=10, prep=True), recipe(2)]
        slots = generate(draft({0: 1}, {1: 1}), recipes, rng=rng())
        with self.assertRaises(PlanError):
            manual_pick(slots, recipes, 1, "lunch", 2)


CATS = {"cold": "temperature", "hot": "temperature", "Mexican": "cuisine", "Asian": "cuisine",
        "Italian": "cuisine", PREP: None}


def tagged(id: int, *tags: str) -> dict:
    return {"id": id, "name": f"r{id}", "servings": 2, "tags": list(tags)}


class PreferenceTests(unittest.TestCase):
    def test_empty_category_allows_everything(self):
        r = tagged(1)
        self.assertTrue(eligible(r, {}, CATS))
        self.assertTrue(eligible(r, {"cuisine": set()}, CATS))

    def test_or_within_and_across_categories(self):
        prefs = {"cuisine": {"Mexican", "Asian"}, "temperature": {"cold"}}
        self.assertTrue(eligible(tagged(1, "mexican", "Cold"), prefs, CATS))  # case-insensitive
        self.assertTrue(eligible(tagged(2, "Asian", "cold"), prefs, CATS))
        self.assertFalse(eligible(tagged(3, "Italian", "cold"), prefs, CATS))
        self.assertFalse(eligible(tagged(4, "Mexican", "hot"), prefs, CATS))

    def test_untagged_excluded_when_constrained(self):
        self.assertFalse(eligible(tagged(1), {"temperature": {"cold"}}, CATS))
        self.assertFalse(eligible(tagged(2, PREP, "Mexican"), {"temperature": {"cold"}}, CATS))

    def test_generate_and_fill_honor_prefs(self):
        recipes = [tagged(i, "cold" if i % 2 else "hot") for i in range(1, 15)]
        prefs = {"temperature": {"cold"}}
        for mode in ("generate", "fill"):
            out = generate(draft(every(0, 6, 2)), recipes, mode, rng(), prefs=prefs, cats=CATS)
            for d in range(7):
                self.assertEqual(at(out, d, "dinner")["recipe_id"] % 2, 1)

    def test_fill_keeps_existing_picks_outside_prefs(self):
        recipes = [tagged(1, "hot"), tagged(2, "cold")]
        slots = draft({0: 2, 1: 2})
        at(slots, 0, "dinner").update(recipe_id=1, source="manual")
        out = generate(slots, recipes, "fill", rng(), prefs={"temperature": {"cold"}}, cats=CATS)
        self.assertEqual(at(out, 0, "dinner")["recipe_id"], 1)
        self.assertEqual(at(out, 1, "dinner")["recipe_id"], 2)

    def test_swap_honors_prefs(self):
        recipes = [tagged(1, "cold"), tagged(2, "hot"), tagged(3, "cold")]
        prefs = {"temperature": {"cold"}}
        slots = generate(draft({0: 2}), recipes, rng=rng(), prefs=prefs, cats=CATS)
        first = at(slots, 0, "dinner")["recipe_id"]
        out = swap_dinner(slots, recipes, 0, rng(), prefs=prefs, cats=CATS)
        self.assertEqual({first, at(out, 0, "dinner")["recipe_id"]}, {1, 3})
        with self.assertRaises(PlanError):
            swap_dinner(out, recipes, 0, rng(), prefs=prefs, cats=CATS)

    def test_empty_pool_flags_slots(self):
        out = generate(draft({0: 2, 1: 2}), [tagged(1, "hot"), tagged(2)], rng=rng(),
                       prefs={"temperature": {"cold"}}, cats=CATS)
        self.assertTrue(at(out, 0, "dinner")["flagged"])
        self.assertTrue(at(out, 1, "dinner")["flagged"])

    def test_manual_pick_ignores_prefs(self):
        out = manual_pick(draft({0: 2}), [tagged(1, "hot")], 0, "dinner", 1)
        self.assertEqual(at(out, 0, "dinner")["recipe_id"], 1)

    def test_tags_in(self):
        self.assertEqual(tags_in(tagged(1, "mexican", "cold", "weeknight"), "cuisine", CATS), {"Mexican"})


CATS_MEAL = {**CATS, "lunch": "meal", "dinner": "meal"}


def ids(out: list[dict], meal: str) -> list[int | None]:
    return [s["recipe_id"] for s in out if s["meal"] == meal]


class MealPoolTests(unittest.TestCase):
    def test_lunch_only_recipe_never_picked_for_dinner(self):
        recipes = [tagged(i, "Lunch") for i in range(1, 6)] + [tagged(i) for i in range(10, 13)]
        for seed in range(20):
            out = generate(draft(every(0, 6, 2)), recipes, rng=rng(seed), cats=CATS_MEAL)
            self.assertEqual(set(ids(out, "dinner")) - {None}, {10, 11, 12})
            self.assertEqual(sum(at(out, d, "dinner")["flagged"] for d in range(7)), 4)

    def test_lunch_and_dinner_recipe_fits_either(self):
        both = [tagged(1, "lunch", "dinner")]
        self.assertEqual(at(generate(draft({0: 2}), both, rng=rng()), 0, "dinner")["recipe_id"], 1)
        self.assertEqual(at(generate(draft(lunches={3: 1}), both, rng=rng()), 3, "lunch")["recipe_id"], 1)

    def test_lunch_auto_fill_uses_lunch_pool_and_prefs(self):
        recipes = [tagged(1), tagged(2), tagged(3, "lunch", "cold"), tagged(4, "lunch", "hot"),
                   tagged(5, "lunch", "cold")]
        for mode in ("generate", "fill"):
            for seed in range(10):
                out = generate(draft(lunches=every(1, 7, 1)), recipes, mode, rng(seed),
                               prefs={"temperature": {"cold"}}, cats=CATS_MEAL)
                for d in range(1, 8):
                    lunch = at(out, d, "lunch")
                    self.assertIn(lunch["recipe_id"], {3, 5})
                    self.assertEqual(lunch["source"], "generated")
                    self.assertFalse(lunch["flagged"])

    def test_leftovers_cover_lunch_before_the_lunch_pool(self):
        recipes = [recipe(1, servings=4, prep=True), tagged(2, "lunch")]
        out = generate(draft({0: 2}, {1: 2, 4: 1}), recipes, rng=rng())
        self.assertEqual(at(out, 1, "lunch")["source"], "leftover")
        self.assertEqual((at(out, 4, "lunch")["recipe_id"], at(out, 4, "lunch")["source"]), (2, "generated"))

    def test_no_lunch_recipes_keeps_lunches_flagged(self):
        out = generate(draft(every(0, 6, 1), every(1, 7, 1)), [tagged(i) for i in range(1, 10)], rng=rng())
        self.assertTrue(all(at(out, d, "lunch")["flagged"] for d in range(1, 8)))

    def test_generated_lunches_survive_finalize_and_fill(self):
        out = generate(draft({0: 2}, {2: 1}), [tagged(1), tagged(2, "lunch")], rng=rng())
        self.assertEqual(finalize(out), out)
        self.assertEqual(at(generate(out, [tagged(1)], "fill", rng()), 2, "lunch")["recipe_id"], 2)

    def test_lunch_never_matches_same_day_dinner_and_dinners_never_repeat(self):
        recipes = [tagged(i, "lunch", "dinner") for i in range(1, 9)]
        for seed in range(20):
            out = generate(draft(every(0, 6, 1), every(1, 7, 1)), recipes, rng=rng(seed))
            dinners = ids(out, "dinner")
            self.assertEqual(len(set(dinners)), 7)
            for d in range(1, 7):
                self.assertNotEqual(at(out, d, "lunch")["recipe_id"], at(out, d, "dinner")["recipe_id"])

    def test_lunch_falls_back_to_other_day_recipes_when_pool_is_small(self):
        # Two lunch+dinner recipes, two dinners: Mon lunch can't be Mon's dinner, so it's Sun's.
        recipes = [tagged(1, "lunch", "dinner"), tagged(2, "lunch", "dinner")]
        for seed in range(10):
            out = generate(draft({0: 1, 1: 1}, {1: 1}), recipes, rng=rng(seed))
            self.assertEqual(at(out, 1, "lunch")["recipe_id"], at(out, 0, "dinner")["recipe_id"])


class CuisineBiasTests(unittest.TestCase):
    def test_spreads_cuisines(self):
        recipes = [tagged(c * 10 + i, cuisine) for c, cuisine in enumerate(("Mexican", "Asian", "Italian"))
                   for i in range(4)]
        for seed in range(20):
            out = generate(draft(every(0, 5, 2)), recipes, rng=rng(seed), cats=CATS)
            picked = [r for r in ids(out, "dinner") if r is not None]
            counts = [sum(1 for r in picked if r // 10 == c) for c in range(3)]
            self.assertEqual(counts, [2, 2, 2])

    def test_counts_standalone_lunches(self):
        recipes = [tagged(1, "Mexican"), tagged(2, "Mexican"), tagged(3, "Asian"), tagged(4, "Asian"),
                   tagged(5, "lunch", "Asian")]
        for seed in range(10):
            slots = draft({0: 1}, {1: 1})
            at(slots, 1, "lunch").update(recipe_id=5, source="manual")
            out = generate(slots, recipes, "fill", rng(seed), cats=CATS)
            self.assertIn(at(out, 0, "dinner")["recipe_id"], {1, 2})

    def test_untagged_cuisine_is_neutral(self):
        recipes = [tagged(1, "Mexican"), tagged(2, "Mexican"), tagged(3)]
        picks = set()
        for seed in range(20):
            slots = draft({0: 1, 1: 1})
            at(slots, 0, "dinner").update(recipe_id=1, source="manual")
            picks.add(at(generate(slots, recipes, "fill", rng(seed), cats=CATS), 1, "dinner")["recipe_id"])
        self.assertEqual(picks, {2, 3})  # neither favored nor ruled out

    def test_never_leaves_a_fillable_slot_empty(self):
        recipes = [tagged(i, "Mexican") for i in range(1, 5)] + [tagged(9, "Asian")]
        out = generate(draft(every(0, 4, 2)), recipes, rng=rng(), cats=CATS)
        self.assertFalse(any(at(out, d, "dinner")["flagged"] for d in range(5)))

    def test_meal_prep_coverage_outranks_cuisine(self):
        # Sun is Mexican; Mon can be Asian (plain) or Mexican meal prep that covers Tue lunch.
        recipes = [tagged(1, "Mexican"), tagged(2, "Asian"), {**tagged(3, "Mexican", PREP), "servings": 4}]
        for seed in range(20):
            slots = draft({0: 2, 1: 2}, {2: 2})
            at(slots, 0, "dinner").update(recipe_id=1, source="manual")
            out = generate(slots, recipes, "fill", rng(seed), cats=CATS)
            self.assertEqual(at(out, 1, "dinner")["recipe_id"], 3)
            self.assertEqual(at(out, 2, "lunch")["source"], "leftover")

    def test_swap_applies_pools_and_bias(self):
        recipes = [tagged(1, "Mexican"), tagged(2, "Mexican"), tagged(3, "Asian"), tagged(4, "lunch", "Asian"),
                   tagged(5, "Mexican")]
        for seed in range(10):
            slots = draft({0: 1, 1: 1})
            at(slots, 0, "dinner").update(recipe_id=1, source="manual")
            at(slots, 1, "dinner").update(recipe_id=2, source="generated")
            self.assertEqual(at(swap_dinner(slots, recipes, 1, rng(seed), cats=CATS), 1, "dinner")["recipe_id"], 3)


if __name__ == "__main__":
    unittest.main()
