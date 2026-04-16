import { formatEnabledTraits, type SpexConfig } from "./state.js";

type InitPromptOptions = {
	refresh: boolean;
	update: boolean;
	preselectedTraits: string[];
	preselectedPermissions?: string;
};

export function getInitDispatchPrompt(options: InitPromptOptions): string {
	const prefilledAnswers = Object.entries({
		...(options.preselectedTraits.length > 0
			? {
					"Which spex traits do you want to enable?":
						options.preselectedTraits.join(", "),
				}
			: {}),
		...(options.preselectedPermissions
			? {
					"How should spex commands handle permission prompts?":
						options.preselectedPermissions,
				}
			: {}),
	}).map(
		([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
	);

	return [
		"Initialize spex for this Pi project.",
		"",
		"You MUST use the `AskUserQuestion` tool before bootstrapping unless both answers are already prefilled below.",
		"",
		"1. Ask these questions with `AskUserQuestion`:",
		'   - Question: "Which spex traits do you want to enable?"',
		"     Header: `Traits`",
		"     multiSelect: true",
		"     Options:",
		"       - `superpowers` - Quality gates and stronger workflow discipline around Spec Kit steps",
		"       - `deep-review` - Multi-lens code review guidance with spec compliance emphasis",
		"       - `worktrees` - Git worktree isolation guidance for feature implementation",
		'   - Question: "How should spex commands handle permission prompts?"',
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
					...prefilledAnswers.map((line, index) =>
						index === prefilledAnswers.length - 1 ? line : `${line},`,
					),
					"}",
					"```",
					"",
				]
			: ["2. Wait for the user answers from `AskUserQuestion`.", ""]),
		`3. Then call the tool \`spex_init_project\` with:`,
		`   - \`refresh\`: ${options.refresh ? "true" : "false"}`,
		`   - \`update\`: ${options.update ? "true" : "false"}`,
		"   - `traits`: selected traits as an array of `superpowers`, `deep-review`, `worktrees` (use an empty array if the user wants no traits)",
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
		'   - Question: "Which traits should be enabled after this update?"',
		"     Header: `Enable`",
		"     multiSelect: true",
		"     Options:",
		"       - `superpowers` - Quality gates and stronger workflow discipline around Spec Kit steps",
		"       - `deep-review` - Multi-lens code review guidance with spec compliance emphasis",
		"       - `worktrees` - Git worktree isolation guidance for feature implementation",
		'   - Question: "Which traits should be disabled after this update?"',
		"     Header: `Disable`",
		"     multiSelect: true",
		"     Options:",
		"       - `superpowers` - Remove quality gate guidance and stricter workflow nudges",
		"       - `deep-review` - Remove deeper review guidance",
		"       - `worktrees` - Remove worktree-oriented workflow guidance",
		'   - Question: "Which permission profile should be used after this update?"',
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

export function getHelpText(config: SpexConfig): string {
	return `# pi-spex-extension\n\nEnabled traits: ${formatEnabledTraits(config)}\nPermission profile: ${config.permissions}\n\n## Bootstrap\n- /spex-init\n- /spex-init --traits superpowers,deep-review --permissions standard\n- /spex-traits list\n- /spex-traits enable superpowers\n- /spex-traits interactive\n\n## Spec Kit core\n- /speckit.constitution\n- /speckit.specify\n- /speckit.plan\n- /speckit.tasks\n- /speckit.implement\n\n## Spex helpers\n- /spex-brainstorm\n- /spex-review-spec\n- /spex-review-plan\n- /spex-review-code\n- /spex-evolve\n- /spex-stamp\n- /spex-ship\n- /spex-worktree\n\n## Trait notes\n- superpowers: stronger quality gates around planning and implementation\n- deep-review: multi-lens review guidance\n- worktrees: feature isolation guidance\n\n## Notes\n- This package depends on an external \`specify\` CLI.\n- Interactive /spex-init and /spex-traits use \`AskUserQuestion\`; pi-spex reuses an existing install when present and falls back to its bundled copy when available.\n- If no \`AskUserQuestion\` tool is available, /spex-init also works with \`--traits\` and \`--permissions\`.\n- /spex-ship uses the \`spex_ship_state\` tool for strict stage progression and artifact validation.\n- If new /speckit.* prompts do not appear after bootstrap, run /reload.\n- teams is intentionally deferred in this version.\n`;
}

export function getInitSummary(
	configPath: string,
	config: SpexConfig,
	specifyVersion: string,
	summary: string,
): string {
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

export function getTraitsSummary(
	config: SpexConfig,
	configPath: string,
): string {
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
