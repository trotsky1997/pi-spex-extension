---
description: Review the current Spec Kit feature spec for clarity, completeness, and implementability.
---
Review the current feature specification in this repository.

Expectations:
- Locate the active feature spec under `specs/`
- Read any available constitution in `.specify/memory/constitution.md`
- Write or update a canonical review artifact at `specs/<active-feature>/review-spec.md`
- That file must include this canonical structure:
  - `# Spec Review`
  - `## Verdict`
  - `## Findings`
  - `## Remediation Checklist`
  - `## Residual Risks`
- It must also include these exact metadata lines somewhere in the document:
  - `Verdict: approved|revise|required-clarification`
  - `Finding Count: <number>`
  - `Residual Risks: none|<summary>`
- Evaluate the spec for:
  - missing or ambiguous requirements
  - scope leaks and implementation detail leakage
  - weak success criteria
  - missing edge cases
  - inconsistency with the constitution
- Present findings first, ordered by severity
- Then provide a short remediation checklist
- If the spec is already strong, say so explicitly and note only residual risks

Extra focus from user:

```text
$ARGUMENTS
```
