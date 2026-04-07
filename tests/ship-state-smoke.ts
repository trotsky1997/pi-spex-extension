import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SHIP_STAGE_NAMES,
  advanceShipState,
  cleanupShipState,
  createShipState,
  failShipState,
  getShipStatePath,
  loadShipState,
  pauseShipState,
} from "../extensions/spex/ship-state.js";

async function assertRejects(fn: () => Promise<unknown>, pattern: RegExp, label: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) {
      throw new Error(`${label}: expected ${pattern}, got ${message}`);
    }
    return;
  }
  throw new Error(`${label}: expected failure but the call succeeded`);
}

async function main(): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "pi-spex-ship-"));
  try {
    const created = await createShipState(cwd, {
      ask: "smart",
      brainstormFile: "brainstorm/001-demo.md",
    });
    if (!created.state || created.state.stage !== SHIP_STAGE_NAMES[0]) {
      throw new Error("createShipState did not start at the first stage");
    }

    await assertRejects(
      () => createShipState(cwd, { ask: "smart" }),
      /already active/i,
      "createShipState duplicate guard",
    );

    await cleanupShipState(cwd);
    await mkdir(join(cwd, "specs", "001-demo"), { recursive: true });
    await assertRejects(
      () => createShipState(cwd, { ask: "smart", startFrom: "implement", featureDir: "specs/001-demo" }),
      /requires `spec\.md`, `plan\.md`, `tasks\.md`/i,
      "createShipState start-from artifact gate",
    );

    await createShipState(cwd, {
      ask: "smart",
      brainstormFile: "brainstorm/001-demo.md",
    });

    await assertRejects(
      () => advanceShipState(cwd),
      /requires `spec\.md`/i,
      "advanceShipState specify artifact gate",
    );

    await writeFile(join(cwd, "specs", "001-demo", "spec.md"), "# Spec\n\nDraft\n", "utf8");
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required content: "# Feature Specification:"/i,
      "advanceShipState specify content gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "spec.md"),
      "# Feature Specification: Demo\n\n## User Scenarios & Testing\n- demo\n\n## Requirements\n- demo\n\n## Success Criteria\n- demo\n",
      "utf8",
    );

    const advanced = await advanceShipState(cwd);
    if (!advanced.state || advanced.state.stage !== "clarify") {
      throw new Error("advanceShipState did not move to clarify");
    }

    await assertRejects(
      () => advanceShipState(cwd),
      /requires `clarify\.md`/i,
      "advanceShipState clarify artifact gate",
    );

    await writeFile(join(cwd, "specs", "001-demo", "clarify.md"), "# Clarify\n", "utf8");
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required content: "# Clarification Summary"/i,
      "advanceShipState clarify content gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "clarify.md"),
      "# Clarification Summary\n\n## Questions Resolved\n- demo\n\n## Spec Updates\n- demo\n",
      "utf8",
    );
    await writeFile(join(cwd, "specs", "001-demo", "spec.md"), "[NEEDS CLARIFICATION: confirm scope]", "utf8");
    await assertRejects(
      () => advanceShipState(cwd),
      /needs clarification/i,
      "advanceShipState clarify marker gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "spec.md"),
      "# Feature Specification: Demo\n\n## User Scenarios & Testing\n- demo\n\n## Requirements\n- demo\n\n## Success Criteria\n- demo\n",
      "utf8",
    );
    const reviewSpec = await advanceShipState(cwd);
    if (!reviewSpec.state || reviewSpec.state.stage !== "review-spec") {
      throw new Error("advanceShipState did not move to review-spec");
    }

    await assertRejects(
      () => advanceShipState(cwd),
      /requires `review-spec\.md`/i,
      "advanceShipState review-spec artifact gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "review-spec.md"),
      "# Spec Review\n\n## Findings\n- none\n\n## Remediation Checklist\n- none\n",
      "utf8",
    );
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required content: "## Verdict"/i,
      "advanceShipState review-spec heading schema gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "review-spec.md"),
      "# Spec Review\n\n## Verdict\nTBD\n\n## Findings\n- none\n\n## Remediation Checklist\n- none\n\n## Residual Risks\nnone\n",
      "utf8",
    );
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required structure: a `Verdict: approved\|revise\|required-clarification` line/i,
      "advanceShipState review-spec structured schema gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "review-spec.md"),
      "# Spec Review\n\n## Verdict\nVerdict: approved\n\n## Findings\nFinding Count: 0\n- none\n\n## Remediation Checklist\n- none\n\n## Residual Risks\nResidual Risks: none\n",
      "utf8",
    );

    const planStage = await advanceShipState(cwd);
    if (!planStage.state || planStage.state.stage !== "plan") {
      throw new Error("advanceShipState did not move to plan");
    }

    await assertRejects(
      () => advanceShipState(cwd),
      /requires `plan\.md`/i,
      "advanceShipState plan artifact gate",
    );

    await writeFile(join(cwd, "specs", "001-demo", "plan.md"), "# Plan\n", "utf8");
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required content: "# Implementation Plan:"/i,
      "advanceShipState plan content gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "plan.md"),
      "# Implementation Plan: Demo\n\n## Summary\n- demo\n\n## Technical Context\n- demo\n\n## Constitution Check\n- ok\n",
      "utf8",
    );
    const tasksStage = await advanceShipState(cwd);
    if (!tasksStage.state || tasksStage.state.stage !== "tasks") {
      throw new Error("advanceShipState did not move to tasks");
    }

    await writeFile(join(cwd, "specs", "001-demo", "tasks.md"), "# Tasks\n", "utf8");
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required content: "# Tasks:"/i,
      "advanceShipState tasks content gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "tasks.md"),
      "# Tasks: Demo\n\n## Phase 1: Setup\n- done\n\n## Dependencies & Execution Order\n- linear\n\n## Implementation Strategy\n- incremental\n",
      "utf8",
    );
    const reviewPlan = await advanceShipState(cwd);
    if (!reviewPlan.state || reviewPlan.state.stage !== "review-plan") {
      throw new Error("advanceShipState did not move to review-plan");
    }

    await assertRejects(
      () => advanceShipState(cwd),
      /requires `review-plan\.md`/i,
      "advanceShipState review-plan artifact gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "review-plan.md"),
      "# Plan Review\n\n## Findings\n- none\n\n## Gap-Closure Checklist\n- none\n",
      "utf8",
    );
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required content: "## Coverage Summary"/i,
      "advanceShipState review-plan heading schema gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "review-plan.md"),
      "# Plan Review\n\n## Coverage Summary\nTBD\n\n## Findings\n- none\n\n## Gap-Closure Checklist\n- none\n\n## Residual Risks\nnone\n",
      "utf8",
    );
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required structure: a `Coverage Status: full\|partial\|insufficient` line/i,
      "advanceShipState review-plan structured schema gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "review-plan.md"),
      "# Plan Review\n\n## Coverage Summary\nCoverage Status: full\n\n## Findings\nFinding Count: 0\n- none\n\n## Gap-Closure Checklist\n- none\n\n## Residual Risks\nResidual Risks: none\n",
      "utf8",
    );

    const paused = await pauseShipState(cwd, { blocker: "waiting on review" });
    if (!paused.state || paused.state.status !== "paused" || paused.state.blocker !== "waiting on review") {
      throw new Error("pauseShipState did not persist pause metadata");
    }

    await assertRejects(
      () => advanceShipState(cwd),
      /status is `paused`/i,
      "advanceShipState paused gate",
    );

    const failed = await failShipState(cwd, { lastError: "spec mismatch" });
    if (!failed.state || failed.state.status !== "failed" || failed.state.lastError !== "spec mismatch") {
      throw new Error("failShipState did not persist failure metadata");
    }

    const loaded = await loadShipState(cwd);
    if (!loaded || loaded.stage !== "review-plan") {
      throw new Error("loadShipState did not retain the current stage");
    }

    const cleaned = await cleanupShipState(cwd);
    if (!cleaned.removed) {
      throw new Error("cleanupShipState did not report removal");
    }

    const afterCleanup = await loadShipState(cwd);
    if (afterCleanup) {
      throw new Error("ship state still exists after cleanup");
    }

    const second = await createShipState(cwd, {
      ask: "always",
      startFrom: "implement",
      featureDir: "specs/001-demo",
    });
    if (!second.state || second.state.stage !== "implement") {
      throw new Error("createShipState did not honor startFrom implement");
    }

    await assertRejects(
      () => advanceShipState(cwd),
      /requires `implementation\.md`/i,
      "advanceShipState implement artifact gate",
    );

    await writeFile(join(cwd, "specs", "001-demo", "implementation.md"), "# Implementation\n", "utf8");
    await writeFile(
      join(cwd, "specs", "001-demo", "verification.md"),
      "# Verification Summary\n\n## Commands Run\n- demo\n\n## Results\n- pass\n\n## Outstanding Risks\n- none\n",
      "utf8",
    );
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required content: "# Implementation Summary"/i,
      "advanceShipState implement content gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "implementation.md"),
      "# Implementation Summary\n\n## Completed Work\n- demo\n\n## Changed Files\n- demo\n\n## Verification Run\n- demo\n",
      "utf8",
    );

    await rm(join(cwd, "specs", "001-demo", "verification.md"), { force: true });
    await assertRejects(
      () => advanceShipState(cwd),
      /requires `verification\.md`/i,
      "advanceShipState verification artifact gate",
    );

    await writeFile(join(cwd, "specs", "001-demo", "verification.md"), "# Verification\n", "utf8");
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required content: "# Verification Summary"/i,
      "advanceShipState verification content gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "verification.md"),
      "# Verification Summary\n\n## Commands Run\n- demo\n\n## Results\n- pass\n\n## Outstanding Risks\n- none\n",
      "utf8",
    );

    const reviewCode = await advanceShipState(cwd);
    if (!reviewCode.state || reviewCode.state.stage !== "review-code") {
      throw new Error("advanceShipState did not move from implement to review-code");
    }

    await assertRejects(
      () => advanceShipState(cwd),
      /requires `review-code\.md`/i,
      "advanceShipState review-code artifact gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "review-code.md"),
      "# Code Review\n\n## Spec Compliance\n- aligned\n\n## Findings\n- none\n",
      "utf8",
    );
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required content: "## Test Coverage Notes"/i,
      "advanceShipState review-code heading schema gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "review-code.md"),
      "# Code Review\n\n## Spec Compliance\nTBD\n\n## Findings\n- none\n\n## Test Coverage Notes\nTBD\n\n## Residual Risks\nnone\n",
      "utf8",
    );
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required structure: a `Compliance Score: <number>%` line/i,
      "advanceShipState review-code structured schema gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "review-code.md"),
      "# Code Review\n\n## Spec Compliance\nCompliance Score: 100%\n\n## Findings\nFinding Count: 0\n- none\n\n## Test Coverage Notes\n- smoke only\n\n## Residual Risks\nResidual Risks: none\n",
      "utf8",
    );

    const stamp = await advanceShipState(cwd);
    if (!stamp.state || stamp.state.stage !== "stamp") {
      throw new Error("advanceShipState did not move from review-code to stamp");
    }

    await assertRejects(
      () => advanceShipState(cwd),
      /requires `stamp\.md`/i,
      "advanceShipState stamp artifact gate",
    );

    await writeFile(join(cwd, "specs", "001-demo", "stamp.md"), "# Final Stamp\n\nPending\n", "utf8");
    await assertRejects(
      () => advanceShipState(cwd),
      /missing required content: "Final Recommendation:"/i,
      "advanceShipState stamp content gate",
    );

    await writeFile(
      join(cwd, "specs", "001-demo", "stamp.md"),
      "# Final Stamp\n\nFinal Recommendation: ready\n",
      "utf8",
    );

    const completed = await advanceShipState(cwd);
    if (!completed.removed) {
      throw new Error("advanceShipState did not clean up the pipeline after stamp");
    }

    console.log(`ship state smoke ok: ${getShipStatePath(cwd)}`);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
