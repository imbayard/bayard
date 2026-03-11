import logging

from backend.agents.base import forced_tool_call
from backend.api import artifact_store
from backend.config import MODEL_PLANNER

MODEL = MODEL_PLANNER

ARTIFACT_TYPES = [
    "flashcards",
    "quiz",
    "exercise",
    "reading",
    "video",
    "project",
    "checklist",
    "reference",
    "code_exercise",
]

SEED_ARTIFACTS_TOOL = {
    "name": "assign_artifacts",
    "description": "Assign 1-2 artifact types to each module.",
    "input_schema": {
        "type": "object",
        "properties": {
            "assignments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "module_id": {"type": "integer"},
                        "type": {
                            "type": "string",
                            "enum": ARTIFACT_TYPES,
                        },
                    },
                    "required": ["module_id", "type"],
                },
            }
        },
        "required": ["assignments"],
    },
}


async def seed_artifacts(modules: list[dict]) -> None:
    if not modules:
        return
    logging.info("artifact_seeder: seeding %d modules", len(modules))
    module_list = "\n".join(
        f"- id={m['id']} name={m['name']!r} type={m['type']} description={m['description']!r}"
        for m in modules
    )
    result = await forced_tool_call(
        system="You are a curriculum artifact planner. Given modules with their IDs, assign 1-2 artifact types to each module that best suit its type and learning goal.",
        user_content=f"Assign 1-2 artifact types to each module:\n\n{module_list}\n\nCall assign_artifacts with all assignments.",
        tool=SEED_ARTIFACTS_TOOL,
        model=MODEL,
    )
    assignments = result.get("assignments", [])
    logging.info("artifact_seeder: got %d assignments", len(assignments))
    if assignments:
        await artifact_store.save_artifacts(assignments)
