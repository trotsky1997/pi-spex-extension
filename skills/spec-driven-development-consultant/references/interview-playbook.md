# Interview Playbook

Use this reference when deciding what to ask through `AskUserQuestion`.

## Primary Questions

These are the most useful dimensions to identify:

- What state is the user in?
  - rough idea
  - existing spec
  - existing code
  - drift / review problem
- What kind of repo is this?
  - greenfield
  - brownfield feature work
  - legacy modernization
- What does the user want right now?
  - onboarding
  - requirements shaping
  - planning
  - task generation
  - implementation
  - review / reconciliation

## AskUserQuestion Patterns

### Repo / project mode

Use a single-select question when the user’s scenario changes the next command:

- Greenfield (Recommended)
- Existing codebase feature
- Legacy modernization

### Current working state

Use a single-select question when artifacts are missing and intent is unclear:

- Rough idea only
- Spec exists
- Plan/tasks exist
- Implementation / review

### Desired outcome

Use a single-select or multi-select question when the user has multiple priorities:

- Clarity first (Recommended)
- Move fast
- Minimal change
- Reviewability

## Escalation Rules

- If repo state clearly implies the next step, skip the question
- If the user already explicitly says what they need, skip the question
- If two or more plausible next commands exist, ask
- If the user sounds lost or new to SDD, ask more gently and explain the result of each option
