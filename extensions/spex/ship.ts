import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getShipStatePath, SHIP_STAGE_NAMES, type ShipAskLevel, type ShipStageName, type ShipState, isShipStageName, loadShipState, createShipState, advanceShipState, pauseShipState, resumeShipState, failShipState, cleanupShipState, saveShipState, validateResumeState } from "./ship-state.js";
import { formatEnabledTraits, type SpexConfig } from "./state.js";

export const SHIP_STATE_TOOL_NAME = "spex_ship_state";

export type ShipCommandArgs = {
  brainstormFile?: string;
  ask?: ShipAskLevel;
  resume: boolean;
  startFrom?: ShipStageName;
  mode: "run" | "status" | "cleanup";
};

export type ShipStateToolParams =
  | { action: "status" }
  | { action: "cleanup" }
  | { action: "advance" }
  | { action: "create"; ask?: ShipAskLevel; brainstormFile?: string; startFrom?: ShipStageName; featureDir?: string }
  | { action: "pause" | "fail"; blocker?: string; lastError?: string };

export type ShipStateToolDetails = {
  state?: Awaited<ReturnType<typeof loadShipState>>;
  previous?: Awaited<ReturnType<typeof loadShipState>>;
  removed?: boolean;
  message: string;
};

export type ShipResumeDecision =
  | { kind: "resume"; notice: string; prompt: string }
  | { kind: "reject"; message: string }
  | { kind: "cleanup"; message: string };

function parseShipArgs(args: string): ShipCommandArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let brainstormFile: string | undefined;
  let ask: ShipAskLevel | undefined;
  let resume = false;
  let startFrom: ShipStageName | undefined;
  let mode: "run" | "status" | "cleanup" = "run";

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (index === 0 && (token === "status" || token === "cleanup")) {
      mode = token;
      continue;
    }

    if (token === "--resume") {
      resume = true;
      continue;
    }
    if (token === "--ask") {
      const value = tokens[index + 1];
      if (value !== "always" && value !== "smart" && value !== "never") {
        throw new Error(`Invalid oversight level: ${value ?? "(missing)"}. Use always, smart, or never.`);
      }
      ask = value;
      index += 1;
      continue;
    }
    if (token === "--start-from") {
      const value = tokens[index + 1];
      if (!value || !isShipStageName(value)) {
        throw new Error(`Invalid stage for --start-from: ${value ?? "(missing)"}. Valid stages: ${SHIP_STAGE_NAMES.join(", ")}.`);
      }
      startFrom = value;
      index += 1;
      continue;
    }
    if (token.startsWith("-")) {
      throw new Error(`Unknown flag for spex-ship: ${token}`);
    }
    if (brainstormFile) {
      throw new Error(`Unexpected extra positional argument: ${token}`);
    }
    brainstormFile = token;
  }

  if (mode !== "run" && (resume || startFrom || brainstormFile || ask)) {
    throw new Error(`spex-ship ${mode} does not accept pipeline start flags or files.`);
  }

  return { brainstormFile, ask, resume, startFrom, mode };
}

function getNextStageInstruction(stage: ShipStageName): string {
  switch (stage) {
    case "specify":
      return "Run `/speckit.specify` (or `/speckit-specify` if your project uses hyphenated Spec Kit commands). Before advancing, ensure `spec.md` in the active feature directory contains `# Feature Specification:`, `## User Scenarios & Testing`, `## Requirements`, and `## Success Criteria`, then call `spex_ship_state` with `action: \"advance\"`.";
    case "clarify":
      return "Run `/speckit.clarify`, then write or update `clarify.md` in the active feature directory with `# Clarification Summary`, `## Questions Resolved`, and `## Spec Updates`. Only then call `spex_ship_state` with `action: \"advance\"`, and only if `spec.md` no longer contains `[NEEDS CLARIFICATION` markers.";
    case "review-spec":
      return "Run `/spex-review-spec`, then write or update `review-spec.md` in the active feature directory using the canonical schema: `# Spec Review`, `## Verdict`, `## Findings`, `## Remediation Checklist`, `## Residual Risks`, plus `Verdict: approved|revise|required-clarification`, `Finding Count: <number>`, and `Residual Risks: ...`. Then advance the ship state or pause/fail if blockers are found.";
    case "plan":
      return "Run `/speckit.plan`. Before advancing, ensure `plan.md` contains `# Implementation Plan:`, `## Summary`, `## Technical Context`, and `## Constitution Check`, then advance the ship state.";
    case "tasks":
      return "Run `/speckit.tasks`. Before advancing, ensure `tasks.md` contains `# Tasks:`, `## Phase 1: Setup`, `## Dependencies & Execution Order`, and `## Implementation Strategy`, then advance the ship state.";
    case "review-plan":
      return "Run `/spex-review-plan`, then write or update `review-plan.md` in the active feature directory using the canonical schema: `# Plan Review`, `## Coverage Summary`, `## Findings`, `## Gap-Closure Checklist`, `## Residual Risks`, plus `Coverage Status: full|partial|insufficient`, `Finding Count: <number>`, and `Residual Risks: ...`. Then advance the ship state or pause if review findings need user attention.";
    case "implement":
      return "Run `/speckit.implement`, then write or update both `implementation.md` and `verification.md` in the active feature directory. `implementation.md` must contain `# Implementation Summary`, `## Completed Work`, `## Changed Files`, and `## Verification Run`. `verification.md` must contain `# Verification Summary`, `## Commands Run`, `## Results`, and `## Outstanding Risks`. Only then advance the ship state.";
    case "review-code":
      return "Run `/spex-review-code`, then write or update `review-code.md` in the active feature directory using the canonical schema: `# Code Review`, `## Spec Compliance`, `## Findings`, `## Test Coverage Notes`, `## Residual Risks`, plus `Compliance Score: <number>%`, `Finding Count: <number>`, and `Residual Risks: ...`. Then advance the ship state or pause/fail if critical findings remain.";
    case "stamp":
      return "Run `/spex-stamp`, write or update `stamp.md` in the active feature directory with `# Final Stamp` and a `Final Recommendation:` line, then call `spex_ship_state` with `action: \"advance\"` to finish and clean up the pipeline state.";
  }
}

export function buildShipStartPrompt(options: {
  stage: ShipStageName;
  brainstormFile?: string;
  ask: ShipAskLevel;
}): string {
  return [
    `Start the spex ship pipeline at stage \`${options.stage}\`.`,
    options.brainstormFile
      ? `Brainstorm input: ${options.brainstormFile}`
      : "No brainstorm file was provided; use the active repository artifacts if appropriate.",
    `Oversight level: ${options.ask}`,
    `Use the tool \`${SHIP_STATE_TOOL_NAME}\` to manage pipeline state.`,
    getNextStageInstruction(options.stage),
  ].join("\n");
}

export function buildShipContext(cwd: string, state: NonNullable<Awaited<ReturnType<typeof loadShipState>>>, config: SpexConfig): string {
  const nextInstruction = state.stage === "done" ? "The pipeline is complete." : getNextStageInstruction(state.stage as ShipStageName);
  return [
    `<pi-spex-ship stage="${state.stage}" status="${state.status}" ask="${state.ask}">`,
    `Enabled traits: ${formatEnabledTraits(config)}`,
    `Ship pipeline is active at stage ${state.stageIndex + 1}/${state.totalStages}: ${state.stage}.`,
    `State file: ${getShipStatePath(cwd)}`,
    "You must treat this as a stateful pipeline. Do not skip ahead or silently mark stages complete.",
    "`spex_ship_state advance` performs artifact validation and will reject invalid stage transitions.",
    state.status === "running"
      ? "Current status is running. Finish the current stage before advancing."
      : `Current status is ${state.status}. Do not advance until the blocker or failure is addressed.`,
    state.blocker ? `Recorded blocker: ${state.blocker}` : "Recorded blocker: none",
    state.lastError ? `Last error: ${state.lastError}` : "Last error: none",
    `Next instruction: ${nextInstruction}`,
    "When a stage completes, call `spex_ship_state` with `action: \"advance\"`. If blocked, use `pause` or `fail` with blocker details.",
    "</pi-spex-ship>",
  ].join("\n");
}

export function getShipResumeDecision(state: ShipState): ShipResumeDecision {
  if (state.stage === "done" || state.status === "completed") {
    return {
      kind: "cleanup",
      message: "The spex ship pipeline is already marked complete. The stale state file will be removed; start a fresh `/spex-ship` run if you need a new pipeline.",
    };
  }

  if (state.status === "failed") {
    const reasons = [
      state.blocker ? `Blocker: ${state.blocker}` : undefined,
      state.lastError ? `Last error: ${state.lastError}` : undefined,
    ].filter(Boolean);
    return {
      kind: "reject",
      message: [
        `Cannot resume a failed spex ship pipeline at stage \`${state.stage}\`.`,
        ...reasons,
        "Inspect the current state with `/spex-ship status`, fix the underlying issue, then run `/spex-ship cleanup` and start again or use `/spex-ship --start-from <stage>` once artifacts are in a valid state.",
      ].join("\n"),
    };
  }

  if (state.status === "paused") {
    const blocker = state.blocker ? ` Blocker to resolve first: ${state.blocker}` : "";
    return {
      kind: "resume",
      notice: `Queued resume for paused spex ship stage ${state.stage}.${blocker}`,
      prompt: [
        `Resume the paused spex ship pipeline at stage \`${state.stage}\`.`,
        state.blocker ? `Resolve this blocker before advancing: ${state.blocker}` : "The pipeline was paused; inspect the current stage output before advancing.",
        state.lastError ? `Last recorded error: ${state.lastError}` : "No explicit last error was recorded.",
        `Do not skip the current stage. Use \`${SHIP_STATE_TOOL_NAME}\` with \`action: \"advance\"\` only after the blocker is actually resolved.`,
      ].join("\n"),
    };
  }

  return {
    kind: "resume",
    notice: `Queued resume for active spex ship stage ${state.stage}.`,
    prompt: [
      `Resume the active spex ship pipeline from stage \`${state.stage}\`.`,
      "Follow the injected ship pipeline rules and continue the current stage instead of restarting or skipping ahead.",
      `Call \`${SHIP_STATE_TOOL_NAME}\` to advance, pause, fail, or inspect the pipeline as you progress.`,
    ].join("\n"),
  };
}

function getMissingTraits(config: SpexConfig): string[] {
  return ["superpowers", "deep-review"].filter((trait) => !config.traits[trait as keyof SpexConfig["traits"]]);
}

export async function handleShipCommand(
  pi: ExtensionAPI,
  args: string,
  ctx: ExtensionCommandContext,
  config: SpexConfig,
): Promise<void> {
  const missingTraits = getMissingTraits(config);
  if (missingTraits.length > 0) {
    throw new Error(
      `spex-ship requires these traits to be enabled first: ${missingTraits.join(", ")}. Use /spex-traits enable ${missingTraits.join(",")}`,
    );
  }

  const parsed = parseShipArgs(args);

  if (parsed.mode === "status") {
    const state = await loadShipState(ctx.cwd);
    await ctx.ui.editor("spex ship status", state ? JSON.stringify(state, null, 2) : "No active spex ship state file.");
    return;
  }

  if (parsed.mode === "cleanup") {
    const result = await cleanupShipState(ctx.cwd);
    ctx.ui.notify(result.message, "info");
    return;
  }

  if (parsed.resume && parsed.startFrom) {
    throw new Error("Cannot use --resume and --start-from together.");
  }

  if (parsed.resume && parsed.brainstormFile) {
    throw new Error("Cannot pass a brainstorm file together with --resume.");
  }

  if (parsed.resume) {
    const state = await loadShipState(ctx.cwd);
    if (!state) {
      throw new Error("No active spex ship state file found to resume.");
    }
    const validated = await validateResumeState(ctx.cwd, state);
    if (validated.featureDir !== state.featureDir) {
      await saveShipState(ctx.cwd, validated);
    }
    const decision = getShipResumeDecision(validated);
    if (decision.kind === "cleanup") {
      await cleanupShipState(ctx.cwd);
      ctx.ui.notify(decision.message, "info");
      return;
    }
    if (decision.kind === "reject") {
      throw new Error(decision.message);
    }
    if (validated.status === "paused") {
      const resumed = await resumeShipState(ctx.cwd);
      ctx.ui.notify(resumed.message, "info");
    }
    pi.sendUserMessage(decision.prompt);
    ctx.ui.notify(decision.notice, "info");
    return;
  }

  const created = await createShipState(ctx.cwd, {
    ask: parsed.ask,
    brainstormFile: parsed.brainstormFile,
    startFrom: parsed.startFrom,
  });
  const stage = created.state?.stage;
  if (!stage || stage === "done") {
    throw new Error("Failed to create a valid spex ship state.");
  }

  const starterPrompt = buildShipStartPrompt({
    stage,
    brainstormFile: parsed.brainstormFile,
    ask: created.state?.ask ?? "smart",
  });

  pi.sendUserMessage(starterPrompt);
  ctx.ui.notify(created.message, "info");
}

export function registerShipTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: SHIP_STATE_TOOL_NAME,
    label: SHIP_STATE_TOOL_NAME,
    description: "Manage the persisted spex ship pipeline state file for create/status/advance/pause/fail/cleanup operations.",
    promptSnippet: "Manage the stateful spex ship pipeline. Use this instead of editing the ship state file manually.",
    promptGuidelines: [
      "Use this tool for all ship pipeline state changes instead of editing the state file manually.",
      "Use create at the start, advance after a stage completes, pause/fail on blockers, and cleanup when abandoning the pipeline.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("create"),
        Type.Literal("status"),
        Type.Literal("advance"),
        Type.Literal("pause"),
        Type.Literal("fail"),
        Type.Literal("cleanup"),
      ]),
      ask: Type.Optional(Type.Union([
        Type.Literal("always"),
        Type.Literal("smart"),
        Type.Literal("never"),
      ])),
      brainstormFile: Type.Optional(Type.String()),
      startFrom: Type.Optional(Type.String()),
      featureDir: Type.Optional(Type.String()),
      blocker: Type.Optional(Type.String()),
      lastError: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId: string, rawParams: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionContext) {
      const params = rawParams as ShipStateToolParams & Record<string, unknown>;
      switch (params.action) {
        case "status": {
          const state = await loadShipState(ctx.cwd);
          return {
            content: [{ type: "text", text: state ? JSON.stringify(state, null, 2) : "No active spex ship state file." }],
            details: { state, message: state ? "Loaded current ship state." : "No active spex ship state file.", removed: false } satisfies ShipStateToolDetails,
          };
        }
        case "create": {
          const result = await createShipState(ctx.cwd, {
            ask: params.ask,
            brainstormFile: typeof params.brainstormFile === "string" ? params.brainstormFile : undefined,
            startFrom: typeof params.startFrom === "string" && isShipStageName(params.startFrom) ? params.startFrom : undefined,
            featureDir: typeof params.featureDir === "string" ? params.featureDir : undefined,
          });
          return {
            content: [{ type: "text", text: result.message }],
            details: result satisfies ShipStateToolDetails,
          };
        }
        case "advance": {
          const result = await advanceShipState(ctx.cwd);
          return {
            content: [{ type: "text", text: result.message }],
            details: result satisfies ShipStateToolDetails,
          };
        }
        case "pause": {
          const result = await pauseShipState(ctx.cwd, {
            blocker: typeof params.blocker === "string" ? params.blocker : undefined,
            lastError: typeof params.lastError === "string" ? params.lastError : undefined,
          });
          return {
            content: [{ type: "text", text: result.message }],
            details: result satisfies ShipStateToolDetails,
          };
        }
        case "fail": {
          const result = await failShipState(ctx.cwd, {
            blocker: typeof params.blocker === "string" ? params.blocker : undefined,
            lastError: typeof params.lastError === "string" ? params.lastError : undefined,
          });
          return {
            content: [{ type: "text", text: result.message }],
            details: result satisfies ShipStateToolDetails,
          };
        }
        case "cleanup": {
          const result = await cleanupShipState(ctx.cwd);
          return {
            content: [{ type: "text", text: result.message }],
            details: result satisfies ShipStateToolDetails,
          };
        }
      }
    },
  });
}
