"""Shopping list: a saved plan's recipes, scaled to what's cooked and combined.

Lines combine on exact (case-insensitive) ingredient name + unit — no unit conversion.
Quantities that aren't numbers ("a pinch") can't scale or add, so they ride along as text.
"""

from fractions import Fraction


def parse_qty(qty: str) -> Fraction | None:
    """'2', '1.5', '1/2', '1 1/2' → Fraction; blank or anything else → None."""
    try:
        return sum((Fraction(part) for part in qty.split()), Fraction(0)) if qty.strip() else None
    except (ValueError, ZeroDivisionError):
        return None


def format_qty(qty: Fraction) -> str:
    return f"{float(qty):.2f}".rstrip("0").rstrip(".")


def item_key(name: str, unit: str) -> str:
    return f"{name.strip().lower()}|{unit.strip().lower()}"


def cooked_servings(slot: dict) -> float:
    """How much of the recipe actually gets made for this slot (0 for leftovers — the dinner covers them)."""
    if slot["recipe_id"] is None or slot["servings"] <= 0 or slot["source"] == "leftover":
        return 0
    if slot["meal"] == "dinner" and slot["batch_servings"]:
        return slot["batch_servings"]
    return slot["servings"]


def _amount(total: Fraction, texts: list[str]) -> str:
    return " + ".join(([format_qty(total)] if total else []) + texts)


def build(slots: list[dict], recipes: list[dict]) -> dict:
    """{recipes: names in plan order, items: combined lines, each with a per-recipe breakdown}."""
    by_id = {r["id"]: r for r in recipes}
    order: list[str] = []
    items: dict[str, dict] = {}
    for slot in sorted(slots, key=lambda s: (s["day"], s["meal"] != "lunch")):
        recipe = by_id.get(slot["recipe_id"])
        cooked = cooked_servings(slot)
        if recipe is None or not cooked:
            continue
        if recipe["name"] not in order:
            order.append(recipe["name"])
        scale = Fraction(cooked).limit_denominator(100) / Fraction(recipe["servings"]).limit_denominator(100)
        for ing in recipe["ingredients"]:
            if not ing["name"].strip():
                continue
            key = item_key(ing["name"], ing["unit"])
            item = items.setdefault(key, {
                "key": key, "name": ing["name"].strip(), "unit": ing["unit"].strip(),
                "optional": True, "sources": {},
            })
            source = item["sources"].setdefault(recipe["name"], {"total": Fraction(0), "texts": []})
            qty = parse_qty(ing["qty"])
            if qty is not None:
                source["total"] += qty * scale
            elif ing["qty"].strip():
                source["texts"].append(ing["qty"].strip())
            item["optional"] = item["optional"] and ing.get("optional", False)

    out = []
    for item in sorted(items.values(), key=lambda i: i["name"].lower()):
        sources = item.pop("sources")
        total = sum((src["total"] for src in sources.values()), Fraction(0))
        texts = [t for src in sources.values() for t in src["texts"]]
        out.append(item | {
            "qty": _amount(total, texts),
            "sources": [{"recipe": name, "qty": _amount(src["total"], src["texts"])} for name, src in sources.items()],
        })
    return {"recipes": order, "items": out}


def staple_key(staple_id: int) -> str:
    """Own namespace: recipe keys are "name|unit", so "staple:<id>" can't collide."""
    return f"staple:{staple_id}"


def staples_section(staples: list[dict]) -> list[dict]:
    """Staples as list lines, as entered: never scaled, never merged with recipe items."""
    return [
        {
            "key": staple_key(s["id"]), "name": s["name"], "unit": s["unit"] or "", "qty": s["quantity"] or "",
            "optional": False, "sources": [], "staple": True,
        }
        for s in staples
    ]
