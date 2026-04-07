import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

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
    console.log("skill smoke ok");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
