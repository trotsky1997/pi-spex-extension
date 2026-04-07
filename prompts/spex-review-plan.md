---
description: Review the current Spec Kit implementation plan and tasks for feasibility and coverage.
---
Review the current Spec Kit implementation plan.

Expectations:
- Locate the active feature plan under `specs/`
- Read `spec.md`, `plan.md`, and `tasks.md` when present
- Write or update a canonical review artifact at `specs/<active-feature>/review-plan.md`
- That file must include this canonical structure:
  - `# Plan Review`
  - `## Coverage Summary`
  - `## Findings`
  - `## Gap-Closure Checklist`
  - `## Residual Risks`
- It must also include these exact metadata lines somewhere in the document:
  - `Coverage Status: full|partial|insufficient`
  - `Finding Count: <number>`
  - `Residual Risks: none|<summary>`
- Check whether the plan and task breakdown cover the specification completely
- Call out:
  - missing work
  - weak sequencing
  - unclear ownership or file targets
  - risky assumptions
  - over-engineering
- Present findings first, then a concise gap-closure checklist
- If the plan looks solid, say so explicitly and mention any remaining verification risks

Extra focus from user:

```text
$ARGUMENTS
```
