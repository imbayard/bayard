import logging

from backend.agents.base import forced_tool_call
from backend.api import artifact_store
from backend.api.lesson_plan_store import get_plan
from backend.api.module_store import get_modules
from backend.config import MODEL_GENERATOR

MODEL = MODEL_GENERATOR

GENERATORS = {
    "flashcards": {
        "system": "Generate 5-8 flashcards for this module.",
        "tool": {
            "name": "save_flashcards",
            "description": "Save flashcard set for a module.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "cards": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "front": {"type": "string"},
                                "back": {"type": "string"},
                            },
                            "required": ["front", "back"],
                        },
                    }
                },
                "required": ["cards"],
            },
        },
    },
    "quiz": {
        "system": "Generate a 4-6 question quiz for this module.",
        "tool": {
            "name": "save_quiz",
            "description": "Save quiz questions for a module.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "question": {"type": "string"},
                                "options": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "answer": {"type": "string"},
                            },
                            "required": ["question", "options", "answer"],
                        },
                    }
                },
                "required": ["questions"],
            },
        },
    },
    "exercise": {
        "system": (
            "Generate a list of 3-6 exercises for this module. "
            "Each needs a short name, a rep/duration string (e.g. '3 sets × 10 reps', '30 seconds'), "
            "and 1-2 sentences of form or execution instructions."
        ),
        "tool": {
            "name": "save_exercise",
            "description": "Save exercise list for a module.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "exercises": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name":         {"type": "string"},
                                "reps":         {"type": "string"},
                                "instructions": {"type": "string"},
                            },
                            "required": ["name", "reps", "instructions"],
                        },
                    }
                },
                "required": ["exercises"],
            },
        },
    },
    "reading": {
        "system": "Generate a short reading passage for this module.",
        "tool": {
            "name": "save_reading",
            "description": "Save reading content for a module.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "body": {"type": "string"},
                },
                "required": ["title", "body"],
            },
        },
    },
    "video": {
        "system": "Generate a YouTube search query and topic list for this module.",
        "tool": {
            "name": "save_video",
            "description": "Save video search info for a module.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "topics": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["query", "topics"],
            },
        },
    },
    "project": {
        "system": "Generate a mini-project for this module.",
        "tool": {
            "name": "save_project",
            "description": "Save project for a module.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "deliverables": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["description", "deliverables"],
            },
        },
    },
    "checklist": {
        "system": "Generate a completion checklist for this module.",
        "tool": {
            "name": "save_checklist",
            "description": "Save checklist for a module.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {"type": "string"},
                    }
                },
                "required": ["items"],
            },
        },
    },
    "code_exercise": {
        "system": (
            "Generate a Python coding exercise for this module. "
            "Provide a clear problem description, Python starter code with comments "
            "guiding the learner, and a short test snippet that prints PASS or FAIL "
            "for each test case. The starter code should be runnable as-is (it can "
            "print placeholder output) so the learner can hit Run immediately."
        ),
        "tool": {
            "name": "save_code_exercise",
            "description": "Save a Python code exercise for a module.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "starter_code": {"type": "string"},
                    "tests": {"type": "string"},
                },
                "required": ["description", "starter_code"],
            },
        },
    },
    "reference": {
        "system": "Generate a structured reference sheet for this module.",
        "tool": {
            "name": "save_reference",
            "description": "Save reference content for a module.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "sections": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "heading": {"type": "string"},
                                "content": {"type": "string"},
                            },
                            "required": ["heading", "content"],
                        },
                    }
                },
                "required": ["sections"],
            },
        },
    },
}


async def generate_artifact(artifact: dict, module: dict) -> None:
    generator = GENERATORS.get(artifact["type"])
    if not generator:
        return
    logging.info(
        "artifact_generator: generating %s for module %d",
        artifact["type"],
        module["id"],
    )

    plan = await get_plan(module["plan_id"])
    siblings = await get_modules(module["plan_id"])

    sequence = "\n".join(
        f"  {m['position']}. [{m['type']}] {m['name']} — {m['description']}"
        + (" ← THIS MODULE" if m["id"] == module["id"] else "")
        for m in siblings
    )

    user_content = (
        f"# Learning Goal\n{plan['title']}\n\n"
        f"# Curriculum Rubric\n{plan['plan']}\n\n"
        f"# Module Sequence\n{sequence}\n\n"
        f"# Target Module\n"
        f"Name: {module['name']}\n"
        f"Type: {module['type']}\n"
        f"Description: {module['description']}\n\n"
        f"Generate content now."
    )

    result = await forced_tool_call(
        system=generator["system"],
        user_content=user_content,
        tool=generator["tool"],
        model=MODEL,
    )
    if result:
        await artifact_store.update_artifact(artifact["id"], result)
        logging.info(
            "artifact_generator: saved %s id=%d", artifact["type"], artifact["id"]
        )
