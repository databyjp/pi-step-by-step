# learn-mode

A [Pi](https://github.com/earendil-works/pi) extension that turns Pi into a pair learning tool.

Instead of building everything for you, Pi breaks a task into small incremental steps, generates a reference implementation for each one based on the current state of your project, then lets you code it yourself — followed by comparison and discussion.

## Install

Copy the extension to your global Pi extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions/learn-mode
cp index.ts ~/.pi/agent/extensions/learn-mode/index.ts
```

Then `/reload` in any Pi session to pick it up.

## Usage

### Start a session

```
/learn:start Build a REST API with FastAPI
```

Pi produces a step-by-step plan. Review it, adjust if needed, then confirm. The extension asks how many steps are in the plan and begins.

### Work through steps

For each step, Pi:

1. Reads any relevant skills (if available) for up-to-date instructions
2. Reads your current project files
3. Writes a small reference implementation (the next increment only)
4. Gives you an English instruction — what to build, not how

Then it's your turn. Write your code. Ask Pi anything while you work — syntax, concepts, debugging, "how do I do X". Pi answers openly.

When you're done:

```
/learn:submit
```

Pi compares your implementation to its reference and discusses tradeoffs, style, and correctness.

When you're ready to move on:

```
/learn:next
```

The conversation is compacted (preserving a summary of what you learned) and Pi presents the next step.

### Commands

| Command | Description |
|---|---|
| `/learn:start <topic>` | Start a learning session |
| `/learn:submit` | Submit your implementation for review |
| `/learn:next` | Done discussing — compact and advance to next step |
| `/learn:skip` | Skip the current step |
| `/learn:show-plan` | Show the full plan with progress |

### UI

A progress widget is shown throughout the session:

```
📖 REST API with FastAPI  [3/8]  ● ● ◐ ○ ○ ○ ○ ○
```

## How it works

The extension is a state machine:

```
IDLE → PLANNING → STEPPING → CODING → REVIEWING
                      ↑                    │
                      └────────────────────┘
                        (compact & next)
```

- **PLANNING** — Pi outlines the steps (descriptions only, no code)
- **STEPPING** — Pi reads your project, writes a reference, gives you an instruction
- **CODING** — You write code; Pi helps with any questions
- **REVIEWING** — Pi compares implementations and discusses tradeoffs

State is persisted in the session, so it survives restarts.

## Design principles

- **Incremental, not top-down** — each step is a small working addition, like how you'd actually build something
- **No code hiding** — Pi's reference is in the conversation if you scroll up; the learning comes from trying first
- **No grading** — the review is a conversation, not a score
- **Open help** — Pi answers any question fully during coding; it's a pair partner, not an examiner
- **Skills-aware** — Pi reads available agent skills for up-to-date instructions when generating reference code

See [DESIGN.md](DESIGN.md) for the full architecture.
