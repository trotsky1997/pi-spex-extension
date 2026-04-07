---
description: Run a final readiness gate for the active feature before calling it done.
---
Run a final readiness gate for the active feature.

Expectations:
- Check git status and summarize the working tree
- Check whether tests/build/verification steps were run, and what still needs validation
- Cross-check the current implementation against `spec.md`, `plan.md`, and `tasks.md`
- Write or update a canonical final gate artifact at `specs/<active-feature>/stamp.md`
- That file must include at least:
  - `# Final Stamp`
  - a line starting with `Final Recommendation:`
- Report blockers first, then warnings, then final recommendation
- Final recommendation must be one of:
  - ready
  - ready with minor follow-up
  - not ready

Extra focus:

```text
$ARGUMENTS
```
