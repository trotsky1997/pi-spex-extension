import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader } from "@mariozechner/pi-coding-agent";
import { createDefaultConfig } from "../extensions/spex/state.js";
import { getHelpText, getTeamHelpText, getTeamImplementDispatchPrompt, getTeamPlanDispatchPrompt, getTeamWrapupDispatchPrompt } from "../extensions/spex/prompts.js";

const execFile = promisify(execFileCb);
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), "pi-spex-skill-"));
  const repo = join(tmp, "repo");
  const agentDir = join(tmp, "agent");
  try {
    await mkdir(repo, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(repo, "README.md"), "# skill smoke\n", "utf8");
    await execFile("pi", ["install", "-l", ROOT_DIR], { cwd: repo });

    const loader = new DefaultResourceLoader({ cwd: repo, agentDir });
    await loader.reload();
    const skills = loader.getSkills();
    const names = skills.skills.map((skill) => skill.name);
    assert(names.includes("spec-driven-development-consultant"), `expected consultant skill, got: ${names.join(", ")}`);
    const helpText = getHelpText(createDefaultConfig());
    assert(helpText.includes("/spex-team plan"), "expected help text to mention /spex-team plan");
    assert(helpText.includes("/spex-team implement"), "expected help text to mention /spex-team implement");
    assert(helpText.includes("/spex-team wrapup"), "expected help text to mention /spex-team wrapup");
    const teamHelpText = getTeamHelpText();
    assert(teamHelpText.includes("/spex-team plan"), "expected team help text to mention /spex-team plan");
    assert(teamHelpText.includes("/spex-team implement"), "expected team help text to mention /spex-team implement");
    assert(teamHelpText.includes("/spex-team wrapup"), "expected team help text to mention /spex-team wrapup");
    assert(getTeamPlanDispatchPrompt("").includes("pi-claude-subagent"), "expected team plan dispatch prompt to mention pi-claude-subagent");
    assert(getTeamImplementDispatchPrompt("").includes("TaskCreate"), "expected team implement dispatch prompt to mention TaskCreate");
    assert(getTeamWrapupDispatchPrompt("").includes("SendMessage"), "expected team wrapup dispatch prompt to mention SendMessage");
    console.log("skill and prompt smoke ok");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
