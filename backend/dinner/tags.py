"""Tag constants and pure normalization helpers.

The registry itself lives in `dinner.db` (`tag_categories`, `tags`; see store.py) and is edited
from the app. Recipes still store tag names as a JSON list; a tag is "registered" when its name
matches a `tags` row case/whitespace-insensitively, otherwise it's free-form and has no meaning.

This module stays I/O-free so planner.py can import it: callers pass the registry names in.
The constants below are the tags the app attaches meaning to — the seed guarantees they exist
and the store refuses to rename or delete them.
"""

from collections.abc import Iterable

MEAL_PREP_TAG = "good for meal prep"
LUNCH_TAG = "lunch"
DINNER_TAG = "dinner"
MEAL_CATEGORY = "meal"

PROTECTED_TAGS = (MEAL_PREP_TAG, LUNCH_TAG, DINNER_TAG)
PROTECTED_CATEGORIES = (MEAL_CATEGORY,)

# Starter registry, seeded once into an empty `tags` table. None = uncategorized.
SEED: dict[str | None, list[str]] = {
    MEAL_CATEGORY: [LUNCH_TAG, DINNER_TAG],
    "temperature": ["hot", "cold"],
    "cuisine": ["Mexican", "Asian", "Italian", "American", "Mediterranean", "Indian", "Other"],
    None: [MEAL_PREP_TAG],
}


def tag_key(tag: str) -> str:
    """Matching key: whitespace collapsed, case folded."""
    return " ".join(tag.split()).lower()


def clean_name(name: str) -> str:
    """Display spelling for a new registry name: whitespace collapsed, case kept."""
    return " ".join(name.split())


def normalize_tag(tag: str, registry: Iterable[str] = PROTECTED_TAGS) -> str:
    """Registry match (case- and whitespace-insensitive) → canonical spelling; else just trimmed.

    `registry` is the registry's tag names (e.g. `await store.registry_names()`, or the keys of
    `store.tag_categories()`). The default covers the protected tags, which always exist.
    """
    return next((r for r in registry if tag_key(r) == tag_key(tag)), tag.strip())


def normalize_tags(tags: list[str], registry: Iterable[str] = PROTECTED_TAGS) -> list[str]:
    canonical = {tag_key(r): r for r in registry}
    return list(dict.fromkeys(canonical.get(tag_key(t), t.strip()) for t in tags if t.strip()))
