# Step-by-Step Extension for Pi

## Overview

A Pi extension for staged, incremental development. Pi breaks a task into small steps, builds each one based on actual project state, then pauses for review and discussion before moving on.

The core value is **pacing** — building at a human pace, one verified increment at a time, rather than generating hundreds of lines in one shot. This is useful for:

- Building something you've never built before
- Working in an unfamiliar codebase
- Reviewing and understanding what an AI builds, as it builds it
- Learning a new language or framework by doing

## States

```
IDLE → PLANNING → STEPPING → REVIEWING
                      ↑           │
                      └───────────┘
                      (compact & next)
```

- **IDLE** — No session active. Normal Pi behaviour.
- **PLANNING** — Pi breaks the user's request into a rough outline of small steps (descriptions only, no code). The user can review and adjust the plan before starting.
- **STEPPING** — Pi reads the current state of the project, builds the next small increment, and explains what it did and why.
- **REVIEWING** — The user reviews the step: asks questions, requests changes, discusses tradeoffs, writes their own version, or simply moves on. Free-form conversation until the user advances.

## Commands

| Command | Available in | What it does |
|---|---|---|
| `/step-by-step:start <topic>` | IDLE | Starts a session → PLANNING |
| `/step-by-step:next` | REVIEWING | Compacts (if needed) and advances → STEPPING |
| `/step-by-step:skip` | STEPPING, REVIEWING | Skips current step → STEPPING (or IDLE if last) |
| `/step-by-step:show-plan` | Any (except IDLE) | Shows the full plan with completion progress |

## UI

Progress widget shown above the editor during an active session:

```
🔨 REST API with FastAPI  [3/8]  ● ● ◐ ○ ○ ○ ○ ○
```

Footer status shows current state (e.g. `🔨 step 3/8 — reviewing`).

## System Prompt Injection

Via `before_agent_start`, varying by state:

- **PLANNING** — Instructs Pi to break the topic into small steps (descriptions only, no code). Steps should be incremental and buildable — each one a small working addition to the project.
- **STEPPING** — Instructs Pi to read relevant skills (listing them by name), examine current project files, build the next increment, and explain what it did and why.
- **REVIEWING** — Instructs Pi to help the user review the step however they need: answer questions, make changes, compare approaches, discuss tradeoffs. Explicitly told not to advance to the next step.

## Compaction

On `/step-by-step:next`, the extension checks context usage via `ctx.getContextUsage()`. If context exceeds 50% of the model's window, it compacts with custom instructions:

> "Summarise step N. Preserve: what was built, key design decisions, and any concerns raised. Discard: full code listings."

If context is under 50%, it skips compaction and advances directly.

Step metadata and progress are persisted via `pi.appendEntry()` and survive compaction.

## State Persistence

Extension state (current step, plan steps, completion status) is persisted via `pi.appendEntry("step-by-step", {...})` and restored in `session_start` on resume.

## Skills

During STEPPING, the extension reads `event.systemPromptOptions.skills` and lists available skill names in the system prompt. Pi is instructed to read relevant skills before writing code, so reference implementations use up-to-date instructions rather than training data.

## Design Decisions

- **Outline first, code per step** — PLANNING produces only step descriptions. Code is written at STEPPING time based on actual project state.
- **Steps are mutable** — The plan is a living outline. During REVIEWING, Pi re-evaluates remaining steps based on what was actually built.
- **Incremental, not top-down** — Each step is a small, working addition. Not a decomposition of a finished application.
- **No tool restrictions** — Full Pi access at all times.
- **No forced learning mode** — The user reviews each step however they want: read and approve, ask questions, rewrite it themselves, or discuss alternatives.
- **No explicit end command** — Session ends naturally when all steps complete, or when the user starts a new Pi session.
- **Conditional compaction** — Only compacts when context usage warrants it, to avoid losing useful context on early steps.
