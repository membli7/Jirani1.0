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
- [x] Keep Chairperson-proposed officer assignments with a second-officer confirmation after initial setup; voting is deferred.
- [x] Defer Chat, WhatsApp/SMS broadcasts, Paybill processing/matching, and loan terms outside 1, 2, 3, and 6 months.

## Step 0: setup
- [ ] Commit everything, create branch `review-fixes`
- [ ] Save report as `docs/review.md` and UX plan as `docs/ux-plan.md`
- [ ] Add `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `TASKS.md`

## Step 2: security and server (Codex, one branch each)
- [ ] F-01: PIN policy and login throttling
  - [ ] 6-digit minimum enforced server-side
  - [ ] Front-end form matches
  - [ ] 5 failures per phone and per IP, then 15-minute lock
  - [ ] Legacy 4-digit PINs log in, forced to change
  - [ ] `secure: true` cookie in production, `app.set('trust proxy', 1)`
  - [ ] Tests added, tested by hand, merged
- [ ] F-02: (included in F-01 branch above)
- [ ] F-03: Invitation codes
  - [ ] Attempt cap and single-use
  - [ ] Bound to invited phone
  - [ ] Secretary CAN invite Members directly (no approval needed)
  - [ ] Tests added, tested by hand, merged
- [ ] F-04: Role data scoping — SKIPPED (keeping broad access per decision b)

## Step 3: front-end clarity (Copilot agent mode)
- [ ] Remove stale "Signed out" banner after login
- [ ] Invitation copy says Secretary can invite Members directly
- [ ] Clarify the "4 of 60 members" label
- [x] Paybill callback and reconciliation are out of scope; do not show Paybill status or promise automatic payments.
- [ ] Honest SMS wording ("in-app reminder", "activation code")
- [ ] Cash confirmation: "cash entry, no money transferred"
- [ ] Standardize status labels (Pending, Approved, Rejected, Repaid, Closed)

## Step 2b: Decision — Attendance tracking

Before implementing larger UX work, decide: should attendance tracking be restored and fully tested, or cut to focus on core features?

**Question**: Will pilot chamas use attendance tracking to manage member fines and presence?

- [ ] **YES** — Restore attendance end-to-end with edit audit trail (Priority 2)
- [ ] **NO** — Cut attendance and focus engineering on two fully-tested core features (Priority 2)

**Answer**:  YES

**Rationale for your answer**: (optional notes on why you chose yes/no)

## Step 4: larger UX work (Codex, after steps 2 and 3 are merged)
- [ ] New Chairperson setup checklist
- [x] Vote lifecycle panel deferred; retain officer assignments without voting.
- [ ] Mobile layout
- [ ] Swahili text pass
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
- [ ] Voting
- [ ] Loan terms outside 1, 2, 3, and 6 months
- [ ] SMS invitation delivery (provider not configured)
- [ ] Overdue/default loan actions (recovery, penalty, note)
- [ ] CSRF, concurrency, write-endpoint authorization (not audited)