import { execFile as execFileCb } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, fauxText, fauxToolCall, registerFauxProvider } from "@mariozechner/pi-ai";
import { AuthStorage, createAgentSession, DefaultResourceLoader, ModelRegistry, SessionManager } from "@mariozechner/pi-coding-agent";
import { getInitDispatchPrompt } from "../extensions/spex/prompts.js";
import { buildShipStartPrompt, getShipResumeDecision } from "../extensions/spex/ship.js";
import { createShipState, failShipState, pauseShipState } from "../extensions/spex/ship-state.js";

const execFile = promisify(execFileCb);
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_KIT_DIR = resolve(ROOT_DIR, "..", "spec-kit");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertRejects(fn: () => Promise<void>, pattern: RegExp, label: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) {
      throw new Error(`${label}: expected ${pattern}, got ${message}`);
    }
    return;
  }
  throw new Error(`${label}: expected failure but call succeeded`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(path: string, timeoutMs = 10000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return true;
    await sleep(100);
  }
  return existsSync(path);
}

type SessionResult = Awaited<ReturnType<typeof createAgentSession>>;

async function waitForAgent(session: SessionResult["session"]): Promise<void> {
  await session.agent.waitForIdle();
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function getCommand(result: SessionResult, name: string) {
  for (const extension of result.extensionsResult.extensions) {
    const command = extension.commands.get(name);
    if (command) return command;
  }
  return undefined;
}

async function runCommand(result: SessionResult, name: string, args: string, cwd: string): Promise<void> {
  const command = getCommand(result, name);
  assert(command, `expected command ${name} to be registered`);
  const ctx = {
    cwd,
    hasUI: false,
    ui: {
      notify: () => {},
      editor: async () => undefined,
      setStatus: () => {},
    },
  };
  await command.handler(args, ctx as never);
  await waitForAgent(result.session);
}

function buildInitResponses() {
  return [
    fauxAssistantMessage(
      [
        fauxToolCall("AskUserQuestion", {
          questions: [
            {
              question: "Which spex traits do you want to enable?",
              header: "Traits",
              multiSelect: true,
              options: [
                { label: "superpowers", description: "Enable quality gates." },
                { label: "deep-review", description: "Enable deep review guidance." },
                { label: "worktrees", description: "Enable worktree guidance." },
              ],
            },
            {
              question: "How should spex commands handle permission prompts?",
              header: "Permissions",
              options: [
                { label: "Standard (Recommended)", description: "Use the standard profile." },
                { label: "YOLO", description: "Use the yolo profile." },
                { label: "None", description: "Use no automation." },
              ],
            },
          ],
          answers: {
            "Which spex traits do you want to enable?": "superpowers, deep-review",
            "How should spex commands handle permission prompts?": "Standard (Recommended)",
          },
        }),
        fauxToolCall("spex_init_project", {
          traits: ["superpowers", "deep-review"],
          permissions: "standard",
        }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText("pi-spex init completed successfully.")]),
  ];
}

function buildShipResponses() {
  return [
    fauxAssistantMessage(
      [
        fauxToolCall("spex_ship_state", {
          action: "advance",
        }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText("Advanced the spex ship pipeline by one stage.")]),
  ];
}

function buildShipResumeResponses() {
  return [
    fauxAssistantMessage(
      [
        fauxToolCall("spex_ship_state", {
          action: "advance",
        }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText("Resumed the paused spex ship pipeline and advanced it.")]),
  ];
}

async function main(): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), "pi-spex-e2e-"));
  const repo = join(tmp, "repo");
  const agentDir = join(tmp, "agent");
  const binDir = join(tmp, "bin");
  await mkdir(repo, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await mkdir(binDir, { recursive: true });

  const specifyWrapper = join(binDir, "specify");
  await writeFile(
    specifyWrapper,
    `#!/usr/bin/env bash\nset -euo pipefail\nexec uv run --project ${JSON.stringify(SPEC_KIT_DIR)} specify "$@"\n`,
    "utf8",
  );
  await chmod(specifyWrapper, 0o755);
  process.env.PATH = `${binDir}:${process.env.PATH ?? ""}`;

  const faux = registerFauxProvider();
  try {
    await execFile("specify", ["version"]);
    await execFile("git", ["init"], { cwd: repo });
    await writeFile(join(repo, "README.md"), "# pi spex e2e smoke\n", "utf8");
    await execFile("pi", ["install", "-l", ROOT_DIR], { cwd: repo });

    faux.setResponses(buildInitResponses());
    const model = faux.getModel();
    assert(model, "failed to create faux provider model");
    const authStorage = AuthStorage.create(join(tmp, "auth.json"));
    authStorage.setRuntimeApiKey(model.provider, "faux-test-key");
    const modelRegistry = ModelRegistry.inMemory(authStorage);

    const resourceLoader = new DefaultResourceLoader({
      cwd: repo,
      agentDir,
    });
    await resourceLoader.reload();
    const extensions = resourceLoader.getExtensions();
    assert(extensions.errors.length === 0, `resource loader reported extension errors: ${JSON.stringify(extensions.errors)}`);

    const sessionResult = await createAgentSession({
      cwd: repo,
      agentDir,
      model,
      thinkingLevel: "off",
      authStorage,
      modelRegistry,
      resourceLoader,
      sessionManager: SessionManager.inMemory(),
    });
    assert(sessionResult.extensionsResult.errors.length === 0, `session extension load errors: ${JSON.stringify(sessionResult.extensionsResult.errors)}`);
    const toolNames = sessionResult.session.agent.state.tools.map((tool) => tool.name);
    assert(toolNames.includes("AskUserQuestion"), `expected AskUserQuestion tool, got: ${toolNames.join(", ")}`);
    assert(toolNames.includes("spex_init_project"), `expected spex_init_project tool, got: ${toolNames.join(", ")}`);
    assert(getCommand(sessionResult, "spex-init"), "expected spex-init command to be registered");
    assert(getCommand(sessionResult, "spex-ship"), "expected spex-ship command to be registered");

    const initArgs = "--traits superpowers,deep-review --permissions standard";
    await runCommand(sessionResult, "spex-init", initArgs, repo);

    const configPath = join(repo, ".specify", "spex-traits.json");
    if (!(await waitForFile(configPath, 15000))) {
      await sessionResult.session.prompt(
        getInitDispatchPrompt({
          refresh: false,
          update: false,
          preselectedTraits: ["superpowers", "deep-review"],
          preselectedPermissions: "Standard (Recommended)",
        }),
      );
      await waitForAgent(sessionResult.session);
    }

    assert(existsSync(configPath), "spex-init dispatch did not create config");

    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      traits: Record<string, boolean>;
      permissions: string;
    };
    assert(config.traits.superpowers === true, "expected superpowers trait to be enabled after /spex-init");
    assert(config.traits["deep-review"] === true, "expected deep-review trait to be enabled after /spex-init");
    assert(config.permissions === "standard", "expected standard permissions after /spex-init");

    const speckitPrompt = await readFile(join(repo, ".pi", "prompts", "speckit.specify.md"), "utf8");
    assert(speckitPrompt.toLowerCase().includes("feature specification"), "expected Spec Kit Pi prompt to be generated");

    const featureDir = join(repo, "specs", "001-demo");
    await mkdir(featureDir, { recursive: true });
    await writeFile(
      join(featureDir, "spec.md"),
      "# Feature Specification: Demo\n\n## User Scenarios & Testing\n- demo\n\n## Requirements\n- demo\n\n## Success Criteria\n- demo\n",
      "utf8",
    );
    await writeFile(
      join(featureDir, "plan.md"),
      "# Implementation Plan: Demo\n\n## Summary\n- demo\n\n## Technical Context\n- demo\n\n## Constitution Check\n- ok\n",
      "utf8",
    );
    await writeFile(
      join(featureDir, "tasks.md"),
      "# Tasks: Demo\n\n## Phase 1: Setup\n- done\n\n## Dependencies & Execution Order\n- linear\n\n## Implementation Strategy\n- incremental\n",
      "utf8",
    );
    await writeFile(
      join(featureDir, "implementation.md"),
      "# Implementation Summary\n\n## Completed Work\n- demo\n\n## Changed Files\n- demo\n\n## Verification Run\n- demo\n",
      "utf8",
    );
    await writeFile(
      join(featureDir, "verification.md"),
      "# Verification Summary\n\n## Commands Run\n- demo\n\n## Results\n- pass\n\n## Outstanding Risks\n- none\n",
      "utf8",
    );

    faux.setResponses(buildShipResponses());
    const shipArgs = "--start-from implement";
    await runCommand(sessionResult, "spex-ship", shipArgs, repo);

    const shipStatePath = join(repo, ".specify", ".spex-ship-phase.json");
    assert(await waitForFile(shipStatePath, 5000), "spex-ship command did not create a ship state file");

    let shipState = JSON.parse(await readFile(shipStatePath, "utf8")) as {
      stage: string;
      stageIndex: number;
      status: string;
      ask: string;
    };
    if (shipState.stage === "implement") {
      await sleep(500);
      shipState = JSON.parse(await readFile(shipStatePath, "utf8")) as {
        stage: string;
        stageIndex: number;
        status: string;
        ask: string;
      };
    }

    if (shipState.stage === "implement") {
      await sessionResult.session.prompt(
        buildShipStartPrompt({
          stage: "implement",
          ask: "smart",
        }),
      );
      await waitForAgent(sessionResult.session);
      shipState = JSON.parse(await readFile(shipStatePath, "utf8")) as {
        stage: string;
        stageIndex: number;
        status: string;
      };
    }

    assert(shipState.stage === "review-code", `expected ship stage to advance to review-code, got ${shipState.stage}`);
    assert(shipState.stageIndex === 7, `expected ship stageIndex 7, got ${shipState.stageIndex}`);
    assert(shipState.status === "running", `expected ship status running, got ${shipState.status}`);

    await writeFile(
      join(featureDir, "review-code.md"),
      "# Code Review\n\n## Spec Compliance\nCompliance Score: 100%\n\n## Findings\nFinding Count: 0\n- none\n\n## Test Coverage Notes\n- smoke only\n\n## Residual Risks\nResidual Risks: none\n",
      "utf8",
    );

    const paused = await pauseShipState(repo, {
      blocker: "waiting on manual review acknowledgement",
      lastError: "paused for review",
    });
    assert(paused.state?.status === "paused", "expected ship state to become paused");

    faux.setResponses(buildShipResumeResponses());
    await runCommand(sessionResult, "spex-ship", "--resume", repo);

    shipState = JSON.parse(await readFile(shipStatePath, "utf8")) as {
      stage: string;
      stageIndex: number;
      status: string;
    };
    assert(shipState.status === "running", `expected paused resume to switch status back to running, got ${shipState.status}`);
    if (shipState.stage === "review-code" && paused.state) {
      const decision = getShipResumeDecision(paused.state);
      assert(decision.kind === "resume", "paused ship should produce a resume decision");
      await sessionResult.session.prompt(decision.prompt);
      await waitForAgent(sessionResult.session);
    }

    shipState = JSON.parse(await readFile(shipStatePath, "utf8")) as {
      stage: string;
      stageIndex: number;
      status: string;
    };
    assert(shipState.stage === "stamp", `expected paused resume to advance to stamp, got ${shipState.stage}`);
    assert(shipState.stageIndex === 8, `expected paused resume stageIndex 8, got ${shipState.stageIndex}`);
    assert(shipState.status === "running", `expected resumed ship status running, got ${shipState.status}`);

    await writeFile(
      join(featureDir, "stamp.md"),
      "# Final Stamp\n\nFinal Recommendation: ready\n",
      "utf8",
    );

    faux.setResponses(buildShipResponses());
    await sessionResult.session.prompt(
      buildShipStartPrompt({
        stage: "stamp",
        ask: "smart",
      }),
    );
    await waitForAgent(sessionResult.session);
    assert(!existsSync(shipStatePath), "expected ship state file to be removed after completing stamp");

    const recreated = await createShipState(repo, {
      ask: "smart",
      startFrom: "stamp",
      featureDir: "specs/001-demo",
    });
    assert(recreated.state?.stage === "stamp", "expected recreated ship state to start at stamp");

    const failed = await failShipState(repo, {
      blocker: "tests still failing",
      lastError: "exit 1",
    });
    assert(failed.state?.status === "failed", "expected ship state to become failed");

    await assertRejects(
      () => runCommand(sessionResult, "spex-ship", "--resume", repo),
      /Cannot resume a failed spex ship pipeline.*\/spex-ship cleanup/s,
      "failed resume should reject with cleanup guidance",
    );

    shipState = JSON.parse(await readFile(shipStatePath, "utf8")) as {
      stage: string;
      stageIndex: number;
      status: string;
    };
    assert(shipState.stage === "stamp", `expected failed resume to keep stamp stage, got ${shipState.stage}`);
    assert(shipState.status === "failed", `expected failed resume to leave status failed, got ${shipState.status}`);

    console.log("e2e pi smoke ok");
  } finally {
    faux.unregister();
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
