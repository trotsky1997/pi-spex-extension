import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { ensureSpecifyAvailable, runBootstrap } from "./bootstrap.js";
import { buildShipContext, handleShipCommand, registerShipTool } from "./ship.js";
import { getInjectedTurnContext } from "./context.js";
import {
  getHelpText,
  getInitDispatchPrompt,
  getInitSummary,
  getTraitsDispatchPrompt,
  getTraitsSummary,
  getTraitsUpdateSummary,
  getWorktreeHelpText,
} from "./prompts.js";
import {
  CONFIG_RELATIVE_PATH,
  SUPPORTED_PERMISSION_LEVELS,
  SUPPORTED_TRAITS,
  formatEnabledTraits,
  getConfigPath,
  isSpecKitInitialized,
  loadConfig,
  parseTraitCsv,
  saveConfig,
  type PermissionLevel,
} from "./state.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROMPTS_DIR = join(PACKAGE_ROOT, "prompts");
const CONTEXT_MESSAGE_TYPE = "pi-spex-context";
const ASK_USER_QUESTION_TOOL_NAME = "AskUserQuestion";

type SpexInitProjectParams = {
  refresh?: boolean;
  update?: boolean;
  traits?: string[];
  permissions?: PermissionLevel;
};

type SpexUpdateTraitsParams = {
  enable?: string[];
  disable?: string[];
  permissions?: PermissionLevel;
};

function parseInitArgs(args: string): {
  refresh: boolean;
  update: boolean;
  traitCsv?: string;
  permissions?: PermissionLevel;
} {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let refresh = false;
  let update = false;
  let traitCsv: string | undefined;
  let permissions: PermissionLevel | undefined;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--refresh") {
      refresh = true;
      continue;
    }
    if (token === "--update") {
      update = true;
      continue;
    }
    if (token === "--traits") {
      traitCsv = tokens[i + 1];
      i += 1;
      continue;
    }
    if (token === "--permissions") {
      const value = tokens[i + 1] as PermissionLevel | undefined;
      if (value && SUPPORTED_PERMISSION_LEVELS.includes(value)) {
        permissions = value;
      }
      i += 1;
    }
  }

  return { refresh, update, traitCsv, permissions };
}

async function openMarkdown(ctx: ExtensionCommandContext | ExtensionContext, title: string, content: string): Promise<void> {
  if (ctx.hasUI) {
    await ctx.ui.editor(title, content);
    return;
  }
  ctx.ui.notify(content, "info");
}

function updateStatus(ctx: ExtensionCommandContext | ExtensionContext, config: Awaited<ReturnType<typeof loadConfig>>): void {
  const enabled = formatEnabledTraits(config);
  ctx.ui.setStatus("pi-spex", enabled === "none" ? "spex:ready" : `spex:${enabled}`);
}

function buildNextConfig(
  current: Awaited<ReturnType<typeof loadConfig>>,
  options: {
    traits?: string[];
    permissions?: PermissionLevel;
  },
) {
  return {
    ...current,
    traits: options.traits
      ? {
          ...current.traits,
          ...Object.fromEntries(SUPPORTED_TRAITS.map((trait) => [trait, false])) as Record<(typeof SUPPORTED_TRAITS)[number], boolean>,
          ...Object.fromEntries(parseTraitCsv(options.traits.join(",")).map((trait) => [trait, true])) as Record<(typeof SUPPORTED_TRAITS)[number], boolean>,
        }
      : current.traits,
    permissions: options.permissions ?? current.permissions,
  };
}

function hasAskUserQuestionTool(pi: ExtensionAPI): boolean {
  return pi.getAllTools().some((tool: { name: string }) => tool.name === ASK_USER_QUESTION_TOOL_NAME);
}

function normalizeTraits(input: string[] | undefined): (typeof SUPPORTED_TRAITS)[number][] {
  return (input ?? []).filter((trait): trait is (typeof SUPPORTED_TRAITS)[number] =>
    SUPPORTED_TRAITS.includes(trait as (typeof SUPPORTED_TRAITS)[number]),
  );
}

async function executeInitProject(
  pi: ExtensionAPI,
  params: SpexInitProjectParams,
  ctx: ExtensionCommandContext | ExtensionContext,
): Promise<{ title: string; body: string }> {
  const current = await loadConfig(ctx.cwd);
  const next = buildNextConfig(current, {
    traits: params.traits,
    permissions: params.permissions,
  });

  const refresh = Boolean(params.refresh);
  const update = Boolean(params.update);

  const alreadyInitialized = isSpecKitInitialized(ctx.cwd);

  if (alreadyInitialized && !refresh && !update) {
    const version = await ensureSpecifyAvailable(pi);
    const configPath = await saveConfig(ctx.cwd, next);
    updateStatus(ctx, next);
    return {
      title: "pi-spex init",
      body: getInitSummary(
        configPath,
        next,
        version,
        "Spec Kit is already initialized in this repository. Trait config was refreshed only.",
      ),
    };
  }

  const result = await runBootstrap(pi, {
    cwd: ctx.cwd,
    refresh: refresh || update,
    update,
    config: next,
  });

  updateStatus(ctx, next);

  return {
    title: "pi-spex init",
    body: getInitSummary(result.configPath, next, result.specifyVersion, result.summary),
  };
}

async function executeUpdateTraits(
  params: SpexUpdateTraitsParams,
  ctx: ExtensionCommandContext | ExtensionContext,
): Promise<{ title: string; body: string }> {
  const config = await loadConfig(ctx.cwd);
  const enable = normalizeTraits(params.enable);
  const disable = normalizeTraits(params.disable).filter((trait) => !enable.includes(trait));
  const ignoredDisable = normalizeTraits(params.disable).filter((trait) => enable.includes(trait));

  for (const trait of enable) config.traits[trait] = true;
  for (const trait of disable) config.traits[trait] = false;
  const changedPermissions =
    params.permissions && SUPPORTED_PERMISSION_LEVELS.includes(params.permissions)
      ? params.permissions
      : undefined;
  if (changedPermissions) {
    config.permissions = changedPermissions;
  }

  const configPath = await saveConfig(ctx.cwd, config);
  updateStatus(ctx, config);
  return {
    title: "pi-spex traits",
    body: getTraitsUpdateSummary({
      configPath,
      enabledTraits: formatEnabledTraits(config),
      permissions: config.permissions,
      changedEnable: enable,
      changedDisable: disable,
      changedPermissions,
      ignoredDisable,
    }),
  };
}

async function handleInit(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  if (!hasAskUserQuestionTool(pi)) {
    ctx.ui.notify(
      "`AskUserQuestion` is not available. Install the `pi-claude-code-ask-user` package, then run /spex-init again.",
      "warning",
    );
    return;
  }

  const parsed = parseInitArgs(args);
  const preselectedTraits = parsed.traitCsv ? parseTraitCsv(parsed.traitCsv) : [];
  const preselectedPermissions =
    parsed.permissions === "standard"
      ? "Standard (Recommended)"
      : parsed.permissions === "yolo"
        ? "YOLO"
        : parsed.permissions === "none"
          ? "None"
          : undefined;

  pi.sendUserMessage(
    getInitDispatchPrompt({
      refresh: parsed.refresh,
      update: parsed.update,
      preselectedTraits,
      preselectedPermissions,
    }),
  );
  ctx.ui.notify("Queued spex init workflow. The agent will use AskUserQuestion for trait and permission selection.", "info");
}

async function handleTraits(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const [action = "list", value = ""] = args.trim().split(/\s+/, 2);
  const config = await loadConfig(ctx.cwd);

  if (action === "list" || action === "show") {
    await openMarkdown(ctx, "pi-spex traits", getTraitsSummary(config, getConfigPath(ctx.cwd)));
    return;
  }

  if (action === "enable") {
    const traits = parseTraitCsv(value);
    if (traits.length === 0) {
      ctx.ui.notify(`No valid trait provided. Supported: ${SUPPORTED_TRAITS.join(", ")}`, "warning");
      return;
    }
    for (const trait of traits) config.traits[trait] = true;
    await saveConfig(ctx.cwd, config);
    updateStatus(ctx, config);
    ctx.ui.notify(`Enabled: ${traits.join(", ")}`, "info");
    return;
  }

  if (action === "disable") {
    const traits = parseTraitCsv(value);
    if (traits.length === 0) {
      ctx.ui.notify(`No valid trait provided. Supported: ${SUPPORTED_TRAITS.join(", ")}`, "warning");
      return;
    }
    for (const trait of traits) config.traits[trait] = false;
    await saveConfig(ctx.cwd, config);
    updateStatus(ctx, config);
    ctx.ui.notify(`Disabled: ${traits.join(", ")}`, "info");
    return;
  }

  if (action === "permissions") {
    const level = value.trim() as PermissionLevel;
    if (!SUPPORTED_PERMISSION_LEVELS.includes(level)) {
      ctx.ui.notify(`Invalid permission level. Use one of: ${SUPPORTED_PERMISSION_LEVELS.join(", ")}`, "warning");
      return;
    }
    config.permissions = level;
    await saveConfig(ctx.cwd, config);
    updateStatus(ctx, config);
    ctx.ui.notify(`Permissions set to ${level}.`, "info");
    return;
  }

  if (action === "interactive" || action === "ask" || action === "configure") {
    if (!hasAskUserQuestionTool(pi)) {
      ctx.ui.notify(
        "`AskUserQuestion` is not available. Install the `pi-claude-code-ask-user` package, then run /spex-traits interactive again.",
        "warning",
      );
      return;
    }

    pi.sendUserMessage(getTraitsDispatchPrompt(config));
    ctx.ui.notify("Queued interactive spex-traits workflow. The agent will use AskUserQuestion before updating config.", "info");
    return;
  }

  ctx.ui.notify("Usage: /spex-traits [list|enable <csv>|disable <csv>|permissions <none|standard|yolo>|interactive]", "warning");
}

async function handleHelp(ctx: ExtensionCommandContext): Promise<void> {
  const config = await loadConfig(ctx.cwd);
  await openMarkdown(ctx, "pi-spex help", getHelpText(config));
}

async function handleWorktree(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const [action = "list", pathArg, branchArg] = args.trim().split(/\s+/);

  if (action === "list" || !action) {
    const result = await pi.exec("git", ["worktree", "list"], { cwd: ctx.cwd, timeout: 15000 });
    if (result.code !== 0) {
      throw new Error((result.stderr || result.stdout || "git worktree list failed").trim());
    }
    await openMarkdown(ctx, "git worktree list", `# git worktree list\n\n\`\`\`text\n${result.stdout.trim()}\n\`\`\``);
    return;
  }

  if (action === "prune") {
    const result = await pi.exec("git", ["worktree", "prune"], { cwd: ctx.cwd, timeout: 15000 });
    if (result.code !== 0) {
      throw new Error((result.stderr || result.stdout || "git worktree prune failed").trim());
    }
    ctx.ui.notify((result.stdout || "Pruned stale worktrees.").trim(), "info");
    return;
  }

  if (action === "add") {
    if (!pathArg) {
      await openMarkdown(ctx, "spex-worktree help", getWorktreeHelpText());
      return;
    }
    const gitArgs = ["worktree", "add", pathArg];
    if (branchArg) gitArgs.push(branchArg);
    const result = await pi.exec("git", gitArgs, { cwd: ctx.cwd, timeout: 30000 });
    if (result.code !== 0) {
      throw new Error((result.stderr || result.stdout || "git worktree add failed").trim());
    }
    ctx.ui.notify((result.stdout || `Created worktree at ${pathArg}`).trim(), "info");
    return;
  }

  await openMarkdown(ctx, "spex-worktree help", getWorktreeHelpText());
}

export default function spex(pi: ExtensionAPI): void {
  pi.on("resources_discover", async () => ({
    promptPaths: [PROMPTS_DIR],
  }));

  registerShipTool(pi);

  pi.registerTool({
    name: "spex_init_project",
    label: "spex_init_project",
    description: "Bootstrap Spec Kit for Pi and persist pi-spex trait configuration after the user answers AskUserQuestion prompts.",
    promptSnippet: "Bootstrap Spec Kit for Pi after collecting trait and permission answers.",
    promptGuidelines: [
      "Use this after AskUserQuestion collects the spex trait and permission choices.",
      "Map permission labels to one of: standard, yolo, none.",
      "Pass only supported traits: superpowers, deep-review, worktrees.",
    ],
    parameters: Type.Object({
      refresh: Type.Optional(Type.Boolean({ description: "Force a refresh bootstrap of the current project." })),
      update: Type.Optional(Type.Boolean({ description: "Upgrade the external specify CLI before bootstrapping." })),
      traits: Type.Optional(Type.Array(Type.String({ description: "Trait name." }), {
        description: "Enabled traits chosen by the user.",
      })),
      permissions: Type.Optional(Type.String({
        description: "Permission profile: standard, yolo, or none.",
      })),
    }),
    async execute(
      _toolCallId: string,
      rawParams: unknown,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ) {
      const params = rawParams as SpexInitProjectParams;
      const permissions = params.permissions?.trim() as PermissionLevel | undefined;
      const result = await executeInitProject(pi, {
        refresh: params.refresh,
        update: params.update,
        traits: (params.traits ?? []).filter((trait): trait is (typeof SUPPORTED_TRAITS)[number] =>
          SUPPORTED_TRAITS.includes(trait as (typeof SUPPORTED_TRAITS)[number]),
        ),
        permissions: permissions && SUPPORTED_PERMISSION_LEVELS.includes(permissions) ? permissions : undefined,
      }, ctx);
      return {
        content: [{ type: "text", text: result.body }],
        details: {
          title: result.title,
        },
      };
    },
  });

  pi.registerTool({
    name: "spex_update_traits",
    label: "spex_update_traits",
    description: "Persist pi-spex trait and permission updates after the user answers AskUserQuestion prompts.",
    promptSnippet: "Update pi-spex trait state after AskUserQuestion collects the requested changes.",
    promptGuidelines: [
      "Use this after AskUserQuestion collects trait enable/disable and permission choices.",
      "Pass only supported traits: superpowers, deep-review, worktrees.",
      "If the user wants no permission change, omit permissions.",
      "If a trait appears in both enable and disable, the tool will keep it enabled and ignore the duplicate disable request.",
    ],
    parameters: Type.Object({
      enable: Type.Optional(Type.Array(Type.String({ description: "Trait name to enable." }), {
        description: "Traits to enable.",
      })),
      disable: Type.Optional(Type.Array(Type.String({ description: "Trait name to disable." }), {
        description: "Traits to disable.",
      })),
      permissions: Type.Optional(Type.String({
        description: "Optional permission profile: standard, yolo, or none.",
      })),
    }),
    async execute(
      _toolCallId: string,
      rawParams: unknown,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ) {
      const params = rawParams as SpexUpdateTraitsParams;
      const permissions = params.permissions?.trim() as PermissionLevel | undefined;
      const result = await executeUpdateTraits(
        {
          enable: params.enable,
          disable: params.disable,
          permissions: permissions && SUPPORTED_PERMISSION_LEVELS.includes(permissions) ? permissions : undefined,
        },
        ctx,
      );
      return {
        content: [{ type: "text", text: result.body }],
        details: {
          title: result.title,
        },
      };
    },
  });

  pi.registerCommand("spex-init", {
    description: "Bootstrap Spec Kit for Pi and create pi-spex trait config",
    handler: async (args: string, ctx: ExtensionCommandContext) => handleInit(pi, args, ctx),
  });

  pi.registerCommand("spex-traits", {
    description: "List, enable, disable, or update pi-spex traits",
    handler: async (args: string, ctx: ExtensionCommandContext) => handleTraits(pi, args, ctx),
  });

  pi.registerCommand("spex-help", {
    description: "Show pi-spex commands, traits, and workflow notes",
    handler: async (_args: string, ctx: ExtensionCommandContext) => handleHelp(ctx),
  });

  pi.registerCommand("spex-worktree", {
    description: "List, add, or prune git worktrees for spex-style feature isolation",
    handler: async (args: string, ctx: ExtensionCommandContext) => handleWorktree(pi, args, ctx),
  });

  pi.registerCommand("spex-ship", {
    description: "Run or resume the stateful spex ship pipeline",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const config = await loadConfig(ctx.cwd);
      await handleShipCommand(pi, args, ctx, config);
    },
  });

  pi.on("before_agent_start", async (event: any, ctx: ExtensionContext) => {
    const config = await loadConfig(ctx.cwd);
    const prompt = typeof event.prompt === "string" ? event.prompt : "";
    const injected = await getInjectedTurnContext(ctx.cwd, prompt, config);
    const { loadShipState } = await import("./ship-state.js");
    const shipState = await loadShipState(ctx.cwd);
    const parts = [
      ...(injected ? [injected] : []),
      ...(shipState ? [buildShipContext(ctx.cwd, shipState, config)] : []),
    ];

    if (parts.length === 0) return;

    return {
      message: {
        customType: CONTEXT_MESSAGE_TYPE,
        content: parts.join("\n\n"),
        display: false,
      },
    };
  });

  pi.on("context", async (event: any) => {
    const lastGenericIndex = event.messages.reduce((acc: number, message: any, index: number) => {
      return message.customType === CONTEXT_MESSAGE_TYPE ? index : acc;
    }, -1);

    return {
      messages: event.messages.filter((message: any, index: number) => {
        if (message.customType === CONTEXT_MESSAGE_TYPE) {
          return index === lastGenericIndex;
        }
        return true;
      }),
    };
  });

  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    try {
      await ensureSpecifyAvailable(pi);
    } catch {
      if (!isSpecKitInitialized(ctx.cwd)) {
        ctx.ui.notify(
          `pi-spex is installed. To bootstrap this repo, install specify and run /spex-init. Config path: ${CONFIG_RELATIVE_PATH}`,
          "info",
        );
        return;
      }
    }

    const config = await loadConfig(ctx.cwd);
    if (formatEnabledTraits(config) !== "none") {
      ctx.ui.setStatus("pi-spex", `spex:${formatEnabledTraits(config)}`);
    } else {
      ctx.ui.setStatus("pi-spex", "spex:ready");
    }
  });
}
