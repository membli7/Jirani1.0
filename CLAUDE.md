# Project instructions

## Stack
- Node.js / Express server
- Single-page HTML front end (one large HTML file)
- Roles: Chairperson, Secretary, Treasurer, Member

## Source documents
- Security and QA findings: `docs/review.md` (findings are labelled F-01, F-02, ...)
- UX plan: `docs/ux-plan.md`
- Current work items and decisions: `TASKS.md`

Read only the finding or task you were asked to work on. Do not summarize or act on the whole report.

## Hard rules
1. Do not change the data format or schema. If a change seems to require it, stop and ask.
2. Keep existing accounts working. Old 4-digit PINs must still log in, then be forced to change the PIN.
3. Enforce every rule on the server. Front-end checks are only for user experience.
4. Write or update tests for every behavior change. Run the full test suite before finishing.
5. Make the smallest change that completes the task. No unrelated refactors, renames or formatting changes.
6. Never commit secrets, real phone numbers, or PINs. Do not copy QA account PINs from the report into code, tests or docs.
7. Do not add claims in the UI or copy about M-Pesa, SMS or payment reconciliation unless the feature actually works. Say "in-app reminder" and "activation code", not "SMS", unless SMS is really sent.
8. Business rules come from the decisions recorded in `TASKS.md`. If a decision is blank, ask instead of guessing.

## Workflow
- One task per branch. Do not touch files outside the task's scope.
- Commit after each completed task with a clear message.
- At the end of every task, give a short summary: files changed, behavior changed, tests added, anything left undone or uncertain.
- If something is ambiguous or risky, say so in the summary rather than silently choosing.