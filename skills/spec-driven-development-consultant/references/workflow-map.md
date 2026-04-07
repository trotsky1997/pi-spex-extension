# Workflow Map

Use this reference when the user needs a concise explanation of how Spec-Driven Development works in practice.

## Phase Map

### 1. Bootstrap

Use `/spex-init` when the repository has not yet been prepared for the workflow.

### 2. Constitution

Use `/speckit.constitution` to establish project-wide principles if the repository lacks a governing ruleset.

### 3. Specify

Use one of:

- `/spex-brainstorm` when the user has a rough idea and needs requirements discovery
- `/speckit.specify` when the user already has a reasonably clear feature idea
- `/speckit.clarify` when the spec exists but still contains important ambiguity

### 4. Plan

Use `/speckit.plan` to turn the approved spec into a technical approach.

Use `/spex-review-spec` before that if the spec seems incomplete or risky.

### 5. Tasks

Use `/speckit.tasks` to derive an execution plan from the implementation plan.

Use `/spex-review-plan` if the plan likely needs scrutiny before decomposition.

### 6. Implement

Use `/speckit.implement` for execution against the existing artifacts.

Use `/spex-ship` if the user explicitly wants the more stateful spex pipeline and the repo is ready.

### 7. Review and Reconcile

Use:

- `/spex-review-code` for spec-aware code review
- `/spex-evolve` for code/spec drift reconciliation
- `/spex-stamp` for final readiness evaluation

## Scenarios

### Greenfield

Typical path:

1. `/spex-init`
2. `/speckit.constitution`
3. `/spex-brainstorm` or `/speckit.specify`
4. `/speckit.plan`
5. `/speckit.tasks`
6. `/speckit.implement`
7. review/stamp commands as needed

### Brownfield Feature Work

Typical path:

1. `/spex-init` if needed
2. `/speckit.specify`
3. `/spex-review-spec` if the integration is risky
4. `/speckit.plan`
5. `/spex-review-plan` if architecture fit matters
6. `/speckit.tasks`
7. `/speckit.implement`
8. `/spex-review-code` and `/spex-evolve` as needed

### Drift / Recovery

Typical path:

1. inspect current artifacts
2. `/spex-review-code`
3. `/spex-evolve`
4. `/spex-stamp`
