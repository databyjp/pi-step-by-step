/**
 * Pair Learning Extension for Pi
 *
 * Turns Pi into a pair learning tool. Pi breaks a task into incremental steps,
 * generates reference code per step based on actual project state, then guides
 * the user through coding each step — followed by comparison and discussion.
 *
 * See DESIGN.md for full architecture.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// --- Types ---

type State = "idle" | "planning" | "stepping" | "coding" | "reviewing";

interface LearnState {
	state: State;
	topic: string;
	totalSteps: number;
	currentStep: number;
	completedSteps: number[];
}

// --- Default state ---

function defaultState(): LearnState {
	return {
		state: "idle",
		topic: "",
		totalSteps: 0,
		currentStep: 0,
		completedSteps: [],
	};
}

// --- System prompts per state ---

const SYSTEM_PROMPTS: Record<Exclude<State, "idle">, (s: LearnState, skills?: string[]) => string> = {
	planning: (s) => `[LEARN MODE — PLANNING]

The user wants to learn: "${s.topic}"

Break this into small, incremental steps. Output a numbered list of step descriptions ONLY — no code yet.

Each step should introduce ONE new concept or change. If a step involves two new ideas (e.g. "install a library AND use two of its features"), split it into two steps. Err on the side of too granular — the user can always skip steps, but can't split them.

Think about how a human would actually build this:
- Start with the simplest possible foundation (e.g. install a framework, create a hello world)
- Each step builds on the previous one
- Each step should result in something you can run or verify
- Introduce one thing at a time: one new library, one new concept, one new feature

Example for "build a web API":
1. Install FastAPI and create a server that returns "hello world" on GET /
2. Add a GET /items endpoint that returns a hardcoded list
3. Add a POST /items endpoint that accepts a JSON body
...etc.

Do NOT write any code. Just describe the steps.`,

	stepping: (s, skills?: string[]) => {
		let skillInstruction: string;
		if (skills && skills.length > 0) {
			skillInstruction = `1. IMPORTANT: Before writing any code, read any skills that are relevant to this step. Available skills:\n${skills.map((name) => `   - /skill:${name}`).join("\n")}\n   Use the read tool to load relevant skill files. They contain the most up-to-date instructions and examples.`;
		} else {
			skillInstruction = "1. No skills are currently available — proceed with your own knowledge.";
		}

		return `[LEARN MODE — STEP ${s.currentStep}/${s.totalSteps}]

The user is learning: "${s.topic}"

This is step ${s.currentStep} of ${s.totalSteps}. Do the following:

${skillInstruction}
2. Read the current project files to understand what exists so far.
3. Write a reference implementation for JUST this step — the next small increment. Keep it minimal.
4. Then, present the step to the user as a clear ENGLISH INSTRUCTION — tell them WHAT to build, not HOW. Do not repeat your reference code in the instruction.

Format your response like this:

## Reference Implementation
(your code here — the next small increment only)

## Your Turn
(clear English description of what to build, without code)`;
	},

	coding: (s) => `[LEARN MODE — CODING step ${s.currentStep}/${s.totalSteps}]

The user is working on step ${s.currentStep} of their learning project: "${s.topic}"

They are writing their own implementation. Help them with ANY questions they have — syntax, concepts, debugging, "how do I do X", etc. Answer openly and directly. You are a pair partner, not an examiner.

Do not proactively show them the full solution unless they ask for it.`,

	reviewing: (s) => `[LEARN MODE — REVIEWING step ${s.currentStep}/${s.totalSteps}]

The user has submitted their implementation for step ${s.currentStep}: "${s.topic}"

Compare their implementation to your reference from earlier in the conversation. Discuss:
- Does it work correctly?
- Any differences in approach — and the tradeoffs of each
- Style, idioms, or patterns worth noting
- Anything they might want to refactor

Be a peer, not a grader. This is a conversation.

Also: briefly consider whether the remaining steps in the plan still make sense given what was actually built. If adjustments are needed, suggest them.`,
};

// --- Extension ---

export default function learnMode(pi: ExtensionAPI) {
	let learn: LearnState = defaultState();

	// --- UI updates ---

	function updateUI(ctx: ExtensionContext) {
		if (learn.state === "idle") {
			ctx.ui.setStatus("learn-mode", undefined);
			ctx.ui.setWidget("learn-mode", undefined);
			return;
		}

		// Footer status
		const stateLabel = learn.state === "stepping" ? "instruction" : learn.state;
		ctx.ui.setStatus(
			"learn-mode",
			ctx.ui.theme.fg("accent", `📖 step ${learn.currentStep}/${learn.totalSteps} — ${stateLabel}`),
		);

		// Progress widget
		const dots = [];
		for (let i = 1; i <= learn.totalSteps; i++) {
			if (learn.completedSteps.includes(i)) {
				dots.push(ctx.ui.theme.fg("success", "●"));
			} else if (i === learn.currentStep) {
				dots.push(ctx.ui.theme.fg("accent", "◐"));
			} else {
				dots.push(ctx.ui.theme.fg("muted", "○"));
			}
		}

		const truncatedTopic = learn.topic.length > 40 ? learn.topic.slice(0, 37) + "..." : learn.topic;
		ctx.ui.setWidget("learn-mode", [
			`  📖 ${truncatedTopic}  [${learn.currentStep}/${learn.totalSteps}]  ${dots.join(" ")}`,
		]);
	}

	// --- Persistence ---

	function persist() {
		pi.appendEntry("learn-mode", { ...learn });
	}

	function restore(ctx: ExtensionContext) {
		const entries = ctx.sessionManager.getEntries();
		const last = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "learn-mode")
			.pop() as { data?: LearnState } | undefined;

		if (last?.data) {
			learn = { ...defaultState(), ...last.data };
		}
	}

	// --- State transitions ---

	function setState(state: State, ctx: ExtensionContext) {
		learn.state = state;
		persist();
		updateUI(ctx);
	}

	function advanceStep(ctx: ExtensionContext): boolean {
		if (learn.currentStep >= learn.totalSteps) {
			// All steps complete
			learn.state = "idle";
			learn.completedSteps.push(learn.currentStep);
			persist();
			updateUI(ctx);
			return false;
		}
		learn.completedSteps.push(learn.currentStep);
		learn.currentStep++;
		learn.state = "stepping";
		persist();
		updateUI(ctx);
		return true;
	}

	// --- Commands ---

	pi.registerCommand("learn:start", {
		description: "Start a pair learning session",
		handler: async (args, ctx) => {
			if (learn.state !== "idle") {
				ctx.ui.notify("A learning session is already active. Finish it or start a new Pi session.", "error");
				return;
			}

			const topic = args?.trim();
			if (!topic) {
				ctx.ui.notify("Usage: /learn:start <topic>", "error");
				return;
			}

			learn = defaultState();
			learn.topic = topic;
			learn.state = "planning";
			persist();
			updateUI(ctx);

			// Send a message to Pi to generate the plan
			pi.sendUserMessage(`I want to learn how to: ${topic}\n\nPlease break this down into small, incremental steps.`);
		},
	});

	pi.registerCommand("learn:submit", {
		description: "Submit your implementation for review",
		handler: async (_args, ctx) => {
			if (learn.state !== "coding") {
				ctx.ui.notify(
					learn.state === "idle"
						? "No learning session active. Use /learn:start"
						: `Can't submit in ${learn.state} state. Expected: coding`,
					"error",
				);
				return;
			}

			setState("reviewing", ctx);

			pi.sendUserMessage(
				"I've finished my implementation for this step. Please review it — compare it to your reference and let's discuss.",
			);
		},
	});

	pi.registerCommand("learn:next", {
		description: "Finish reviewing, compact, and move to next step",
		handler: async (_args, ctx) => {
			if (learn.state !== "reviewing") {
				ctx.ui.notify(
					learn.state === "idle"
						? "No learning session active. Use /learn:start"
						: `Can't advance in ${learn.state} state. Expected: reviewing`,
					"error",
				);
				return;
			}

			const stepNum = learn.currentStep;
			const hasMore = advanceStep(ctx);

			if (!hasMore) {
				ctx.ui.notify("🎉 All steps complete! Learning session finished.", "success");
				pi.sendMessage(
					{
						customType: "learn-mode-complete",
						content: `**Learning session complete!** 🎉\n\nYou've worked through all ${learn.totalSteps} steps of: "${learn.topic}"`,
						display: true,
					},
					{ triggerTurn: false },
				);
				return;
			}

			ctx.ui.notify(`Step ${stepNum} complete. Compacting and moving to step ${learn.currentStep}...`, "info");

			// Compact, then trigger the next step
			ctx.compact({
				customInstructions: `Summarise what was learned in step ${stepNum}. Preserve: the step description, key differences between implementations, and decisions made. Discard: full code listings.`,
				onComplete: () => {
					pi.sendUserMessage(
						`Let's move on to step ${learn.currentStep} of ${learn.totalSteps}. Read the current project files and present the next increment.`,
					);
				},
				onError: (err) => {
					ctx.ui.notify(`Compaction failed: ${err.message}. Continuing anyway.`, "error");
					pi.sendUserMessage(
						`Let's move on to step ${learn.currentStep} of ${learn.totalSteps}. Read the current project files and present the next increment.`,
					);
				},
			});
		},
	});

	pi.registerCommand("learn:skip", {
		description: "Skip the current step",
		handler: async (_args, ctx) => {
			if (learn.state !== "stepping" && learn.state !== "coding") {
				ctx.ui.notify(
					learn.state === "idle"
						? "No learning session active. Use /learn:start"
						: `Can't skip in ${learn.state} state. Expected: stepping or coding`,
					"error",
				);
				return;
			}

			const skippedStep = learn.currentStep;
			const hasMore = advanceStep(ctx);

			if (!hasMore) {
				ctx.ui.notify("That was the last step. Learning session finished.", "success");
				return;
			}

			ctx.ui.notify(`Skipped step ${skippedStep}. Moving to step ${learn.currentStep}.`, "info");
			pi.sendUserMessage(
				`Step ${skippedStep} skipped. Let's move to step ${learn.currentStep} of ${learn.totalSteps}. Read the current project files and present the next increment.`,
			);
		},
	});

	pi.registerCommand("learn:show-plan", {
		description: "Show the learning plan and progress",
		handler: async (_args, ctx) => {
			if (learn.state === "idle") {
				ctx.ui.notify("No learning session active. Use /learn:start", "error");
				return;
			}

			const lines = [
				`📖 Learning: ${learn.topic}`,
				`State: ${learn.state}`,
				`Progress: step ${learn.currentStep} of ${learn.totalSteps}`,
				"",
				"Steps:",
			];

			for (let i = 1; i <= learn.totalSteps; i++) {
				const marker = learn.completedSteps.includes(i)
					? "✅"
					: i === learn.currentStep
						? "👉"
						: "  ";
				lines.push(`  ${marker} Step ${i}`);
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// --- Plan confirmation (after PLANNING, before first step) ---

	pi.on("agent_end", async (_event, ctx) => {
		if (learn.state !== "planning") return;
		if (!ctx.hasUI) return;

		const ok = await ctx.ui.confirm("Plan ready?", "Does the plan look good? (You can chat to adjust it first)");
		if (!ok) {
			ctx.ui.notify("Keep chatting to adjust the plan, then confirm when ready.", "info");
			return;
		}

		const countStr = await ctx.ui.input("How many steps?", "Enter the number of steps in the plan");
		const count = Number(countStr);
		if (!count || count < 1 || !Number.isFinite(count)) {
			ctx.ui.notify("Invalid number. Try confirming again after the next response.", "error");
			return;
		}

		learn.totalSteps = count;
		learn.currentStep = 1;
		setState("stepping", ctx);

		ctx.ui.notify(`Plan confirmed with ${count} steps. Starting step 1.`, "success");
		pi.sendUserMessage(
			`Plan confirmed. Let's start with step 1 of ${count}. Read the current project files and present the first increment.`,
		);
	});

	// --- System prompt injection ---

	pi.on("before_agent_start", async (event) => {
		if (learn.state === "idle") return;

		const promptFn = SYSTEM_PROMPTS[learn.state];
		if (!promptFn) return;

		// Extract available skill names for the stepping prompt
		const skills = event.systemPromptOptions?.skills?.map(
			(s: { name?: string }) => s.name,
		).filter(Boolean) as string[] | undefined;

		const content = typeof promptFn === "function" && promptFn.length > 1
			? (promptFn as (s: LearnState, skills?: string[]) => string)(learn, skills)
			: (promptFn as (s: LearnState) => string)(learn);

		return {
			message: {
				customType: "learn-mode-context",
				content,
				display: false,
			},
		};
	});

	// --- Transition from STEPPING to CODING after Pi presents the step ---

	pi.on("agent_end", async (_event, ctx) => {
		if (learn.state !== "stepping") return;

		setState("coding", ctx);
		ctx.ui.notify("Your turn! Write your implementation, then /learn:submit when done.", "info");
	});

	// --- Filter stale learn-mode context messages ---

	pi.on("context", async (event) => {
		if (learn.state === "idle") {
			return {
				messages: event.messages.filter((m) => {
					const msg = m as { customType?: string };
					return msg.customType !== "learn-mode-context";
				}),
			};
		}
	});

	// --- Restore state on session resume ---

	pi.on("session_start", async (_event, ctx) => {
		restore(ctx);
		updateUI(ctx);
	});
}
