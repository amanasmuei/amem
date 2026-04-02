---
name: context
description: Load full memory context for the current task. Use automatically at the start of coding tasks to load corrections, decisions, and relevant background. Also use when switching topics mid-session.
---

# Load Memory Context

Load all relevant memory context for a topic or the current task.

## Instructions

1. Determine the topic from the user's request or the current conversation context.

2. Execute this sequence:
   a. Call `memory_inject` with the topic — surfaces corrections (MUST follow) and decisions (SHOULD follow)
   b. Call `reminder_check` — show any overdue or upcoming reminders
   c. Call `memory_tier` with `action: "list"`, `tier: "core"` — load always-on context
   d. If more context needed, call `memory_context` with the topic for broader background

3. Present the context naturally:
   - Lead with corrections: "I remember these constraints..."
   - Then decisions: "Previous decisions on this topic..."
   - Then patterns/preferences if relevant

4. Apply corrections as **absolute constraints** — never violate them.

## When to Use

- Start of any new task or topic
- When the user asks "what do you know about X?"
- When switching between different parts of the codebase
- Before writing code that might have constraints
