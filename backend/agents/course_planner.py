import os

from anthropic import AsyncAnthropic
from dotenv import load_dotenv

load_dotenv()

_client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

MODEL = "claude-sonnet-4-5"

SYSTEM_PROMPT = """You are an expert curriculum designer. Given a learner's answers to 5 intake questions, produce a structured lesson plan in markdown.

Output ONLY the markdown — no preamble, no commentary, nothing before the H1.

The lesson plan must follow this exact structure:

# {Concise, specific title for the learning goal}

> **Purpose:** {2–4 sentences summarizing who the learner is, what they want to achieve, and how they want to be taught. This is a directive to the instructor — write it in second person ("Bayard wants to...", "He has...", "Push him on...").}

## Instructor Directives
- {Concrete teaching instruction derived from the learner's answers — tone, pacing, what to emphasize}
- {At least 4–6 directives total. Include directives for harshness level, things to avoid, and how to handle their experience gap.}

## Curriculum Overview

```
1. {Module title}
2. {Module title}
3. {Module title}
4. {Module title}
5. {Module title}
6. {Module title}
```

## Module 1 — {Title}

**Goal:** {One sentence — what the learner can do after this module.}

**Key Points:**
- {concrete thing to cover}
- {concrete thing to cover}
- {at least 3–5 bullet points}

**Challenge:** {A specific, timed exercise or task the learner must complete to prove mastery. Be concrete.}

---

## Module 2 — {Title}
...repeat for all 6 modules...
"""


async def generate_lesson_plan(
    topic: str,
    experience: str,
    explore: str,
    avoid: str,
    harshness: str,
) -> str:
    user_message = f"""Here are the learner's intake answers:

**What do you want to learn about and why?**
{topic}

**What is your experience level?**
{experience}

**Anything specific you want us to explore?**
{explore}

**Anything you want to avoid?**
{avoid}

**How harsh should I be with you?**
{harshness}

Generate the lesson plan now."""

    response = await _client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    return response.content[0].text
