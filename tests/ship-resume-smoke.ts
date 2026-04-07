import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getShipResumeDecision } from "../extensions/spex/ship.js";
import { createShipState, failShipState, loadShipState, pauseShipState, saveShipState, validateResumeState, type ShipState } from "../extensions/spex/ship-state.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "pi-spex-resume-"));
  try {
    await mkdir(join(cwd, "specs", "001-demo"), { recursive: true });
    await writeFile(join(cwd, "specs", "001-demo", "spec.md"), "# Spec\n", "utf8");
    await writeFile(join(cwd, "specs", "001-demo", "plan.md"), "# Plan\n", "utf8");
    await writeFile(join(cwd, "specs", "001-demo", "tasks.md"), "# Tasks\n", "utf8");

    const created = await createShipState(cwd, {
      ask: "smart",
      startFrom: "implement",
      featureDir: "specs/001-demo",
    });
    assert(created.state?.stage === "implement", "expected implement stage");

    const validated = await validateResumeState(cwd, created.state!);
    const runningDecision = getShipResumeDecision(validated);
    assert(runningDecision.kind === "resume", "running pipeline should be resumable");
    assert(runningDecision.prompt.includes("implement"), "running resume prompt should mention stage");

    const paused = await pauseShipState(cwd, { blocker: "waiting on human review" });
    const pausedDecision = getShipResumeDecision(paused.state!);
    assert(pausedDecision.kind === "resume", "paused pipeline should still be resumable");
    assert(pausedDecision.prompt.includes("waiting on human review"), "paused resume prompt should include blocker");

    const failed = await failShipState(cwd, { blocker: "tests failing", lastError: "exit 1" });
    const failedDecision = getShipResumeDecision(failed.state!);
    assert(failedDecision.kind === "reject", "failed pipeline should not auto-resume");
    assert(failedDecision.message.includes("tests failing"), "failed resume message should include blocker");
    assert(failedDecision.message.includes("/spex-ship cleanup"), "failed resume message should suggest cleanup");

    const completedState: ShipState = {
      ...(await loadShipState(cwd))!,
      stage: "done",
      stageIndex: 9,
      status: "completed",
    };
    await saveShipState(cwd, completedState);
    const completedDecision = getShipResumeDecision(completedState);
    assert(completedDecision.kind === "cleanup", "completed pipeline should trigger cleanup guidance");

    await rm(join(cwd, "specs", "001-demo", "tasks.md"), { force: true });
    const brokenState: ShipState = {
      ...completedState,
      stage: "implement",
      stageIndex: 6,
      status: "running",
    };
    await saveShipState(cwd, brokenState);
    let rejected = false;
    try {
      await validateResumeState(cwd, brokenState);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert(/requires `tasks\.md`/i.test(message), "resume validation should fail on missing task artifact");
      rejected = true;
    }
    assert(rejected, "resume validation should reject missing artifacts");

    console.log("ship resume smoke ok");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
