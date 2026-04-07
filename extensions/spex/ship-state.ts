import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

export const SHIP_STAGE_NAMES = [
  "specify",
  "clarify",
  "review-spec",
  "plan",
  "tasks",
  "review-plan",
  "implement",
  "review-code",
  "stamp",
] as const;

export type ShipStageName = (typeof SHIP_STAGE_NAMES)[number];
export type ShipStatus = "running" | "paused" | "failed" | "completed";
export type ShipAskLevel = "always" | "smart" | "never";
export type ShipStateAction = "create" | "status" | "advance" | "pause" | "fail" | "cleanup";

export type ShipState = {
  version: 1;
  stage: ShipStageName | "done";
  stageIndex: number;
  totalStages: number;
  status: ShipStatus;
  ask: ShipAskLevel;
  brainstormFile?: string;
  featureDir?: string;
  startedAt: string;
  updatedAt: string;
  lastError?: string;
  blocker?: string;
};

export const SHIP_STATE_RELATIVE_PATH = ".specify/.spex-ship-phase.json";

export type ShipCreateOptions = {
  ask?: ShipAskLevel;
  brainstormFile?: string;
  featureDir?: string;
  startFrom?: ShipStageName;
};

export type ShipUpdateOptions = {
  blocker?: string;
  lastError?: string;
};

export type ShipTransitionResult = {
  state?: ShipState;
  previous?: ShipState;
  removed?: boolean;
  message: string;
};

type StageOutputRequirement = {
  file: string;
  requiredSubstrings?: string[];
  requiredPatterns?: Array<{
    pattern: RegExp;
    description: string;
  }>;
};

const START_STAGE_REQUIREMENTS: Record<ShipStageName, string[]> = {
  specify: [],
  clarify: ["spec.md"],
  "review-spec": ["spec.md", "clarify.md"],
  plan: ["spec.md"],
  tasks: ["spec.md", "plan.md"],
  "review-plan": ["spec.md", "plan.md", "tasks.md"],
  implement: ["spec.md", "plan.md", "tasks.md"],
  "review-code": ["spec.md", "plan.md", "tasks.md", "implementation.md", "verification.md"],
  stamp: ["spec.md", "plan.md", "tasks.md", "implementation.md", "verification.md", "review-code.md"],
};

const ADVANCE_REQUIREMENTS: Record<ShipStageName, string[]> = {
  specify: ["spec.md"],
  clarify: ["spec.md", "clarify.md"],
  "review-spec": ["spec.md", "review-spec.md"],
  plan: ["plan.md"],
  tasks: ["tasks.md"],
  "review-plan": ["spec.md", "plan.md", "tasks.md", "review-plan.md"],
  implement: ["spec.md", "plan.md", "tasks.md", "implementation.md", "verification.md"],
  "review-code": ["spec.md", "plan.md", "tasks.md", "implementation.md", "verification.md", "review-code.md"],
  stamp: ["spec.md", "plan.md", "tasks.md", "implementation.md", "verification.md", "stamp.md"],
};

const STAGE_OUTPUT_REQUIREMENTS: Partial<Record<ShipStageName, StageOutputRequirement[]>> = {
  specify: [
    {
      file: "spec.md",
      requiredSubstrings: [
        "# Feature Specification:",
        "## User Scenarios & Testing",
        "## Requirements",
        "## Success Criteria",
      ],
    },
  ],
  clarify: [
    {
      file: "clarify.md",
      requiredSubstrings: [
        "# Clarification Summary",
        "## Questions Resolved",
        "## Spec Updates",
      ],
    },
  ],
  plan: [
    {
      file: "plan.md",
      requiredSubstrings: [
        "# Implementation Plan:",
        "## Summary",
        "## Technical Context",
        "## Constitution Check",
      ],
    },
  ],
  tasks: [
    {
      file: "tasks.md",
      requiredSubstrings: [
        "# Tasks:",
        "## Phase 1: Setup",
        "## Dependencies & Execution Order",
        "## Implementation Strategy",
      ],
    },
  ],
  implement: [
    {
      file: "implementation.md",
      requiredSubstrings: [
        "# Implementation Summary",
        "## Completed Work",
        "## Changed Files",
        "## Verification Run",
      ],
    },
    {
      file: "verification.md",
      requiredSubstrings: [
        "# Verification Summary",
        "## Commands Run",
        "## Results",
        "## Outstanding Risks",
      ],
    },
  ],
  "review-spec": [
    {
      file: "review-spec.md",
      requiredSubstrings: [
        "# Spec Review",
        "## Verdict",
        "## Findings",
        "## Remediation Checklist",
        "## Residual Risks",
      ],
      requiredPatterns: [
        {
          pattern: /^Verdict:\s*(approved|revise|required-clarification)$/m,
          description: 'a `Verdict: approved|revise|required-clarification` line',
        },
        {
          pattern: /^Finding Count:\s*\d+$/m,
          description: 'a `Finding Count: <number>` line',
        },
        {
          pattern: /^Residual Risks:\s*(none|.+)$/m,
          description: 'a `Residual Risks: ...` line',
        },
      ],
    },
  ],
  "review-plan": [
    {
      file: "review-plan.md",
      requiredSubstrings: [
        "# Plan Review",
        "## Coverage Summary",
        "## Findings",
        "## Gap-Closure Checklist",
        "## Residual Risks",
      ],
      requiredPatterns: [
        {
          pattern: /^Coverage Status:\s*(full|partial|insufficient)$/m,
          description: 'a `Coverage Status: full|partial|insufficient` line',
        },
        {
          pattern: /^Finding Count:\s*\d+$/m,
          description: 'a `Finding Count: <number>` line',
        },
        {
          pattern: /^Residual Risks:\s*(none|.+)$/m,
          description: 'a `Residual Risks: ...` line',
        },
      ],
    },
  ],
  "review-code": [
    {
      file: "review-code.md",
      requiredSubstrings: [
        "# Code Review",
        "## Spec Compliance",
        "## Findings",
        "## Test Coverage Notes",
        "## Residual Risks",
      ],
      requiredPatterns: [
        {
          pattern: /^Compliance Score:\s*\d+%$/m,
          description: 'a `Compliance Score: <number>%` line',
        },
        {
          pattern: /^Finding Count:\s*\d+$/m,
          description: 'a `Finding Count: <number>` line',
        },
        {
          pattern: /^Residual Risks:\s*(none|.+)$/m,
          description: 'a `Residual Risks: ...` line',
        },
      ],
    },
  ],
  stamp: [
    {
      file: "stamp.md",
      requiredSubstrings: ["# Final Stamp", "Final Recommendation:"],
    },
  ],
};

function nowIso(): string {
  return new Date().toISOString();
}

export function getShipStatePath(cwd: string): string {
  return resolve(cwd, SHIP_STATE_RELATIVE_PATH);
}

export function isShipStageName(value: string): value is ShipStageName {
  return SHIP_STAGE_NAMES.includes(value as ShipStageName);
}

export function getShipStageIndex(stage: ShipStageName): number {
  const index = SHIP_STAGE_NAMES.indexOf(stage);
  if (index === -1) {
    throw new Error(`Invalid ship stage: ${stage}`);
  }
  return index;
}

function normalizeAskLevel(value: unknown): ShipAskLevel {
  return value === "always" || value === "never" ? value : "smart";
}

function normalizeShipState(input: unknown): ShipState {
  const startedAt = nowIso();
  if (!input || typeof input !== "object") {
    return {
      version: 1,
      stage: SHIP_STAGE_NAMES[0],
      stageIndex: 0,
      totalStages: SHIP_STAGE_NAMES.length,
      status: "running",
      ask: "smart",
      startedAt,
      updatedAt: startedAt,
    };
  }

  const source = input as Partial<ShipState>;
  const stage = typeof source.stage === "string" && (source.stage === "done" || isShipStageName(source.stage))
    ? source.stage
    : SHIP_STAGE_NAMES[0];
  const stageIndex = stage === "done"
    ? SHIP_STAGE_NAMES.length
    : isShipStageName(stage)
      ? getShipStageIndex(stage)
      : 0;

  return {
    version: 1,
    stage,
    stageIndex: typeof source.stageIndex === "number" ? source.stageIndex : stageIndex,
    totalStages: SHIP_STAGE_NAMES.length,
    status: source.status === "paused" || source.status === "failed" || source.status === "completed"
      ? source.status
      : "running",
    ask: normalizeAskLevel(source.ask),
    brainstormFile: typeof source.brainstormFile === "string" && source.brainstormFile ? source.brainstormFile : undefined,
    featureDir: typeof source.featureDir === "string" && source.featureDir ? source.featureDir : undefined,
    startedAt: typeof source.startedAt === "string" && source.startedAt ? source.startedAt : startedAt,
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : startedAt,
    lastError: typeof source.lastError === "string" && source.lastError ? source.lastError : undefined,
    blocker: typeof source.blocker === "string" && source.blocker ? source.blocker : undefined,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(path: string): Promise<string | undefined> {
  if (!(await pathExists(path))) return undefined;
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

export async function resolveFeatureDir(cwd: string, options: { featureDir?: string; brainstormFile?: string } = {}): Promise<string | undefined> {
  const specsRoot = resolve(cwd, "specs");

  if (options.featureDir) {
    const explicit = resolve(cwd, options.featureDir);
    if (await pathExists(explicit)) return explicit;
  }

  const candidates: string[] = [];
  if (options.brainstormFile) {
    const stem = basename(options.brainstormFile, extname(options.brainstormFile));
    candidates.push(resolve(specsRoot, stem));
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  if (!(await pathExists(specsRoot))) return undefined;

  const entries = await readdir(specsRoot, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => resolve(specsRoot, entry.name));
  if (dirs.length === 0) return undefined;
  if (dirs.length === 1) return dirs[0];

  const withStats = await Promise.all(
    dirs.map(async (dir) => ({ dir, mtimeMs: (await stat(dir)).mtimeMs })),
  );
  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStats[0]?.dir;
}

function formatArtifactList(files: string[]): string {
  return files.map((file) => `\`${file}\``).join(", ");
}

async function ensureRequiredArtifacts(featureDir: string | undefined, files: string[], context: string): Promise<string | undefined> {
  if (files.length === 0) return featureDir;
  if (!featureDir) {
    throw new Error(`${context} requires an active feature directory under \`specs/\`, but none could be resolved.`);
  }

  const missing: string[] = [];
  for (const file of files) {
    const artifactPath = join(featureDir, file);
    if (!(await pathExists(artifactPath))) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    throw new Error(`${context} requires ${formatArtifactList(missing)} in \`${featureDir}\` before continuing.`);
  }

  return featureDir;
}

async function ensureStageOutputArtifacts(featureDir: string | undefined, stage: ShipStageName): Promise<void> {
  const requirements = STAGE_OUTPUT_REQUIREMENTS[stage] ?? [];
  if (requirements.length === 0) return;
  if (!featureDir) {
    throw new Error(`Stage \`${stage}\` requires a resolved feature directory to validate review artifacts.`);
  }

  for (const requirement of requirements) {
    const artifactPath = join(featureDir, requirement.file);
    const content = await readTextIfExists(artifactPath);
    if (!content) {
      throw new Error(`Advancing ship from stage \`${stage}\` requires canonical review artifact \`${requirement.file}\` in \`${featureDir}\`.`);
    }
    for (const snippet of requirement.requiredSubstrings ?? []) {
      if (!content.includes(snippet)) {
        throw new Error(`Artifact \`${requirement.file}\` in \`${featureDir}\` is missing required content: ${JSON.stringify(snippet)}.`);
      }
    }
    for (const pattern of requirement.requiredPatterns ?? []) {
      if (!pattern.pattern.test(content)) {
        throw new Error(`Artifact \`${requirement.file}\` in \`${featureDir}\` is missing required structure: ${pattern.description}.`);
      }
    }
  }
}

async function validateStartStage(cwd: string, stage: ShipStageName, options: ShipCreateOptions): Promise<string | undefined> {
  const featureDir = await resolveFeatureDir(cwd, options);
  await ensureRequiredArtifacts(featureDir, START_STAGE_REQUIREMENTS[stage], `Starting ship at stage \`${stage}\``);
  return featureDir;
}

export async function validateResumeState(cwd: string, state: ShipState): Promise<ShipState> {
  if (state.stage === "done" || state.status === "completed") {
    return state;
  }

  const featureDir = await resolveFeatureDir(cwd, {
    featureDir: state.featureDir,
    brainstormFile: state.brainstormFile,
  });
  const resolvedFeatureDir = await ensureRequiredArtifacts(
    featureDir,
    START_STAGE_REQUIREMENTS[state.stage],
    `Resuming ship at stage \`${state.stage}\``,
  );

  return {
    ...state,
    featureDir: resolvedFeatureDir,
  };
}

async function validateAdvanceStage(cwd: string, state: ShipState): Promise<string | undefined> {
  const featureDir = await resolveFeatureDir(cwd, {
    featureDir: state.featureDir,
    brainstormFile: state.brainstormFile,
  });
  const resolvedFeatureDir = await ensureRequiredArtifacts(featureDir, ADVANCE_REQUIREMENTS[state.stage as ShipStageName], `Advancing ship from stage \`${state.stage}\``);

  if (state.stage === "clarify") {
    const specPath = join(resolvedFeatureDir!, "spec.md");
    const specContent = await readTextIfExists(specPath);
    if (specContent?.includes("[NEEDS CLARIFICATION")) {
      throw new Error("Cannot advance ship from `clarify` while `spec.md` still contains `[NEEDS CLARIFICATION` markers.");
    }
  }

  await ensureStageOutputArtifacts(resolvedFeatureDir, state.stage as ShipStageName);

  return resolvedFeatureDir;
}

export async function loadShipState(cwd: string): Promise<ShipState | undefined> {
  const path = getShipStatePath(cwd);
  if (!existsSync(path)) return undefined;
  try {
    return normalizeShipState(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return undefined;
  }
}

export async function saveShipState(cwd: string, state: ShipState): Promise<string> {
  const path = getShipStatePath(cwd);
  const next: ShipState = {
    ...normalizeShipState(state),
    updatedAt: nowIso(),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return path;
}

export async function createShipState(cwd: string, options: ShipCreateOptions): Promise<ShipTransitionResult> {
  const existing = await loadShipState(cwd);
  if (existing) {
    throw new Error(`A spex ship pipeline is already active at stage \`${existing.stage}\`. Use \`/spex-ship --resume\` or \`/spex-ship cleanup\` first.`);
  }

  const stage = options.startFrom ?? SHIP_STAGE_NAMES[0];
  const now = nowIso();
  const resolvedFeatureDir = await validateStartStage(cwd, stage, options);
  const state: ShipState = {
    version: 1,
    stage,
    stageIndex: getShipStageIndex(stage),
    totalStages: SHIP_STAGE_NAMES.length,
    status: "running",
    ask: normalizeAskLevel(options.ask),
    brainstormFile: options.brainstormFile,
    featureDir: resolvedFeatureDir,
    startedAt: now,
    updatedAt: now,
  };
  await saveShipState(cwd, state);
  return {
    state,
    message: `Created ship state at stage ${state.stage} (${state.stageIndex + 1}/${state.totalStages}).`,
  };
}

export async function advanceShipState(cwd: string): Promise<ShipTransitionResult> {
  const previous = await loadShipState(cwd);
  if (!previous) {
    throw new Error("No active spex ship state file found.");
  }
  if (previous.stage === "done") {
    throw new Error("The spex ship pipeline is already complete.");
  }
  if (previous.status !== "running") {
    throw new Error(`Cannot advance ship while status is \`${previous.status}\`. Resume the pipeline only after addressing the blocker or cleanup the state.`);
  }

  const resolvedFeatureDir = await validateAdvanceStage(cwd, previous);
  const nextIndex = previous.stageIndex + 1;
  if (nextIndex >= SHIP_STAGE_NAMES.length) {
    await rm(getShipStatePath(cwd), { force: true });
    return {
      previous,
      removed: true,
      message: "Pipeline complete. Ship state file removed.",
    };
  }

  const state: ShipState = {
    ...previous,
    featureDir: resolvedFeatureDir,
    stage: SHIP_STAGE_NAMES[nextIndex],
    stageIndex: nextIndex,
    status: "running",
    blocker: undefined,
    lastError: undefined,
  };
  await saveShipState(cwd, state);
  return {
    previous,
    state,
    message: `Advanced ship pipeline to ${state.stage} (${state.stageIndex + 1}/${state.totalStages}).`,
  };
}

export async function pauseShipState(cwd: string, options: ShipUpdateOptions = {}): Promise<ShipTransitionResult> {
  const previous = await loadShipState(cwd);
  if (!previous) {
    throw new Error("No active spex ship state file found.");
  }
  const state: ShipState = {
    ...previous,
    status: "paused",
    blocker: options.blocker ?? previous.blocker,
    lastError: options.lastError ?? previous.lastError,
  };
  await saveShipState(cwd, state);
  return {
    previous,
    state,
    message: `Paused ship pipeline at ${state.stage}.`,
  };
}

export async function resumeShipState(cwd: string): Promise<ShipTransitionResult> {
  const previous = await loadShipState(cwd);
  if (!previous) {
    throw new Error("No active spex ship state file found.");
  }
  if (previous.status !== "paused") {
    throw new Error(`Cannot resume ship state unless status is \`paused\`. Current status: \`${previous.status}\`.`);
  }
  const state: ShipState = {
    ...previous,
    status: "running",
  };
  await saveShipState(cwd, state);
  return {
    previous,
    state,
    message: `Resumed ship pipeline at ${state.stage}.`,
  };
}

export async function failShipState(cwd: string, options: ShipUpdateOptions = {}): Promise<ShipTransitionResult> {
  const previous = await loadShipState(cwd);
  if (!previous) {
    throw new Error("No active spex ship state file found.");
  }
  const state: ShipState = {
    ...previous,
    status: "failed",
    blocker: options.blocker ?? previous.blocker,
    lastError: options.lastError ?? previous.lastError,
  };
  await saveShipState(cwd, state);
  return {
    previous,
    state,
    message: `Marked ship pipeline as failed at ${state.stage}.`,
  };
}

export async function cleanupShipState(cwd: string): Promise<ShipTransitionResult> {
  const previous = await loadShipState(cwd);
  await rm(getShipStatePath(cwd), { force: true });
  return {
    previous,
    removed: true,
    message: previous ? "Removed ship state file." : "No ship state file existed.",
  };
}
