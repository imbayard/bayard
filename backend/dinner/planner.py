"""Weekly meal-plan generator. Pure functions: no I/O, no LLM.

The window runs Sunday dinner → the following Sunday's lunch. Day 0 is the plan's Sunday, so
dinners are days 0-6 and lunches days 1-7. A draft is a list of 14 slot dicts:

    {day, meal, servings, recipe_id, source, source_day, batch_servings, flagged, swapped_out}

- servings: requested by the user; 0 means the slot isn't needed and is skipped.
- source: "generated" | "leftover" | "manual" | None. A "generated" lunch is standalone.
- source_day: for a leftover lunch, the day of the dinner it comes from.
- batch_servings: for a dinner, its servings plus every lunch it feeds.
- flagged: needs a manual pick (servings > 0, nothing assigned).
- swapped_out: recipes swapped away from this dinner during the draft session.

Pools come from the protected meal tags: an untagged recipe is a dinner; a `lunch` recipe joins
the dinner pool only if it's also tagged `dinner`. Dinners are generated first and never repeat
in the window. Lunches get leftovers from a meal-prep dinner (at most the LUNCH_REACH days after
it, batch ≤ BATCH_CAP × the recipe's servings); whatever leftovers can't cover is filled from the
`lunch` pool (never the same day's dinner), else flagged for a manual pick.
Cuisine variety is a soft bias: among eligible picks, the cuisine least used so far wins (no
cuisine tag = neutral, ties random); meal-prep lunch coverage outranks it for dinners.
Manual picks are a free override of all of this.
Every public function takes a draft and returns a new one; bad requests raise PlanError.

Preferences narrow what generate/fill/swap may pick (manual picks ignore them): `prefs` maps a
category to its selected tag names, `cats` is the registry's tag → category lookup (both passed in
by the route layer). OR within a category, AND across them; a category with no selection imposes
nothing, and a recipe with no tag in a constrained category is out.
"""

import copy
import random
from collections import Counter

from .tags import DINNER_TAG, LUNCH_TAG, MEAL_PREP_TAG, normalize_tag, tag_key

LUNCH_REACH = 2
BATCH_CAP = 3
CUISINE = "cuisine"
DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
WINDOW = [(d, "dinner") for d in range(7)] + [(d, "lunch") for d in range(1, 8)]


class PlanError(Exception):
    pass


def blank_draft() -> list[dict]:
    return [_slot(day, meal) for day, meal in WINDOW]


def finalize(slots: list[dict]) -> list[dict]:
    """Validated copy with flags and batch sizes recomputed — what gets saved."""
    return _load(slots)[0]


def _slot(day: int, meal: str, servings: int = 0) -> dict:
    return {
        "day": day, "meal": meal, "servings": servings, "recipe_id": None, "source": None,
        "source_day": None, "batch_servings": None, "flagged": False, "swapped_out": [],
    }


def _clear(slot: dict) -> None:
    slot.update(recipe_id=None, source=None, source_day=None)


def _has(recipe: dict | None, tag: str) -> bool:
    return recipe is not None and any(normalize_tag(t) == tag for t in recipe["tags"])


def _is_prep(recipe: dict | None) -> bool:
    return _has(recipe, MEAL_PREP_TAG)


def _for_dinner(recipe: dict) -> bool:
    """Untagged = dinner; a `lunch` recipe only joins the dinner pool if it's also tagged `dinner`."""
    return not _has(recipe, LUNCH_TAG) or _has(recipe, DINNER_TAG)


def tags_in(recipe: dict, category: str, cats: dict[str, str | None]) -> set[str]:
    """The recipe's registry tags (canonical spelling) that belong to `category`."""
    return {n for n in (normalize_tag(t, cats) for t in recipe["tags"]) if cats.get(n) == category}


def eligible(recipe: dict, prefs: dict[str, set[str]], cats: dict[str, str | None]) -> bool:
    """Does the recipe satisfy every constrained category (≥1 selected tag of each)?"""
    return all(
        {tag_key(t) for t in tags_in(recipe, category, cats)} & {tag_key(t) for t in selected}
        for category, selected in prefs.items() if selected
    )


def _cap(recipe: dict) -> float:
    return BATCH_CAP * recipe["servings"]


def _reach(dinner_day: int) -> range:
    return range(dinner_day + 1, min(dinner_day + LUNCH_REACH, 7) + 1)


def _leftovers(idx: dict, dinner_day: int) -> list[dict]:
    return [
        idx[(d, "lunch")] for d in _reach(dinner_day)
        if idx[(d, "lunch")]["source"] == "leftover" and idx[(d, "lunch")]["source_day"] == dinner_day
    ]


def _batch(idx: dict, dinner_day: int) -> int:
    return idx[(dinner_day, "dinner")]["servings"] + sum(l["servings"] for l in _leftovers(idx, dinner_day))


def _used(idx: dict) -> set[int]:
    return {idx[(d, "dinner")]["recipe_id"] for d in range(7)} - {None}


def _load(slots: list[dict]) -> tuple[list[dict], dict]:
    """Deep-copy, validate the window, and normalize so callers can mutate freely."""
    slots = copy.deepcopy(slots)
    idx = {(s["day"], s["meal"]): s for s in slots}
    if len(slots) != len(WINDOW) or set(idx) != set(WINDOW):
        raise PlanError("A plan needs exactly the 14 slots from Sunday dinner to the next Sunday lunch.")
    for s in slots:
        s.setdefault("swapped_out", [])
    _finalize(slots, idx)
    return slots, idx


def _finalize(slots: list[dict], idx: dict) -> list[dict]:
    """Drop assignments that can't stand, then recompute flags and batch sizes."""
    for s in slots:
        if s["servings"] <= 0:
            _clear(s)
    for s in slots:
        if s["source"] == "leftover":
            src = idx.get((s["source_day"], "dinner"))
            if src is None or src["recipe_id"] != s["recipe_id"] or s["day"] not in _reach(s["source_day"]):
                _clear(s)
    for s in slots:
        s["flagged"] = s["servings"] > 0 and s["recipe_id"] is None
        filled_dinner = s["meal"] == "dinner" and s["recipe_id"] is not None
        s["batch_servings"] = _batch(idx, s["day"]) if filled_dinner else None
    return slots


def _chain_targets(idx: dict, dinner_day: int, recipe: dict) -> list[dict]:
    """Empty lunches this dinner can feed: in day order, whole lunches only, stop at the cap."""
    batch = _batch(idx, dinner_day)
    targets = []
    for d in _reach(dinner_day):
        lunch = idx[(d, "lunch")]
        if lunch["servings"] <= 0 or lunch["recipe_id"] is not None:
            continue
        if batch + lunch["servings"] > _cap(recipe):
            break
        batch += lunch["servings"]
        targets.append(lunch)
    return targets


def _chain(idx: dict, dinner_day: int, recipe: dict) -> None:
    if _is_prep(recipe):
        for lunch in _chain_targets(idx, dinner_day, recipe):
            lunch.update(recipe_id=recipe["id"], source="leftover", source_day=dinner_day)


def _same_day(idx: dict, day: int, meal: str) -> set[int]:
    """The recipe on the other meal of the same day, so lunch and dinner don't match."""
    other = idx.get((day, "lunch" if meal == "dinner" else "dinner"))
    return {other["recipe_id"]} - {None} if other else set()


def _cuisine_counts(idx: dict, by_id: dict, cats: dict[str, str | None]) -> Counter:
    """Cuisines already in the draft: dinners and standalone lunches (leftovers repeat a dinner)."""
    counts = Counter()
    for s in idx.values():
        recipe = by_id.get(s["recipe_id"])
        if recipe is not None and s["source"] != "leftover":
            counts.update(tags_in(recipe, CUISINE, cats))
    return counts


def _choose(idx: dict, day: int, meal: str, recipes: list[dict], exclude: set[int], rng: random.Random,
            by_id: dict, cats: dict[str, str | None]) -> dict | None:
    """Random eligible recipe, narrowed in priority order:
    1. dinners: meal-prep ones covering the most lunch servings win when any cover some;
    2. the cuisine least used so far in the draft (recipes with no cuisine tag always stay in).
    Each step only narrows a non-empty pool, so it never leaves a fillable slot empty."""
    pool = [r for r in recipes if r["id"] not in exclude]
    if not pool:
        return None
    if meal == "dinner":
        scored = [(sum(l["servings"] for l in _chain_targets(idx, day, r)), r) for r in pool if _is_prep(r)]
        best = max((score for score, _ in scored), default=0)
        if best > 0:
            pool = [r for score, r in scored if score == best]
    counts = _cuisine_counts(idx, by_id, cats)
    usage = {r["id"]: min((counts[c] for c in tags_in(r, CUISINE, cats)), default=None) for r in pool}
    least = min((u for u in usage.values() if u is not None), default=None)
    return rng.choice([r for r in pool if usage[r["id"]] in (None, least)])


def _fill_lunches(idx: dict, pool: list[dict], rng: random.Random, by_id: dict, cats: dict[str, str | None]) -> None:
    """Standalone lunches from the lunch pool for whatever leftovers couldn't cover.
    Never the same day's dinner; a recipe not yet in the draft is preferred when there is one."""
    for day in range(1, 8):
        lunch = idx[(day, "lunch")]
        if lunch["servings"] <= 0 or lunch["recipe_id"] is not None:
            continue
        same_day = _same_day(idx, day, "lunch")
        planned = {s["recipe_id"] for s in idx.values()} - {None}
        recipe = (_choose(idx, day, "lunch", pool, same_day | planned, rng, by_id, cats)
                  or _choose(idx, day, "lunch", pool, same_day, rng, by_id, cats))
        if recipe is not None:
            lunch.update(recipe_id=recipe["id"], source="generated", source_day=None)


def _refill(idx: dict, by_id: dict, lunch_day: int, exclude_dinner_day: int | None) -> None:
    """Feed an empty lunch from another meal-prep dinner in reach with spare capacity, earliest first."""
    lunch = idx[(lunch_day, "lunch")]
    for dinner_day in range(max(lunch_day - LUNCH_REACH, 0), lunch_day):
        if dinner_day == exclude_dinner_day:
            continue
        recipe = by_id.get(idx[(dinner_day, "dinner")]["recipe_id"])
        if _is_prep(recipe) and _batch(idx, dinner_day) + lunch["servings"] <= _cap(recipe):
            lunch.update(recipe_id=recipe["id"], source="leftover", source_day=dinner_day)
            return


def _pool(recipes: list[dict], prefs: dict[str, set[str]] | None, cats: dict[str, str | None] | None) -> list[dict]:
    """Recipes generation may pick from, in a stable order."""
    recipes = sorted(recipes, key=lambda r: r["id"])
    return [r for r in recipes if eligible(r, prefs, cats or {})] if prefs else recipes


def generate(slots: list[dict], recipes: list[dict], mode: str = "generate", rng: random.Random | None = None,
             prefs: dict[str, set[str]] | None = None, cats: dict[str, str | None] | None = None) -> list[dict]:
    """mode="generate" rebuilds every pick; mode="fill" only fills empty slots and keeps the rest.

    Dinners go in chronological order, so an earlier meal-prep dinner claims a shared lunch first.
    In fill mode only newly placed dinners chain — existing ones don't reach into empty lunches.
    Lunches leftovers can't cover are then filled from the lunch pool.
    """
    rng = rng or random.Random()
    cats = cats or {}
    slots, idx = _load(slots)
    if mode == "generate":
        for s in slots:
            _clear(s)
            s["swapped_out"] = []
    pool = _pool(recipes, prefs, cats)
    dinners = [r for r in pool if _for_dinner(r)]
    by_id = {r["id"]: r for r in recipes}
    for day in range(7):
        dinner = idx[(day, "dinner")]
        if dinner["servings"] <= 0 or dinner["recipe_id"] is not None:
            continue
        exclude = _used(idx) | set(dinner["swapped_out"]) | _same_day(idx, day, "dinner")
        recipe = _choose(idx, day, "dinner", dinners, exclude, rng, by_id, cats)
        if recipe is not None:
            dinner.update(recipe_id=recipe["id"], source="generated")
            _chain(idx, day, recipe)
    _fill_lunches(idx, [r for r in pool if _has(r, LUNCH_TAG)], rng, by_id, cats)
    return _finalize(slots, idx)


def swap_dinner(slots: list[dict], recipes: list[dict], day: int, rng: random.Random | None = None,
                prefs: dict[str, set[str]] | None = None, cats: dict[str, str | None] | None = None) -> list[dict]:
    """Replace a dinner under the same rules, then re-chain or re-home the lunches it fed.

    Dinners only: a generated standalone lunch is changed with a manual pick (or another Generate).
    Freed lunches no dinner can re-home stay flagged — Fill tops them up from the lunch pool.
    """
    rng = rng or random.Random()
    cats = cats or {}
    slots, idx = _load(slots)
    dinner = idx.get((day, "dinner"))
    if dinner is None or dinner["recipe_id"] is None:
        raise PlanError("Nothing to swap here — pick a recipe instead.")
    freed = _leftovers(idx, day)
    for lunch in freed:
        _clear(lunch)
    dinner["swapped_out"] = dinner["swapped_out"] + [dinner["recipe_id"]]
    _clear(dinner)
    by_id = {r["id"]: r for r in recipes}
    dinners = [r for r in _pool(recipes, prefs, cats) if _for_dinner(r)]
    exclude = _used(idx) | set(dinner["swapped_out"]) | _same_day(idx, day, "dinner")
    recipe = _choose(idx, day, "dinner", dinners, exclude, rng, by_id, cats)
    if recipe is None:
        raise PlanError(f"No other eligible recipe for {DAY_NAMES[day]} dinner.")
    dinner.update(recipe_id=recipe["id"], source="generated")
    _chain(idx, day, recipe)
    for lunch in freed:
        if lunch["recipe_id"] is None:
            _refill(idx, by_id, lunch["day"], exclude_dinner_day=day)
    return _finalize(slots, idx)


def _leftover_lunch(idx: dict, day: int) -> dict:
    lunch = idx.get((day, "lunch"))
    if lunch is None or lunch["source"] != "leftover":
        raise PlanError("That lunch isn't leftovers.")
    return lunch


def delete_leftover(slots: list[dict], recipes: list[dict], day: int) -> list[dict]:
    """Drop a leftover lunch, then try to feed it from a different meal-prep dinner."""
    slots, idx = _load(slots)
    lunch = _leftover_lunch(idx, day)
    source_day = lunch["source_day"]
    _clear(lunch)
    _refill(idx, {r["id"]: r for r in recipes}, day, exclude_dinner_day=source_day)
    return _finalize(slots, idx)


def move_leftover(slots: list[dict], recipes: list[dict], day: int, to_day: int) -> list[dict]:
    """Move a leftover lunch to another lunch slot its source dinner can still reach."""
    slots, idx = _load(slots)
    lunch = _leftover_lunch(idx, day)
    target = idx.get((to_day, "lunch"))
    if target is None:
        raise PlanError("There's no lunch slot on that day.")
    if target["recipe_id"] is not None:
        raise PlanError(f"{DAY_NAMES[to_day]} lunch is already taken — delete or move that first.")
    if target["servings"] <= 0:
        raise PlanError(f"{DAY_NAMES[to_day]} lunch isn't needed — give it servings first.")
    source_day = lunch["source_day"]
    if to_day not in _reach(source_day):
        raise PlanError(f"Leftovers from {DAY_NAMES[source_day]} dinner only reach the next {LUNCH_REACH} days.")
    recipe = next((r for r in recipes if r["id"] == lunch["recipe_id"]), None)
    if recipe is None:
        raise PlanError("That recipe no longer exists.")
    if _batch(idx, source_day) - lunch["servings"] + target["servings"] > _cap(recipe):
        raise PlanError(f"That would push the batch past {BATCH_CAP}× the recipe's servings.")
    target.update(recipe_id=lunch["recipe_id"], source="leftover", source_day=source_day)
    _clear(lunch)
    return _finalize(slots, idx)


def manual_pick(slots: list[dict], recipes: list[dict], day: int, meal: str, recipe_id: int) -> list[dict]:
    """User's own choice for a slot, from the full recipe list.

    A manual lunch is standalone. A manual meal-prep dinner still chains into empty lunches,
    and any lunches the slot's previous dinner fed get re-homed.
    """
    slots, idx = _load(slots)
    slot = idx.get((day, meal))
    if slot is None:
        raise PlanError("There's no such slot.")
    if slot["servings"] <= 0:
        raise PlanError("Give this slot servings first.")
    if slot["source"] == "leftover":
        raise PlanError("That lunch is leftovers — delete or move it instead.")
    by_id = {r["id"]: r for r in recipes}
    recipe = by_id.get(recipe_id)
    if recipe is None:
        raise PlanError("That recipe no longer exists.")
    freed = _leftovers(idx, day) if meal == "dinner" else []
    for lunch in freed:
        _clear(lunch)
    slot.update(recipe_id=recipe_id, source="manual", source_day=None)
    if meal == "dinner":
        _chain(idx, day, recipe)
        for lunch in freed:
            if lunch["recipe_id"] is None:
                _refill(idx, by_id, lunch["day"], exclude_dinner_day=day)
    return _finalize(slots, idx)
