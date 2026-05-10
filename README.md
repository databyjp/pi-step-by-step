# step-by-step

A [Pi](https://github.com/earendil-works/pi) extension for staged, incremental development.

Instead of building everything in one shot, Pi breaks a task into small steps and builds each one on the real project state — pausing after each for you to review, discuss, and adjust before moving on.

## Install

Copy the extension to your global Pi extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions/step-by-step
cp index.ts ~/.pi/agent/extensions/step-by-step/index.ts
```

Then `/reload` in any Pi session to pick it up.

## Usage

### Start a session

```
/step-by-step:start Build a REST API with FastAPI
```

Pi produces a step-by-step plan. Review it, adjust if needed, then confirm.

### Work through steps

For each step, Pi:

1. Reads any relevant skills (if available) for up-to-date instructions
2. Reads your current project files
3. Builds the next small increment
4. Explains what it did and why

Then you review. Ask questions, request changes, discuss tradeoffs, rewrite it yourself — whatever you need. When you're satisfied:

```
/step-by-step:next
```

The conversation is compacted (if needed) and Pi builds the next step.

### Commands

| Command | Description |
|---|---|
| `/step-by-step:start <topic>` | Start a session |
| `/step-by-step:next` | Done reviewing — advance to next step |
| `/step-by-step:skip` | Skip the current step |
| `/step-by-step:show-plan` | Show the full plan with progress |

### UI

A progress widget is shown throughout the session:

```
🔨 REST API with FastAPI  [3/8]  ● ● ◐ ○ ○ ○ ○ ○
```

## How it works

The extension is a state machine:

```
IDLE → PLANNING → STEPPING → REVIEWING
                      ↑           │
                      └───────────┘
                      (compact & next)
```

- **PLANNING** — Pi outlines the steps (descriptions only, no code)
- **STEPPING** — Pi reads the project, builds the next increment, explains it
- **REVIEWING** — You review, discuss, adjust. Move on when ready.

State is persisted in the session, so it survives restarts.

## Design principles

- **Incremental, not top-down** — each step is a small working addition, like how you'd actually build something
- **Review however you want** — read and approve, ask questions, rewrite it yourself, or discuss alternatives
- **Skills-aware** — Pi reads available agent skills for up-to-date instructions when building each step
- **Smart compaction** — only compacts when context usage warrants it

See [DESIGN.md](DESIGN.md) for the full architecture.
