import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SpexConfig } from "./state.js";
import { formatEnabledTraits } from "./state.js";

function buildTraitBullets(config: SpexConfig): string[] {
  const lines: string[] = [];

  if (config.traits["superpowers"]) {
    lines.push("- `superpowers`: when working with Spec Kit or spex artifacts, prefer disciplined incremental flow, review before risky implementation, use TDD when practical, and verify before declaring completion.");
  }
  if (config.traits["deep-review"]) {
    lines.push("- `deep-review`: for code review, evaluate spec compliance first, then inspect correctness, architecture, security, production readiness, and test quality. Present findings first.");
  }
  if (config.traits["worktrees"]) {
    lines.push("- `worktrees`: prefer isolated feature worktrees for larger feature branches or risky implementation work. Keep the main checkout clean when possible.");
  }

  return lines;
}

async function getShipState(cwd: string): Promise<string | undefined> {
  const path = resolve(cwd, ".specify", ".spex-ship-phase.json");
  if (!existsSync(path)) return undefined;
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

export async function getInjectedTurnContext(cwd: string, prompt: string, config: SpexConfig): Promise<string | undefined> {
  const enabledTraits = formatEnabledTraits(config);
  if (enabledTraits === "none") return undefined;

  const traitLines = buildTraitBullets(config);
  if (traitLines.length === 0) return undefined;

  const promptLower = prompt.toLowerCase();
  const isSpexTurn =
    promptLower.startsWith("/spex-") ||
    promptLower.startsWith("/speckit.") ||
    promptLower.startsWith("/speckit-") ||
    promptLower.includes(".specify/") ||
    promptLower.includes("specs/");

  const shipState = await getShipState(cwd);
  const shipSuffix = shipState
    ? `\n\nCurrent ship state file (.specify/.spex-ship-phase.json):\n\n\`\`\`json\n${shipState.trim()}\n\`\`\``
    : "";

  return [
    `<pi-spex-context mode="${isSpexTurn ? "active" : "passive"}">`,
    `Enabled traits: ${enabledTraits}`,
    "Apply the following only when the user is using Spec Kit / spex workflow commands or editing spec artifacts. Do not force this workflow onto unrelated tasks.",
    ...traitLines,
    "When using spex helpers, keep output pragmatic: findings first, then concise remediation guidance.",
    shipSuffix,
    "</pi-spex-context>",
  ].filter(Boolean).join("\n");
}
