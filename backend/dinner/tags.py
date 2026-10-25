"""Canonical tag registry.

Tags stay free-form; the registry only pins one spelling for tags the app attaches meaning to
(the meal planner reads MEAL_PREP_TAG). Hardcoded on purpose — no table until there's a reason.
"""

MEAL_PREP_TAG = "good for meal prep"
TAG_REGISTRY = [MEAL_PREP_TAG]

_CANONICAL = {t.lower(): t for t in TAG_REGISTRY}


def normalize_tag(tag: str) -> str:
    """Registry match (case- and whitespace-insensitive) → canonical spelling; else just trimmed."""
    return _CANONICAL.get(" ".join(tag.split()).lower(), tag.strip())


def normalize_tags(tags: list[str]) -> list[str]:
    return list(dict.fromkeys(normalize_tag(t) for t in tags if t.strip()))
