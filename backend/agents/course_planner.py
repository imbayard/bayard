import logging

from backend.agents.base import client, forced_tool_call
from backend.config import MODEL_PLANNER

MODEL = MODEL_PLANNER

PLAN_SYSTEM_PROMPT = """You are an expert curriculum designer. Given a learner's answers to 5 intake questions, produce a lesson plan overview in markdown.

Output ONLY the markdown — no preamble, no commentary, nothing before the H1.

The overview must follow this exact structure:

# {Concise, specific title for the learning goal}

> **Purpose:** {2–4 sentences summarizing who the learner is, what they want to achieve, and how they want to be taught. Write in second person ("Bayard wants to...", "He has...", "Push him on...").}

## Instructor Directives
- {Concrete teaching instruction derived from the learner's answers — tone, pacing, what to emphasize}
- {At least 4–6 directives total. Include directives for harshness level, things to avoid, and how to handle their experience gap.}

## Curriculum Overview

1. {Module title} — {one-line description of what the learner can do after this module}
2. {Module title} — {one-line description}
3. {Module title} — {one-line description}
4. {Module title} — {one-line description}
5. {Module title} — {one-line description}
6. {Module title} — {one-line description}"""

EXTRACT_SYSTEM_PROMPT = """You extract structured module data from curriculum plans. When given a lesson plan overview and the original learner intake answers, call save_modules with the full detailed breakdown for each module in the curriculum."""

SAVE_MODULES_TOOL = {
    "name": "save_modules",
    "description": "Record the structured module breakdown for this lesson plan.",
    "input_schema": {
        "type": "object",
        "properties": {
            "modules": {
                "type": "array",
                "description": "The modules in order",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Module title"},
                        "description": {"type": "string", "description": "One sentence — what the learner can do after this module"},
                        "type": {
                            "type": "string",
                            "enum": ["physical", "conceptual", "applicable"],
                            "description": "physical — involves movement, exercise, or body mechanics; conceptual — understanding ideas, theory, or mental models; applicable — applying knowledge to real situations, practice, or projects",
                        },
                    },
                    "required": ["name", "description", "type"],
                },
            }
        },
        "required": ["modules"],
    },
}


async def generate_lesson_plan(
    topic: str,
    experience: str,
    explore: str,
    avoid: str,
    harshness: str,
) -> tuple[str, list[dict]]:
    intake = f"""**What do you want to learn about and why?**
{topic}

**What is your experience level?**
{experience}

**Anything specific you want us to explore?**
{explore}

**Anything you want to avoid?**
{avoid}

**How harsh should I be with you?**
{harshness}"""

    # Step 1: Generate the plan overview markdown
    logging.info("course_planner: step 1 — generating plan overview")
    plan_response = await client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=PLAN_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"{intake}\n\nGenerate the lesson plan overview now."}],
    )
    logging.info("course_planner: step 1 stop_reason=%s content_blocks=%d", plan_response.stop_reason, len(plan_response.content))
    plan_text = plan_response.content[0].text.strip()
    logging.info("course_planner: plan_text length=%d", len(plan_text))

    # Step 2: Extract structured modules (forced tool call)
    logging.info("course_planner: step 2 — extracting modules")
    result = await forced_tool_call(
        system=EXTRACT_SYSTEM_PROMPT,
        user_content=f"Learner intake:\n{intake}\n\nCurriculum overview:\n{plan_text}\n\nCall save_modules with the full breakdown for each module.",
        tool=SAVE_MODULES_TOOL,
        model=MODEL,
    )
    captured_modules = result.get("modules", [])
    logging.info("course_planner: captured %d modules", len(captured_modules))

    return plan_text, captured_modules
