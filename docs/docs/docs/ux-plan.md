# Jirani Chama: UX and Market Positioning Plan

Prepared: 10 October 2026

## Product direction

Position Jirani Chama as a role-based workspace for chama administration: members, contributions, loans, attendance, governance. Strongest distinction: visible governance trail, meeting records, and leadership decisions — not automated payments.

## Security and governance baseline (verify before launch)

Before implementing any UX changes, confirm these policy decisions with stakeholders:

### Priority 1: Officer permissions and data scope

**Finding from review**: The Chairperson, Secretary, and Treasurer all see group-wide roster and balance data. All three officer roles have member-management and leadership permissions.

**Required decision**: Does this match your intended governance policy?
- If yes: document it and proceed.
- If no: the fix requires server-side permission changes, not just UI edits. Add to backend readiness before UX launch.

**Specific questions to answer**:
- Should Secretary and Treasurer both see the full member roster and group balance, or should access be narrowed?
- Which roles should be able to invite new members?
- Which roles should be able to manage leadership roles?

### Priority 2: Invitation policy — Secretary invitations

**Finding from review**: A test showed a Secretary-created ordinary Member invitation generated an activation code immediately, without Chairperson approval.

**Required decision**: Is this the intended behavior?
- If yes ("Secretary can invite Members directly"): update UI copy and document it.
- If no ("All Secretary invitations require Chairperson approval"): implement server-side approval gate, not just UI copy change.

**Important**: Changing the wording alone will not enforce a rule. The server behavior and UI copy must agree.

### Priority 3: Authentication hardening (separate from UX scope)

This plan focuses on browser-visible UX changes. **Security hardening is separate work**:
- **F-01**: PIN policy (minimum 6 digits, login throttling) — backend implementation
- **F-02**: Session cookie Secure flag and proxy configuration — backend implementation  
- **F-03**: Invitation-code rate limiting and single-use prevention — **not verified in review**; requires backend implementation and testing

Schedule these as pre-launch security work, in parallel with UX changes if possible.

---

## **UX changes: Priority 1 (trust and clarity)**

These changes assume security decisions (above) are confirmed.

### 1. Fix invitation policy and UI copy

**Current state**: UI says Secretary invitations need Chairperson approval. Tested behavior contradicts this for ordinary Member invitations.

**Fix**: Once you confirm the intended policy:
- **If Secretary can invite Members directly**: Rewrite the invitation form to say "Member invitation created. Share the activation code securely; it expires after 24 hours."
- **If all Secretary invitations require approval**: Document this, ensure the server enforces it (backend work), and update copy to say "Waiting for Chairperson approval before code is sent."
- Make the text different for each role (Member, Secretary, Treasurer, Chairperson invitations may have different approval paths).

### 2. Remove stale "Signed out" banner

**Current state**: "Signed out" message appears on the dashboard after successful sign-in.

**Fix**: Remove it from the dashboard. Keep it only on the sign-in screen where it is relevant.

### 3. Clarify member counts

**Current state**: Label says "4 of 60 members" without context.

**Fix**: Add one sentence explaining the count. For example: "4 of 60 member seats filled. Chairperson is not included in this count." (Verify the exact calculation rule in your code first.)

### 4. Honest payment and notification wording

**Current state**: Copy says "SMS will be sent" or "payment sent" in cases where SMS is not configured or only a ledger entry is made.

**Fix**:
- For activation codes: say "activation code" (not "SMS")
- For in-app reminders: say "in-app reminder" (not "SMS")
- For cash entries: say "cash entry, no money transferred" (not "payment sent")
- Do not promise SMS or payment features unless they are configured and working

### 5. Clarify Paybill reconciliation status

**Current state**: Status card may imply all payments are reconciled when no data is present.

**Fix**: Use exact language: "No unmatched Paybill payments currently shown."
- Do not show a green "all matched" indicator if there are no incoming Paybill records to match.
- This describes the visible state, not a promise that payment processing is complete.

### 6. Standardize status labels

**Current state**: Status labels vary across screens (Pending, Awaiting, In progress, Approved, etc.).

**Fix**: Choose one set and use it consistently everywhere:
- **Pending** — awaiting action or approval
- **Approved** — approved by required decision-maker(s)
- **Rejected** — rejected by a decision-maker
- **Repaid** — loan or obligation fulfilled
- **Closed** — completed and archived

Replace all variations with these five labels.

---

## **UX changes: Priority 2 (role-specific dashboards)**

### Chairperson

1. **First sign-in**: Show a "Set up your chama" checklist
   - Invite the Secretary
   - Invite the Treasurer
   - Add ordinary Members
   - Review the Overview
   - Each item shows completion status and links to the relevant control
   - User can skip items and dismiss the checklist

2. **Overview and pending work**
   - Highlight pending approvals (loans, invitations) and votes
   - Show balance, this month's contributions, outstanding loans with clear explanations
   - For votes: show the question, voting deadline (EAT), current tally, eligible voter count, quorum threshold, and effective date (when the result takes effect)
   - For loan approvals: show requester, amount, term, required decision, and reason field; note that each configured approver must decide and the borrower cannot approve their own request
   - Use consistent date/time format and label as Nairobi time (EAT)

3. **Invitations and membership**
   - Invitation screen shows: Who is being invited? What role? Does this role need approval? How will the code reach them?
   - Text changes based on the role selected and the approval policy you confirm in Priority 1
   - Confirmation after creation: show invitee, role, expiry, and next step
   - Avoid presenting the activation code as if it were a delivered text message

### Secretary

1. **Member register**
   - Keep search and CSV export prominent
   - Add helper line: "4 of 60 member seats filled. Chairperson is not included in this count." (exact rule verified)
   - Invitation status scannable: Active, Awaiting activation, Expired
   - CSV label: "Member register CSV — includes phone numbers and role/status"
   - Consistent phone-number masking (if used) across all role views

2. **Attendance register**
   - Meeting date clearly displayed
   - Quick actions: Mark all present, Mark all absent (with individual changes easy to make)
   - Show live count: "4 present · 1 absent · 5 members"
   - Save button beside the count; confirm only if overwriting an existing register
   - After saving: show recorded time and editor
   - Edit history viewable, with clear attribution and timestamps
   - For other roles: mark history as read-only

### Treasurer

1. **Cash payments**
   - Keep confirmation dialog: member, KES amount, payment type, note
   - Add line: "This records a cash entry in the group ledger. It does not send or transfer money."
   - After saving: show receipt with date, member, type, amount, link to transaction
   - Transactions page: filters for date range, member, contribution/repayment/fine, cash versus recorded source
   - Export label: "Export transactions for this view" (not implying all data)

2. **Loans and repayment**
   - Separate user's own loan from group loan administration
   - Show loan progress: "2 of 3 required approvals complete — waiting for Member"
   - Status trail: Requested → Waiting for decisions → Approved → Repaid
   - If a loan has overdue, penalty, or recovery state, show reason and next available action
   - Empty state: "No overdue loans need follow-up"

3. **Paybill reconciliation**
   - Status card: "No unmatched Paybill payments currently shown"
   - Distinguish "Payment matching not configured" from "No unmatched records present" if those states exist
   - Do not show a green success state merely because there are no incoming records

### Member

1. **Personal dashboard**
   - Focus on own contribution history, own loan status, current notices, next relevant action
   - Do not show group balance or full roster
   - Make it visually clear these are personal records only

2. **Loan request**
   - Explain available term choices before submission
   - Show confirmation: "Loan request submitted. Your request is waiting for approval."
   - After submission: show progress ("2 of 3 approvers have decided") without exposing private officer notes or other Members' requests
   - If rejected: show the reason provided for that decision (if intended for the borrower)

3. **Meetings and votes**
   - **Meetings**: View-only access to meeting history and own attendance record (label as "View-only")
   - **Votes**: Show question, role being changed (if applicable), eligible voter count, voting deadline (EAT), current tally if vote is open, whether this Member has already voted, and the effective date (when result takes effect)
   - Clarify outcomes: "Passed" (yes votes ≥ quorum) or "Not passed" (no votes or quorum not met)
   - Distinguish "Vote recorded" (your action) from "Vote passed" (outcome)

4. **Notifications**
   - Clear unread state
   - Single "Mark as read" action per notification
   - If in-app only: say so explicitly ("In-app reminder")
   - Do not imply SMS delivery unless SMS was actually sent

---

## **UX changes: Priority 3 (mobile and presentation)**

1. **Mobile layout**
   - Test all main workflows at 375px width
   - Full-width buttons, stacked tables (avoid horizontal scroll)
   - Member names and status readable without side-scroll
   - Check keyboard focus, button labels, contrast

2. **Kiswahili language audit**
   - Review all visible labels, confirmations, empty states, error messages, date labels, CSV headers
   - Translate or mark as "English only"
   - Until complete, describe support as "English and selected Kiswahili interface text" (not "fully bilingual")

3. **Sample demo**
   - Add `/demo` path showing read-only views of all four roles
   - Use clearly fictional data (past dates, "Demo Member 1", KES 999)
   - Show one attendance register, one loan approval trail, one vote, one transaction export
   - Do not imply payments or SMS are live

---

## **Market positioning: what to claim**

**Do claim** (tested and evidenced):
- Role-based workflows with clear separation of duties
- Attendance register with creation timestamp and edit attribution
- Multi-role loan approval trail with decision progress visible
- Leadership voting and role restoration recorded
- CSV exports scoped to user permissions
- In-app notifications and meeting records

**Do not claim**:
- Live M-Pesa, SMS, or automatic reconciliation (unless actually configured and verified)
- That competitors lack attendance, governance, or exports (just show Jirani's screens)
- "Fully bilingual" (until Kiswahili translation is complete)
- Payment reconciliation as working (until Paybill callback is tested)

**Competitor context** (for reference, not as commitments):
- Chamasoft: Free plan and paid options (prices shown on vendor page at review time; verify current terms)
- MyChama.app: Offers member dashboards, loans, role-based administration
- OneKitty: Emphasizes contribution collection and reminders
- ChamaTek: Focused on contributions, loans, and repayment schedules
- Stanbic Chama, Equity EazzyChama: Bank-led alternatives with account and funding features

Jirani's niche is lightweight operations and transparent governance, not banking or payment collection.

---

## **Implementation order**

1. **Confirm Priority 1 decisions** (officer permissions, Secretary invitation policy)
2. **Remove "Signed out" banner** and fix invitation copy per policy
3. **Standardize status labels** across all screens
4. **Clarify member counts, Paybill status, payment wording** per Priority 1 fixes
5. **Implement role-specific dashboards** (Chairperson checklist, Secretary register, Treasurer ledger, Member personal view)
6. **Mobile layout pass**
7. **Kiswahili audit and translation**
8. **Sample demo**
9. **Test thoroughly** by walking through each role's workflows
10. **Clean up QA data** before real member onboarding

---

## **Scope clarification**

This plan addresses **browser-visible UX changes**: wording, page structure, form guidance, confirmations, empty states, responsive design, and navigation.

It **does not propose**:
- New API or database schema changes
- Payment provider or SMS provider integrations
- New authentication methods
- Backend permission restructuring (if needed, that is separate security work)

If Priority 1 decisions require backend changes (e.g., enforcing Chairperson approval for Secretary invitations server-side, narrowing officer data scope), those are pre-launch readiness items, tracked separately from this UX plan.