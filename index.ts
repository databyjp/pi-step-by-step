/**
 * Step-by-Step Extension for Pi
 *
 * Turns Pi into a staged development tool. Pi breaks a task into incremental steps,
 * builds each one based on actual project state, then pauses for review and discussion
 * before moving on.
 *
 * See DESIGN.md for full architecture.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// --- Types ---

type State = "idle" | "planning" | "stepping" | "reviewing";

interface StepState {
	state: State;
	topic: string;
	totalSteps: number;
	currentStep: number;
	completedSteps: number[];
}

// --- Default state ---

function defaultState(): StepState {
	return {
		state: "idle",
		topic: "",
		totalSteps: 0,
		currentStep: 0,
		completedSteps: [],
	};
}

// --- System prompts per state ---

const SYSTEM_PROMPTS: Record<Exclude<State, "idle">, (s: StepState, skills?: string[]) => string> = {
	planning: (s) => `[STEP-BY-STEP MODE — PLANNING]

The user wants to build: "${s.topic}"

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

Do NOT write any code. Just describe the steps.

End your plan with: [STEPS: N] where N is the total number of steps.`,

	stepping: (s, skills?: string[]) => {
		let skillInstruction: string;
		if (skills && skills.length > 0) {
			skillInstruction = `1. IMPORTANT: Before writing any code, read any skills that are relevant to this step. Available skills:\n${skills.map((name) => `   - /skill:${name}`).join("\n")}\n   Use the read tool to load relevant skill files. They contain the most up-to-date instructions and examples.`;
		} else {
			skillInstruction = "1. No skills are currently available — proceed with your own knowledge.";
		}

		return `[STEP-BY-STEP MODE — STEP ${s.currentStep}/${s.totalSteps}]

The user is building: "${s.topic}"

This is step ${s.currentStep} of ${s.totalSteps}. Do the following:

${skillInstruction}
2. Use the ls and read tools to examine the current project directory and files. You MUST do this — do not rely on conversation history or assumptions about what exists. The conversation may have been compacted.
3. Write the code for JUST this step — the next small increment. Keep it minimal.
4. Explain what you did and why — what does this step add, and what design choices did you make?

The user will review your work, discuss it with you, and may ask you to adjust it before moving on.`;
	},

	reviewing: (s) => `[STEP-BY-STEP MODE — REVIEWING step ${s.currentStep}/${s.totalSteps}]

The user is reviewing step ${s.currentStep}: "${s.topic}"

The user may:
- Ask questions about what you built and why
- Request changes or a different approach
- Write their own version and ask you to compare
- Discuss tradeoffs, alternatives, or patterns
- Or simply move on

Help them however they need. If they've written their own code, compare approaches and discuss tradeoffs as a peer.

Also: briefly consider whether the remaining steps in the plan still make sense given what was actually built. If adjustments are needed, suggest them.

IMPORTANT: Do NOT advance to the next step. Do NOT present the next step's code or instructions. The user will use /step-by-step:next when they are ready to move on. Your only job right now is to help with the CURRENT step.`,
};

// --- Extension ---

export default function stepByStep(pi: ExtensionAPI) {
	let steps: StepState = defaultState();

	// --- UI updates ---

	function updateUI(ctx: ExtensionContext) {
		if (steps.state === "idle") {
			ctx.ui.setStatus("step-by-step", undefined);
			ctx.ui.setWidget("step-by-step", undefined);
			return;
		}

		// Footer status
		const stateLabel = steps.state === "stepping" ? "building" : steps.state;
		ctx.ui.setStatus(
			"step-by-step",
			ctx.ui.theme.fg("accent", `🔨 step ${steps.currentStep}/${steps.totalSteps} — ${stateLabel}`),
		);

		// Progress widget
		const dots = [];
		for (let i = 1; i <= steps.totalSteps; i++) {
			if (steps.completedSteps.includes(i)) {
				dots.push(ctx.ui.theme.fg("success", "●"));
			} else if (i === steps.currentStep) {
				dots.push(ctx.ui.theme.fg("accent", "◐"));
			} else {
				dots.push(ctx.ui.theme.fg("muted", "○"));
			}
		}

		const truncatedTopic = steps.topic.length > 40 ? steps.topic.slice(0, 37) + "..." : steps.topic;
		ctx.ui.setWidget("step-by-step", [
			`  🔨 ${truncatedTopic}  [${steps.currentStep}/${steps.totalSteps}]  ${dots.join(" ")}`,
		]);
	}

	// --- Persistence ---

	function persist() {
		pi.appendEntry("step-by-step", { ...steps });
	}

	function restore(ctx: ExtensionContext) {
		const entries = ctx.sessionManager.getEntries();
		const last = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "step-by-step")
			.pop() as { data?: StepState } | undefined;

		if (last?.data) {
			steps = { ...defaultState(), ...last.data };
		}
	}

	// --- State transitions ---

	function setState(state: State, ctx: ExtensionContext) {
		steps.state = state;
		persist();
		updateUI(ctx);
	}

	function advanceStep(ctx: ExtensionContext): boolean {
		if (steps.currentStep >= steps.totalSteps) {
			steps.state = "idle";
			steps.completedSteps.push(steps.currentStep);
			persist();
			updateUI(ctx);
			return false;
		}
		steps.completedSteps.push(steps.currentStep);
		steps.currentStep++;
		steps.state = "stepping";
		persist();
		updateUI(ctx);
		return true;
	}

	// --- Commands ---

	pi.registerCommand("step-by-step:start", {
		description: "Start a step-by-step building session",
		handler: async (args, ctx) => {
			if (steps.state !== "idle") {
				ctx.ui.notify("A step-by-step session is already active. Finish it or start a new Pi session.", "error");
				return;
			}

			const topic = args?.trim();
			if (!topic) {
				ctx.ui.notify("Usage: /step-by-step:start <topic>", "error");
				return;
			}

			steps = defaultState();
			steps.topic = topic;
			steps.state = "planning";
			persist();
			updateUI(ctx);

			pi.sendUserMessage(`I want to build: ${topic}\n\nPlease break this down into small, incremental steps.`);
		},
	});

	pi.registerCommand("step-by-step:next", {
		description: "Finish reviewing and move to next step",
		handler: async (_args, ctx) => {
			if (steps.state !== "reviewing") {
				ctx.ui.notify(
					steps.state === "idle"
						? "No step-by-step session active. Use /step-by-step:start"
						: `Can't advance in ${steps.state} state. Expected: reviewing`,
					"error",
				);
				return;
			}

			const stepNum = steps.currentStep;
			const hasMore = advanceStep(ctx);

			if (!hasMore) {
				ctx.ui.notify("🎉 All steps complete!", "success");
				pi.sendMessage(
					{
						customType: "step-by-step-complete",
						content: `**All steps complete!** 🎉\n\nYou've worked through all ${steps.totalSteps} steps of: "${steps.topic}"`,
						display: true,
					},
					{ triggerTurn: false },
				);
				return;
			}

			// Offer to commit the step
			try {
				const { stdout: statusOut } = await pi.exec("git", ["status", "--porcelain"]);
				if (statusOut.trim()) {
					const shouldCommit = await ctx.ui.confirm(
						"Commit?",
						`Commit step ${stepNum} before moving on?`,
					);
					if (shouldCommit) {
						await pi.exec("git", ["add", "-A"]);
						await pi.exec("git", ["commit", "-m", `step ${stepNum}: ${steps.topic}`]);
						ctx.ui.notify(`Committed step ${stepNum}.`, "success");
					}
				}
			} catch {
				// Not a git repo or git not available — skip silently
			}

			const nextStepMessage = `Let's move on to step ${steps.currentStep} of ${steps.totalSteps}. Read the current project files and build the next increment.`;

			// Only compact if context is above 50% of the window
			const usage = ctx.getContextUsage();
			const shouldCompact = usage && usage.contextWindow > 0 && usage.tokens > usage.contextWindow * 0.5;

			if (shouldCompact) {
				ctx.ui.notify(`Step ${stepNum} complete. Compacting and moving to step ${steps.currentStep}...`, "info");
				ctx.compact({
					customInstructions: `Summarise step ${stepNum}. Preserve: what was built, key design decisions, and any concerns raised. Discard: full code listings.`,
					onComplete: () => {
						pi.sendUserMessage(nextStepMessage);
					},
					onError: (err) => {
						ctx.ui.notify(`Compaction failed: ${err.message}. Continuing anyway.`, "error");
						pi.sendUserMessage(nextStepMessage);
					},
				});
			} else {
				ctx.ui.notify(`Step ${stepNum} complete. Moving to step ${steps.currentStep}...`, "info");
				pi.sendUserMessage(nextStepMessage);
			}
		},
	});

	pi.registerCommand("step-by-step:skip", {
		description: "Skip the current step",
		handler: async (_args, ctx) => {
			if (steps.state !== "stepping" && steps.state !== "reviewing") {
				ctx.ui.notify(
					steps.state === "idle"
						? "No step-by-step session active. Use /step-by-step:start"
						: `Can't skip in ${steps.state} state. Expected: stepping or reviewing`,
					"error",
				);
				return;
			}

			const skippedStep = steps.currentStep;
			const hasMore = advanceStep(ctx);

			if (!hasMore) {
				ctx.ui.notify("That was the last step. Session finished.", "success");
				return;
			}

			ctx.ui.notify(`Skipped step ${skippedStep}. Moving to step ${steps.currentStep}.`, "info");
			pi.sendUserMessage(
				`Step ${skippedStep} skipped. Let's move to step ${steps.currentStep} of ${steps.totalSteps}. Read the current project files and build the next increment.`,
			);
		},
	});

	pi.registerCommand("step-by-step:show-plan", {
		description: "Show the plan and progress",
		handler: async (_args, ctx) => {
			if (steps.state === "idle") {
				ctx.ui.notify("No step-by-step session active. Use /step-by-step:start", "error");
				return;
			}

			const lines = [
				`🔨 Building: ${steps.topic}`,
				`State: ${steps.state}`,
				`Progress: step ${steps.currentStep} of ${steps.totalSteps}`,
				"",
				"Steps:",
			];

			for (let i = 1; i <= steps.totalSteps; i++) {
				const marker = steps.completedSteps.includes(i)
					? "✅"
					: i === steps.currentStep
						? "👉"
						: "  ";
				lines.push(`  ${marker} Step ${i}`);
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// --- Plan confirmation (after PLANNING, before first step) ---

	pi.on("agent_end", async (event, ctx) => {
		if (steps.state !== "planning") return;
		if (!ctx.hasUI) return;

		// Try to extract step count from the last assistant message
		let extractedCount: number | null = null;
		const messages = event.messages ?? [];
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role === "assistant" && Array.isArray(msg.content)) {
				const text = msg.content
					.filter((c: { type: string }) => c.type === "text")
					.map((c: { type: string; text?: string }) => c.text ?? "")
					.join("\n");
				const match = text.match(/\[STEPS:\s*(\d+)\]/);
				if (match) {
					extractedCount = Number(match[1]);
				}
				break;
			}
		}

		const ok = await ctx.ui.confirm(
			"Plan ready?",
			extractedCount
				? `${extractedCount} steps found. Does the plan look good? (You can chat to adjust it first)`
				: "Does the plan look good? (You can chat to adjust it first)",
		);
		if (!ok) {
			ctx.ui.notify("Keep chatting to adjust the plan, then confirm when ready.", "info");
			return;
		}

		let count = extractedCount;
		if (!count) {
			const countStr = await ctx.ui.input("How many steps?", "Enter the number of steps in the plan");
			count = Number(countStr);
			if (!count || count < 1 || !Number.isFinite(count)) {
				ctx.ui.notify("Invalid number. Try confirming again after the next response.", "error");
				return;
			}
		}

		steps.totalSteps = count;
		steps.currentStep = 1;
		setState("stepping", ctx);

		ctx.ui.notify(`Plan confirmed with ${count} steps. Starting step 1.`, "success");
		pi.sendUserMessage(
			`Plan confirmed. Let's start with step 1 of ${count}. Read the current project files and build the first increment.`,
		);
	});

	// --- System prompt injection ---

	pi.on("before_agent_start", async (event) => {
		if (steps.state === "idle") return;

		const promptFn = SYSTEM_PROMPTS[steps.state];
		if (!promptFn) return;

		// Extract available skill names for the stepping prompt
		const skills = event.systemPromptOptions?.skills?.map(
			(s: { name?: string }) => s.name,
		).filter(Boolean) as string[] | undefined;

		return {
			message: {
				customType: "step-by-step-context",
				content: promptFn(steps, skills),
				display: false,
			},
		};
	});

	// --- Transition from STEPPING to REVIEWING after Pi presents the step ---

	pi.on("agent_end", async (_event, ctx) => {
		if (steps.state !== "stepping") return;

		setState("reviewing", ctx);
		ctx.ui.notify("Review this step. Discuss, adjust, or /step-by-step:next when ready.", "info");
	});

	// --- Filter stale context messages ---

	pi.on("context", async (event) => {
		if (steps.state === "idle") {
			return {
				messages: event.messages.filter((m) => {
					const msg = m as { customType?: string };
					return msg.customType !== "step-by-step-context";
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
