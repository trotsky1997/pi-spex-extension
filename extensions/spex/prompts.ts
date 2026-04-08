import { formatEnabledTraits, type SpexConfig } from "./state.js";

type InitPromptOptions = {
  refresh: boolean;
  update: boolean;
  preselectedTraits: string[];
  preselectedPermissions?: string;
};

function getOptionalFocusBlock(argumentsText: string | undefined): string[] {
  const trimmed = argumentsText?.trim();
  return [
    "Extra focus from user:",
    "```text",
    trimmed || "(none)",
    "```",
    "",
  ];
}

export function getInitDispatchPrompt(options: InitPromptOptions): string {
  const prefilledAnswers = Object.entries({
    ...(options.preselectedTraits.length > 0
      ? {
          "Which spex traits do you want to enable?": options.preselectedTraits.join(", "),
        }
      : {}),
    ...(options.preselectedPermissions
      ? {
          "How should spex commands handle permission prompts?": options.preselectedPermissions,
        }
      : {}),
  }).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`);

  return [
    "Initialize spex for this Pi project.",
    "",
    "You MUST use the `AskUserQuestion` tool before bootstrapping unless both answers are already prefilled below.",
    "",
    "1. Ask these questions with `AskUserQuestion`:",
    "   - Question: \"Which spex traits do you want to enable?\"",
    "     Header: `Traits`",
    "     multiSelect: true",
    "     Options:",
    "       - `superpowers` - Quality gates and stronger workflow discipline around Spec Kit steps",
    "       - `deep-review` - Multi-lens code review guidance with spec compliance emphasis",
    "       - `teams` - Parallel planning research and implementation kickoff via pi-claude-subagent team tools",
    "       - `worktrees` - Git worktree isolation guidance for feature implementation",
    "   - Question: \"How should spex commands handle permission prompts?\"",
    "     Header: `Permissions`",
    "     Options:",
    "       - `Standard (Recommended)` - Auto-approve only normal spex bootstrap flows conceptually; keep everything else explicit",
    "       - `YOLO` - Favor speed and broad tool freedom for spex flows",
    "       - `None` - Keep confirmations explicit",
    "",
    ...(prefilledAnswers.length > 0
      ? [
          "2. Use these prefilled answers when calling `AskUserQuestion` if they match the user's intent:",
          "```json",
          "{",
          ...prefilledAnswers.map((line, index) => index === prefilledAnswers.length - 1 ? line : `${line},`),
          "}",
          "```",
          "",
        ]
      : ["2. Wait for the user answers from `AskUserQuestion`.", ""]),
    `3. Then call the tool \`spex_init_project\` with:`,
    `   - \`refresh\`: ${options.refresh ? "true" : "false"}`,
    `   - \`update\`: ${options.update ? "true" : "false"}`,
    "   - `traits`: selected traits as an array of `superpowers`, `deep-review`, `teams`, `worktrees` (use an empty array if the user wants no traits)",
    "   - `permissions`: map the selected permission label to one of `standard`, `yolo`, `none`",
    "",
    "4. Finally, summarize what was enabled and tell the user to run `/reload` if the new `/speckit.*` prompts are not visible yet.",
  ].join("\n");
}

export function getTraitsDispatchPrompt(config: SpexConfig): string {
  return [
    "Update the spex trait configuration for this Pi project.",
    "",
    "You MUST use the `AskUserQuestion` tool before changing anything.",
    "",
    `Current enabled traits: ${formatEnabledTraits(config)}`,
    `Current permission profile: ${config.permissions}`,
    "",
    "1. Ask these questions with `AskUserQuestion`:",
    "   - Question: \"Which traits should be enabled after this update?\"",
    "     Header: `Enable`",
    "     multiSelect: true",
    "     Options:",
    "       - `superpowers` - Quality gates and stronger workflow discipline around Spec Kit steps",
    "       - `deep-review` - Multi-lens code review guidance with spec compliance emphasis",
    "       - `teams` - Parallel planning research and implementation kickoff via pi-claude-subagent team tools",
    "       - `worktrees` - Git worktree isolation guidance for feature implementation",
    "   - Question: \"Which traits should be disabled after this update?\"",
    "     Header: `Disable`",
    "     multiSelect: true",
    "     Options:",
    "       - `superpowers` - Remove quality gate guidance and stricter workflow nudges",
    "       - `deep-review` - Remove deeper review guidance",
    "       - `teams` - Remove team orchestration guidance and teammate-first workflow nudges",
    "       - `worktrees` - Remove worktree-oriented workflow guidance",
    "   - Question: \"Which permission profile should be used after this update?\"",
    "     Header: `Perms`",
    "     Options:",
    "       - `Keep current (Recommended)` - Leave the current permission profile unchanged",
    "       - `Standard` - Keep the normal spex-friendly default profile",
    "       - `YOLO` - Favor speed and broader tool freedom for spex flows",
    "       - `None` - Keep confirmations explicit",
    "",
    "2. Then call the tool `spex_update_traits` with:",
    "   - `enable`: selected traits from the enable question",
    "   - `disable`: selected traits from the disable question",
    "   - `permissions`: omit it if the user chose `Keep current`, otherwise map to `standard`, `yolo`, or `none`",
    "",
    "3. If the same trait was selected in both enable and disable, prefer enabling it and mention that duplicate disable entries were ignored.",
    "4. Finally, summarize the updated trait state and permission profile.",
  ].join("\n");
}

export function getTeamPlanDispatchPrompt(argumentsText: string): string {
  return [
    "Use pi-claude-subagent team tools to accelerate planning research for the active feature.",
    "",
    ...getOptionalFocusBlock(argumentsText),
    "Process:",
    "- First verify that `TeamCreate`, `Agent`, `SendMessage`, and `TeamDelete` are available. If they are missing, say that the companion `pi-claude-subagent` extension is not loaded, then fall back to normal single-session planning guidance.",
    "- Locate the active feature under `specs/` and read `spec.md` first. Read `plan.md`, `tasks.md`, `research.md`, or nearby artifacts when they already exist.",
    "- Identify 2-4 independent research topics that would materially improve planning. Prefer codebase mapping, integration points, data-model constraints, testing patterns, and external API or library questions.",
    "- If there is only one meaningful research topic, do not create a team. Continue in the current session and recommend `/speckit.plan`.",
    "- If parallel research is justified:",
    "  1. Create or activate a stable team name derived from the feature.",
    "  2. Spawn named teammates with `Agent` using `team_name`, `name`, `subagent_type: \"Explore\"`, and `run_in_background: true`.",
    "  3. Use read-oriented tool limits when practical. Teammates should explore, not edit.",
    "  4. Give each teammate one clearly bounded topic plus the spec context that explains why the topic matters.",
    "  5. Instruct each teammate to send a concise findings report back to `team-lead` with `SendMessage` when finished.",
    "- Keep the lead responsible for synthesis and final planning decisions. Do not let teammates rewrite the spec or implementation files in this kickoff step.",
    "",
    "End with:",
    "1. the active feature you targeted",
    "2. the team name you used, if any",
    "3. the teammates launched and their research topics",
    "4. whether you fell back to single-session planning",
    "5. the best next command or follow-up step",
  ].join("\n");
}

export function getTeamImplementDispatchPrompt(argumentsText: string): string {
  return [
    "Use pi-claude-subagent team tools to kick off parallel implementation for the active feature.",
    "",
    ...getOptionalFocusBlock(argumentsText),
    "Process:",
    "- First verify that `TeamCreate`, `Agent`, `SendMessage`, and `TeamDelete` are available. If they are missing, say that the companion `pi-claude-subagent` extension is not loaded, then fall back to regular single-session `/speckit.implement` guidance.",
    "- Locate the active feature and read `spec.md`, `plan.md`, and `tasks.md` before deciding whether teammates help.",
    "- Identify independent task groups that can safely move in parallel. Respect dependencies. If the work is mostly sequential or only one small task group exists, do not create a team.",
    "- Prefer 2-4 teammates. Keep each teammate scoped to one bounded workstream instead of scattering individual subtasks randomly.",
    "- If the Claude Todo V2 tools are available (`TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `TaskStop`), use them as the source of truth for kickoff instead of treating them as optional notes:",
    "  1. `TeamCreate` first, so the team name also becomes the shared task list ID.",
    "  2. Translate the implementation workstreams into shared tasks with `TaskCreate`, keeping dependencies explicit with `addBlockedBy` or `addBlocks` where needed.",
    "  3. Spawn the teammates with stable names that match the intended workstreams.",
    "  4. Use `TaskUpdate` to assign each shared task to the matching teammate owner so Claude Todo V2 can wake or resume that teammate immediately.",
    "  5. Use `TaskList` after kickoff to confirm the queue, owners, and blocked relationships look correct.",
    "  6. Mention `TaskStop` as the way to interrupt stuck teammate-backed work cleanly.",
    "- If the Claude Todo V2 tools are NOT available, rely on explicit task IDs or workstream labels in teammate prompts and track progress through `SendMessage` updates.",
    "- If parallel kickoff is justified:",
    "  1. Create or activate a stable team name derived from the feature.",
    "  2. Spawn named teammates with `Agent` using `team_name`, `name`, and `run_in_background: true`.",
    "  3. Give each teammate the exact task IDs or task group, the relevant spec and plan constraints, and a clear blocker/escalation rule.",
    "  4. Tell each teammate to report progress or blockers with `SendMessage` and to avoid silent spec drift. If reality conflicts with the spec, they should report it instead of freelancing.",
    "  5. Keep the lead focused on coordination, synthesis, and final review rather than unrelated coding during kickoff.",
    "- Mention `TeamDelete` when the team should be cleaned up after the work completes, usually after wrap-up and review rather than immediately after kickoff.",
    "",
    "End with:",
    "1. the active feature you targeted",
    "2. the team name you used, if any",
    "3. the teammates launched and their assigned workstreams",
    "4. the shared task list actions you took, if Claude Todo V2 was available",
    "5. any sequential or lead-only work that remains",
    "6. the best follow-up step, such as `TaskList`, `SendMessage`, `/spex-team wrapup`, `/spex-review-code`, or `TeamDelete`",
  ].join("\n");
}

export function getTeamWrapupDispatchPrompt(argumentsText: string): string {
  return [
    "Use the available Spex companion tools to wrap up a teammate-based planning or implementation run.",
    "",
    ...getOptionalFocusBlock(argumentsText),
    "Process:",
    "- First verify that `SendMessage` is available. If it is missing, explain that the companion `pi-claude-subagent` extension is not loaded and fall back to a manual single-session wrap-up summary.",
    "- Locate the active feature and read the relevant artifacts first:",
    "  - planning wrap-up: `spec.md`, `plan.md`, `research.md`, and any planning notes",
    "  - implementation wrap-up: `spec.md`, `plan.md`, `tasks.md`, `implementation.md`, `verification.md`, and any existing review artifacts",
    "- If Claude Todo V2 tools are available (`TaskGet`, `TaskList`, `TaskUpdate`, `TaskStop`), use `TaskList` first to inspect the current shared task state. Treat that task list as the operational truth.",
    "- Determine which of these cases applies:",
    "  1. teammates still running but healthy",
    "  2. teammates blocked and needing escalation",
    "  3. shared tasks mostly complete and ready for review",
    "  4. team work is finished and can be cleaned up",
    "- If teammates are still running or blocked, use `SendMessage` to request concise status reports or blocker details. Prefer targeted follow-ups over vague broadcasts. Use `TaskStop` only when work truly needs to be interrupted and requeued.",
    "- If Claude Todo V2 is available, clean up stale task state as you learn more:",
    "  - mark clearly finished tasks completed with `TaskUpdate`",
    "  - keep blocked work explicit instead of silently waiting",
    "  - create or update a verification-style task when review or validation still needs to happen",
    "- Once the work is sufficiently complete, synthesize a review handoff for the lead:",
    "  - what each teammate finished",
    "  - what remains open",
    "  - what review should focus on",
    "  - whether `/spex-review-code`, `/spex-review-plan`, `/spex-stamp`, or another command is the right next step",
    "- If the swarm is truly done and no more teammate follow-up is needed, mention `TeamDelete` as the final cleanup step. Do not delete the team while active work is still running.",
    "",
    "End with:",
    "1. the active feature you wrapped up",
    "2. the current teammate and task-list status",
    "3. any blockers or unfinished work that still need attention",
    "4. the recommended next review or verification command",
    "5. whether the team is ready for `TeamDelete`",
  ].join("\n");
}

export function getHelpText(config: SpexConfig): string {
  return `# pi-spex-extension\n\nEnabled traits: ${formatEnabledTraits(config)}\nPermission profile: ${config.permissions}\n\n## Bootstrap\n- /spex-init\n- /spex-traits list\n- /spex-traits enable superpowers\n- /spex-traits interactive\n\n## Spec Kit core\n- /speckit.constitution\n- /speckit.specify\n- /speckit.plan\n- /speckit.tasks\n- /speckit.implement\n\n## Spex helpers\n- /spex-brainstorm\n- /spex-review-spec\n- /spex-review-plan\n- /spex-review-code\n- /spex-evolve\n- /spex-stamp\n- /spex-ship\n- /spex-worktree\n- /spex-team plan\n- /spex-team implement\n- /spex-team wrapup\n\n## Trait notes\n- superpowers: stronger quality gates around planning and implementation\n- deep-review: multi-lens review guidance\n- teams: use pi-claude-subagent teammates for parallel research or implementation kickoff, with pi-claude-todo-v2 task tools when available\n- worktrees: feature isolation guidance\n\n## Notes\n- This package depends on an external \`specify\` CLI.\n- /spex-init and /spex-traits interactive both depend on the \`AskUserQuestion\` tool from the \`pi-claude-code-ask-user\` package.\n- Team workflows expect the companion \`pi-claude-subagent\` extension so \`TeamCreate\`, \`Agent\`, \`SendMessage\`, and \`TeamDelete\` are available.\n- Team implementation works best with \`pi-claude-todo-v2\` loaded so \`TaskCreate\`, \`TaskGet\`, \`TaskList\`, \`TaskUpdate\`, and \`TaskStop\` are available as a shared task surface.\n- /spex-ship uses the \`spex_ship_state\` tool for strict stage progression and artifact validation.\n- If new /speckit.* prompts do not appear after bootstrap, run /reload.\n`;
}

export function getTeamHelpText(): string {
  return [
    "# spex team helper",
    "",
    "Supported forms:",
    "- `/spex-team` or `/spex-team help`",
    "- `/spex-team plan [focus]`",
    "- `/spex-team implement [focus]`",
    "- `/spex-team wrapup [focus]`",
    "",
    "Notes:",
    "- Team workflows expect `pi-claude-subagent` so `TeamCreate`, `Agent`, `SendMessage`, and `TeamDelete` are available.",
    "- Implementation kickoff works best with `pi-claude-todo-v2` loaded so shared task tools are available.",
    "- These subcommands are built into `/spex-team`; there are no separate team helper commands to remember.",
  ].join("\n");
}

export function getInitSummary(configPath: string, config: SpexConfig, specifyVersion: string, summary: string): string {
  return [
    "# pi-spex bootstrap complete",
    "",
    `- specify version: ${specifyVersion}`,
    `- config: ${configPath}`,
    `- traits: ${formatEnabledTraits(config)}`,
    `- permissions: ${config.permissions}`,
    "",
    "## Next steps",
    "",
    "1. Run `/reload` if the new `/speckit.*` prompts are not visible yet.",
    "2. Run `/spex-traits enable superpowers` if you want stronger workflow discipline.",
    "3. Start with `/speckit.constitution` or `/speckit.specify`.",
    "",
    "## specify init output",
    "",
    "```text",
    summary || "(no output)",
    "```",
  ].join("\n");
}

export function getTraitsSummary(config: SpexConfig, configPath: string): string {
  return [
    "# pi-spex traits",
    "",
    `- config: ${configPath}`,
    `- enabled traits: ${formatEnabledTraits(config)}`,
    `- permissions: ${config.permissions}`,
    "",
    "## Supported traits",
    "- superpowers",
    "- deep-review",
    "- teams",
    "- worktrees",
  ].join("\n");
}

export function getTraitsUpdateSummary(options: {
  configPath: string;
  enabledTraits: string;
  permissions: string;
  changedEnable: string[];
  changedDisable: string[];
  changedPermissions?: string;
  ignoredDisable: string[];
}): string {
  return [
    "# pi-spex traits updated",
    "",
    `- config: ${options.configPath}`,
    `- enabled traits: ${options.enabledTraits}`,
    `- permissions: ${options.permissions}`,
    "",
    "## Changes applied",
    options.changedEnable.length > 0
      ? `- enabled: ${options.changedEnable.join(", ")}`
      : "- enabled: none",
    options.changedDisable.length > 0
      ? `- disabled: ${options.changedDisable.join(", ")}`
      : "- disabled: none",
    options.changedPermissions
      ? `- permissions changed to: ${options.changedPermissions}`
      : "- permissions changed to: unchanged",
    options.ignoredDisable.length > 0
      ? `- ignored duplicate disable requests: ${options.ignoredDisable.join(", ")}`
      : "- ignored duplicate disable requests: none",
  ].join("\n");
}

export function getWorktreeHelpText(): string {
  return [
    "# spex worktree helper",
    "",
    "Supported forms:",
    "- `/spex-worktree` or `/spex-worktree list`",
    "- `/spex-worktree prune`",
    "- `/spex-worktree add <path> [branch]`",
    "",
    "Examples:",
    "```bash",
    "/spex-worktree list",
    "/spex-worktree add ../my-feature main",
    "/spex-worktree prune",
    "```",
  ].join("\n");
}
