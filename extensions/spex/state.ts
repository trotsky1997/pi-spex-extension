import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const SUPPORTED_TRAITS = ["superpowers", "deep-review", "worktrees"] as const;
export type TraitName = (typeof SUPPORTED_TRAITS)[number];

export const SUPPORTED_PERMISSION_LEVELS = ["none", "standard", "yolo"] as const;
export type PermissionLevel = (typeof SUPPORTED_PERMISSION_LEVELS)[number];

export type SpexConfig = {
  version: 1;
  bootstrap: "external-specify-cli";
  commandStyle: "hyphen";
  traits: Record<TraitName, boolean>;
  permissions: PermissionLevel;
  updatedAt: string;
};

export const CONFIG_RELATIVE_PATH = ".specify/spex-traits.json";

function nowIso(): string {
  return new Date().toISOString();
}

export function getConfigPath(cwd: string): string {
  return resolve(cwd, CONFIG_RELATIVE_PATH);
}

export function createDefaultConfig(): SpexConfig {
  return {
    version: 1,
    bootstrap: "external-specify-cli",
    commandStyle: "hyphen",
    traits: {
      "superpowers": false,
      "deep-review": false,
      "worktrees": false,
    },
    permissions: "standard",
    updatedAt: nowIso(),
  };
}

function normalizeConfig(input: unknown): SpexConfig {
  const defaults = createDefaultConfig();
  if (!input || typeof input !== "object") return defaults;

  const source = input as Partial<SpexConfig> & {
    traits?: Partial<Record<TraitName, boolean>>;
    permissions?: string;
  };

  return {
    version: 1,
    bootstrap: "external-specify-cli",
    commandStyle: "hyphen",
    traits: {
      "superpowers": Boolean(source.traits?.["superpowers"]),
      "deep-review": Boolean(source.traits?.["deep-review"]),
      "worktrees": Boolean(source.traits?.["worktrees"]),
    },
    permissions: SUPPORTED_PERMISSION_LEVELS.includes(source.permissions as PermissionLevel)
      ? (source.permissions as PermissionLevel)
      : defaults.permissions,
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : defaults.updatedAt,
  };
}

export async function loadConfig(cwd: string): Promise<SpexConfig> {
  const path = getConfigPath(cwd);
  if (!existsSync(path)) return createDefaultConfig();
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return normalizeConfig(parsed);
  } catch {
    return createDefaultConfig();
  }
}

export async function saveConfig(cwd: string, config: SpexConfig): Promise<string> {
  const path = getConfigPath(cwd);
  const normalized: SpexConfig = {
    ...normalizeConfig(config),
    updatedAt: nowIso(),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return path;
}

export async function updateConfig(
  cwd: string,
  apply: (config: SpexConfig) => SpexConfig,
): Promise<SpexConfig> {
  const current = await loadConfig(cwd);
  const next = normalizeConfig(apply(current));
  await saveConfig(cwd, next);
  return next;
}

export function parseTraitCsv(input: string): TraitName[] {
  const seen = new Set<TraitName>();
  for (const item of input.split(",")) {
    const trimmed = item.trim() as TraitName;
    if (SUPPORTED_TRAITS.includes(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
    }
  }
  return [...seen];
}

export function formatEnabledTraits(config: SpexConfig): string {
  const enabled = SUPPORTED_TRAITS.filter((trait) => config.traits[trait]);
  return enabled.length > 0 ? enabled.join(", ") : "none";
}

export function isSpecKitInitialized(cwd: string): boolean {
  return (
    existsSync(resolve(cwd, ".specify", "templates", "spec-template.md")) &&
    existsSync(resolve(cwd, ".pi", "prompts", "speckit.specify.md"))
  );
}
