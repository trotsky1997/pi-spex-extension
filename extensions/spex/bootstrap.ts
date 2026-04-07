import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createDefaultConfig, saveConfig, type SpexConfig } from "./state.js";

const MIN_SPECIFY_VERSION = [0, 5, 0] as const;
const SPECIFY_INSTALL = "uv tool install specify-cli --from git+https://github.com/github/spec-kit.git";
const SPECIFY_UPDATE = "uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git";

export type BootstrapOptions = {
  cwd: string;
  refresh?: boolean;
  update?: boolean;
  config?: SpexConfig;
};

export type BootstrapResult = {
  changed: boolean;
  configPath: string;
  summary: string;
  needsReload: boolean;
  specifyVersion: string;
};

function parseVersionNumber(stdout: string): string | undefined {
  return stdout.match(/\b(\d+\.\d+\.\d+)/)?.[1];
}

function compareVersions(a: string, b: readonly number[]): number {
  const left = a.split(".").map((value) => Number.parseInt(value, 10));
  const right = [...b];
  for (let i = 0; i < 3; i += 1) {
    const lv = left[i] ?? 0;
    const rv = right[i] ?? 0;
    if (lv > rv) return 1;
    if (lv < rv) return -1;
  }
  return 0;
}

export async function ensureSpecifyAvailable(pi: ExtensionAPI): Promise<string> {
  const result = await pi.exec("specify", ["version"], { timeout: 10000 });
  if (result.code !== 0) {
    throw new Error(
      [
        "Spec Kit's `specify` CLI is not available.",
        `Install it with: ${SPECIFY_INSTALL}`,
      ].join("\n"),
    );
  }

  const version = parseVersionNumber(`${result.stdout}\n${result.stderr}`);
  if (!version) {
    throw new Error("Could not parse `specify version` output.");
  }
  if (compareVersions(version, MIN_SPECIFY_VERSION) < 0) {
    throw new Error(
      [
        `Spec Kit version ${version} is too old. Need >= ${MIN_SPECIFY_VERSION.join(".")}.`,
        `Upgrade with: ${SPECIFY_UPDATE}`,
      ].join("\n"),
    );
  }

  return version;
}

export async function runBootstrap(
  pi: ExtensionAPI,
  options: BootstrapOptions,
): Promise<BootstrapResult> {
  if (options.update) {
    const uv = await pi.exec("uv", ["tool", "install", "specify-cli", "--force", "--from", "git+https://github.com/github/spec-kit.git"], {
      timeout: 120000,
      cwd: options.cwd,
    });
    if (uv.code !== 0) {
      throw new Error(`Failed to update specify CLI.\n${uv.stderr || uv.stdout}`.trim());
    }
  }

  const specifyVersion = await ensureSpecifyAvailable(pi);

  const args = ["init", "--here", "--ai", "pi", "--force"];

  const init = await pi.exec("specify", args, {
    cwd: options.cwd,
    timeout: 120000,
  });
  if (init.code !== 0) {
    throw new Error(`specify init failed.\n${init.stderr || init.stdout}`.trim());
  }

  const config = options.config ?? createDefaultConfig();
  const configPath = await saveConfig(options.cwd, config);
  return {
    changed: true,
    configPath,
    needsReload: true,
    specifyVersion,
    summary: (init.stdout || init.stderr || "specify init finished").trim(),
  };
}
