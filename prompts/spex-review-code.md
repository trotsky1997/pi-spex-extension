---
description: Review the current implementation against the spec, plan, and task artifacts.
---
Perform a spec-aware code review for the active feature.

Expectations:
- Read the active `spec.md`, `plan.md`, and `tasks.md`
- Review the changed implementation against those artifacts
- Write or update a canonical review artifact at `specs/<active-feature>/review-code.md`
- That file must include this canonical structure:
  - `# Code Review`
  - `## Spec Compliance`
  - `## Findings`
  - `## Test Coverage Notes`
  - `## Residual Risks`
- It must also include these exact metadata lines somewhere in the document:
  - `Compliance Score: <number>%`
  - `Finding Count: <number>`
  - `Residual Risks: none|<summary>`
- Findings must come first, ordered by severity, with concrete file references when possible
- Evaluate at least these lenses:
  - spec compliance
  - correctness
  - architecture / unnecessary complexity
  - security / safety
  - production readiness
  - test quality
- If there are no material findings, say that explicitly and mention any residual testing gaps

Extra focus from user:

```text
$ARGUMENTS
```
