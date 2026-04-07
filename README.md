# pi-spex-extension

Spec Kit plus spex-inspired workflow helpers for Pi.

This package is a Pi-native bridge between:
- Spec Kit's `/speckit.*` spec-driven workflow
- cc-spex's review, evolve, trait, and ship ideas

## Scope of v0.1.0

This first version intentionally keeps the architecture simple:
- depends on an installed external `specify` CLI
- bootstraps Spec Kit for Pi with `/spex-init`
- stores trait state in `.specify/spex-traits.json`
- exposes Pi-friendly hyphenated helper commands like `/spex-init` and `/spex-review-code`
- defers `teams` to a later version

## Install

Local install from this workspace:

```bash
pi install -l /home/aka/pi-playground/pi-spex-extension
```

Quick-load without installing:

```bash
pi -e /home/aka/pi-playground/pi-spex-extension/extensions/spex/index.ts
```

For local path usage, run `npm install` in `pi-spex-extension/` once so the bundled `pi-claude-code-ask-user` dependency is present under `node_modules/` and Pi can auto-load its `AskUserQuestion` extension. Remote installs from git/npm should pick this dependency up automatically.

Standalone companion install (optional if the bundled dependency is present):

```bash
pi install -l /home/aka/pi-playground/pi-claude-code-ask-user
```

## Prerequisite

Install Spec Kit's `specify` CLI first:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
```

`/spex-init` reuses the existing `AskUserQuestion` tool from `pi-claude-code-ask-user` for interactive trait and permission selection. It does not implement a separate custom interview UI.


## Consultant Skill

This package now also ships an on-demand consultant skill:

- `/skill:spec-driven-development-consultant`

Use it when the user is unsure how to apply spec-driven development in the current repo. The skill diagnoses repo state, uses `AskUserQuestion` for interview-style discovery when needed, and steers the user toward the correct `/spex-*` or `/speckit.*` next step.

## Commands

Runtime commands provided by the extension:
- `/spex-init`
- `/spex-traits`
- `/spex-help`
- `/spex-worktree`
- `/spex-ship`
  - also supports `status`, `cleanup`, `--resume`, `--start-from <stage>`, and `--ask <always|smart|never>`

Interactive trait update example:

```text
/spex-traits interactive
```

Prompt-based workflow helpers bundled with the package:
- `/spex-brainstorm`
- `/spex-review-spec`
- `/spex-review-plan`
- `/spex-review-code`
- `/spex-evolve`
- `/spex-stamp`

After `/spex-init`, Spec Kit's own Pi prompts should also be available:
- `/speckit.constitution`
- `/speckit.specify`
- `/speckit.plan`
- `/speckit.tasks`
- `/speckit.implement`

## Trait model

Supported v1 traits:
- `superpowers`
- `deep-review`
- `worktrees`

Trait state lives in:

- `.specify/spex-traits.json`

The extension injects hidden turn context for Spec Kit / spex work based on the enabled traits. It does not patch `.claude/skills` or rewrite upstream prompt files.

## Review artifacts used by `/spex-ship`

Core pipeline stages also have canonical output contracts:

- `spec.md`
- `clarify.md`
- `plan.md`
- `tasks.md`
- `implementation.md`
- `verification.md`

Later ship stages validate canonical review artifacts in the active feature directory:

- `review-spec.md`
- `review-plan.md`
- `review-code.md`
- `stamp.md`

The helper prompts `/spex-review-spec`, `/spex-review-plan`, `/spex-review-code`, and `/spex-stamp` are expected to create or update these files with canonical schemas.

Examples of required structured metadata:

- `review-spec.md`
  - `Verdict: approved|revise|required-clarification`
  - `Finding Count: <number>`
  - `Residual Risks: none|<summary>`
- `review-plan.md`
  - `Coverage Status: full|partial|insufficient`
  - `Finding Count: <number>`
  - `Residual Risks: none|<summary>`
- `review-code.md`
  - `Compliance Score: <number>%`
  - `Finding Count: <number>`
  - `Residual Risks: none|<summary>`

## Typical flow

1. Run `/spex-init`
2. Run `/reload` if Pi does not immediately show the new `/speckit.*` prompts
3. Optionally enable traits with `/spex-traits enable superpowers`
4. Use `/speckit.constitution`, `/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`
5. Use `/spex-review-spec`, `/spex-review-plan`, `/spex-review-code`, `/spex-evolve`, and `/spex-stamp` around the core flow
6. Use `/spex-ship` for the stateful end-to-end pipeline when `superpowers` and `deep-review` are enabled

## Notes

- `teams` is intentionally deferred in this package version.
- `/spex-ship` is now an extension-backed stateful pipeline command. It persists `.specify/.spex-ship-phase.json` and supports resume / advance / pause / fail / cleanup via the `spex_ship_state` tool.
- `spex_ship_state advance` performs stage-aware artifact validation before allowing the pipeline to move forward.
- The ship pipeline will refuse unsafe transitions such as advancing while paused/failed, creating a second active pipeline, or starting later stages without required spec artifacts.
- `/spex-ship --resume` now distinguishes running, paused, failed, and completed pipelines, emits recovery instructions, and actively restores paused pipelines to `running` before resuming the current stage.
