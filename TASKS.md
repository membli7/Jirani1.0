# Tasks

## Decisions (FILLED IN)
- [x] (a) Can a Secretary invite an ordinary Member without Chairperson approval?  
  Answer: **YES — Secretary can invite Members directly**
- [x] (b) Do Secretary and Treasurer both see the full roster and balance, or is access narrowed?  
  Answer: **KEEP BROAD — both see full roster and balance**
- [x] (c) Minimum PIN length  
  Answer: **6 digits**

## Feature scope decision (2026-10-11)
- [x] Keep CSV export: transaction and attendance records, scoped for Member accounts.
- [x] Keep loan requests: 1, 2, 3, and 6 month terms with three role decisions; Secretary substitutes when the borrower is Chairperson or Treasurer. No money is disbursed by the app.
- [x] Use the leadership-election workflow below for officer changes after initial setup; direct assignment remains limited to initial bootstrap.
- [x] Defer Chat, WhatsApp/SMS broadcasts, Paybill processing/matching, and loan terms outside 1, 2, 3, and 6 months.

## Leadership election decisions (2026-10-20)
- Secretary proposes 2-20 active ordinary Members for Chairperson, Secretary, or Treasurer; Chairperson accepts the proposal and manually closes voting.
- All active chama accounts are eligible when voting opens. Ballots are secret and each eligible account may vote once.
- The candidate with the highest vote total wins; no quorum threshold applies. A tie among the highest candidates opens a rematch limited to the tied candidates.
- Chairperson verifies the closed result. The elected role and portal access switch exactly 24 hours after verification.
- No SQL schema change; elections use existing leadership, audit, and message records. Post-bootstrap officer changes must use elections.
## Step 0: setup
- [x] Create branch `review-fixes`; it contains local work that has not been pushed to `origin/review-fixes`.
- [x] Save the security report as `docs/review.md`. The UX plan currently lives at `docs/docs/docs/ux-plan.md` (the earlier `docs/ux-plan.md` path is stale).
- [x] Add `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, and `TASKS.md`.
- [ ] Commit the current local deployment-readiness fixes after verification; do not push as part of local readiness work.

## Step 2: security and server (Codex, one branch each)
- [ ] F-01: PIN policy and login throttling implemented; manual role walkthrough and merge remain in Step 5.
  - [x] 6-digit minimum enforced server-side
  - [x] Front-end form matches
  - [x] 5 failures per phone and per IP, then 15-minute lock
  - [x] Legacy 4-digit PINs log in, forced to change
  - [x] Production session cookie is secure; production trusts only configured private proxy IPs (`TRUSTED_PROXY_IPS`).
  - [x] Regression tests pass in the current full suite; role-by-role manual walkthrough and merge remain in Step 5.
- [x] F-02: included in F-01 branch above.
- [ ] F-03: Invitation code implementation and regression tests pass; manual walkthrough and merge remain in Step 5.
  - [x] Attempt limits and single-use
  - [x] Bound to invited phone
  - [x] Secretary can invite Members directly (no approval needed)
  - [x] Regression tests pass in the current full suite; manual walkthrough and merge remain in Step 5.
- [x] F-04: narrower roster/balance role scoping is intentionally skipped per decision b.

## Step 3: front-end clarity (Copilot agent mode)
- [x] No stale signed-out banner appears after login; notices appear after explicit sign-out or inactivity expiry.
- [x] Invitation copy says the Chairperson or Secretary can invite Members directly.
- [x] The literal "4 of 60 members" label is not present in the current frontend; recheck only if that label returns.
- [x] Paybill callback and reconciliation are out of scope; do not show Paybill status or promise automatic payments.
- [x] Invitation copy says an activation code is sent by SMS only when configured; otherwise share it privately. No in-app reminder delivery is claimed.
- [x] Cash confirmation says it records cash already received and does not transfer money.
- [x] Standardize loan status labels (Pending, Approved, Rejected, Repaid, Closed)

## Step 2b: Decision — Attendance tracking

Attendance tracking scope decision (resolved): restore and test attendance end to end.

**Decision**: Pilot chamas will use attendance tracking to manage member presence and related fines.

- [x] **YES** — Restore attendance end-to-end with edit audit trail (Priority 2); the current attendance integration test passes.
- [ ] **NO** — Cut attendance and focus engineering on two fully-tested core features (Priority 2)

**Answer**: YES; attendance registers and edit auditing are implemented and covered by the current integration suite.
**Rationale for your answer**: (optional notes on why you chose yes/no)

## Step 4: larger UX work (Codex, after steps 2 and 3 are merged)
- [x] New Chairperson setup checklist; completion is derived from active officers and valid invitations, while skip/dismiss state is stored per Chairperson in the browser.
- [x] Leadership election lifecycle and dashboard panel implemented; see decisions dated 2026-10-20.
- [ ] Manual mobile layout review at common phone sizes (responsive navigation and stacked cards are implemented).
- [ ] Kiswahili translation completeness and wording review (language support is implemented).
- [ ] Sample-group demo

## Step 5: review
- [ ] PR per branch, Copilot code review on each
- [ ] Manual walkthrough logged in as each of the four roles

## Step 6: cleanup before real members
- [ ] Delete or reset the 5 QA accounts
- [ ] Remove test loan, fake contribution, vote record, attendance register
- [ ] Confirm the QA PINs are not reused anywhere

## Deferred / not in scope
- [ ] Chat and broadcast delivery via WhatsApp/SMS
- [ ] Paybill callback/matching
- [ ] Loan terms outside 1, 2, 3, and 6 months
- [ ] SMS invitation delivery (provider not configured)
- [ ] Overdue/default loan actions (recovery, penalty, note)
- [x] CSRF/origin protections, write serialization, and route authorization received source review and regression coverage; deployment proxy boundaries remain unverified.
