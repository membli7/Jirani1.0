# Jirani Chama: How the Website Works

Version 1.2 (draft) · 2026-10-19 · Currency KES · Timezone Africa/Nairobi

This document describes what a user sees and does on the Jirani Chama website, page by page, and what the server does in response.

**Labels:** **Decided** = from the product owner's notes. **Proposed** = recommended default, needs confirmation. **Open** = needs a decision or a source before it is built. Legal questions are out of scope here and are tracked separately.

### Changes from version 1.1
- Fixed two stale cross-references: Ledger (§3.7) and My Position (§3.8) pointed at §3.16 for exports and statements; the correct section, after Dissolution was inserted as §3.13, is §3.17.
- Added a decision timeframe for welfare claims (§3.11) — v1.1 left claimants with no stated window for an answer.
- Specified the loan rounding rule (§3.10) — v1.1 named it as a heading with no mechanism under it.

---

## 1. What the website is

Jirani Chama is a website where a savings group keeps its shared records: members, contributions, penalties, loans, welfare, attendance, meetings and share-outs. Every member can see the group ledger and their own position.

The website does not move money. The group pays and receives money through M-Pesa, a bank or cash. The website records each payment, who approved it, and whether the records match the provider's records where a provider is connected.

---

## 2. Users and what they see

| User | Sees | Does |
|---|---|---|
| Chairperson | Everything, including audit log | Approves cash-outs, reversals, waivers, dividend commits; decides loans; proposes officer changes |
| Secretary | Full roster, attendance, audit log | Invites members; records attendance and minutes; assesses penalties; decides loans and welfare claims |
| Treasurer | Full roster, cash book | Records contributions and cash; requests reversals; records loan disbursements and repayments; previews share-outs |
| Member | Group ledger, roster names and status, own position | Requests loans; consents to guarantees; submits welfare claims; uses group chat |

**Decided:** the Secretary and Treasurer see the full roster and group balance.
**Proposed:** every member sees roster names, join dates and status; only officers see phone numbers and emails.
**Open:** the officer set. The app implements Chairperson, Secretary and Treasurer as required signatories. Any further officials (for example a Vice Chairperson) are set by each group's constitution and are not in v1 (see Section 8).

A user who belongs to more than one chama picks one at sign-in. Their role is set separately in each chama.

---

## 3. Pages and navigation

Navigation shows only the items the user's role allows. Hidden items are still checked by the server on every request.

**Main menu**

- Dashboard
- Ledger
- My position
- Record cash (Treasurer only)
- Loans
- Welfare
- Members
- Attendance and meetings
- Reports and exports
- Administration (Chairperson and Secretary)
- Group chat
- Sign out

The Merry-go-round and Welfare pages appear only if the chama has enabled those modules.

### 3.1 Landing page (public)
- Short description, links to How it works, Security, FAQ and Contact.
- Buttons: **Set up a new chama** and **Sign in**.
- English and Kiswahili switch.

### 3.2 Setup (first use only)
Shown only when no chama exists. Once setup completes, this page closes permanently.

Fields:
- Chama name
- Chama type: Merry-go-round, Investment/table banking, Welfare, or Combination
- Cycle length in months
- Registration status: Registered (with registration number) or Not registered
- Chairperson full name
- Phone number (normalised to 254XXXXXXXXX)
- Email
- PIN (6 to 12 digits, entered twice)
- Privacy notice, with a checkbox to accept

On submit, the server creates the chama and the Chairperson account together. If either fails, neither is saved. The Chairperson is signed in and taken to the Dashboard with a prompt to invite officers.

### 3.3 Sign-in
- Fields: phone number, PIN.
- **Forgot PIN** link.
- After a correct PIN, the user picks a chama (if they belong to more than one).
- After 5 wrong PINs for a phone number, or 5 from one IP, sign-in locks for 15 minutes. The page shows the time remaining.
- A user with a legacy 4-digit PIN is taken to a screen that requires a new 6–12 digit PIN. No other page loads until it is changed.
- Session timeout: 30 minutes of inactivity (current value). **Open:** the appropriate timeout for a financial app has not been verified against a source and may need to be shorter for roles that can move money (see Section 9, item 6).

### 3.4 Forgot PIN
1. User enters phone number or email.
2. A 6-digit code is sent, valid for 10 minutes, with a limited number of tries.
3. User enters the code, then a new PIN.
4. The page never says whether a phone or email is registered.
5. If no SMS or email provider is set up, the page says "Recovery is not available right now" and tells the user to contact the Secretary.

**Proposed: officer-assisted PIN reset.**
- The Chairperson or Secretary resets a member's PIN only after confirming in person that the person is the member. The officer records that the check was done. The reset is in the audit log.
- The temporary PIN expires after 24 hours and must be changed at first sign-in.
- The officer cannot reset their own PIN this way. The Chairperson resets the Secretary's and Treasurer's PINs, and vice versa for the Chairperson.

### 3.5 Invitation and activation

**Inviting (Chairperson or Secretary):**
1. Enter name, phone number and role. Secretaries can only invite ordinary members.
2. The system creates an invitation with a random one-time code. The code is shown once and never again.
3. The inviter gets a shareable link and can copy the code.
4. The invitation shows its status: Created, Delivered (only if a provider confirmed it), Activated, Expired, or Revoked.
5. The Chairperson can revoke any pending invitation. Revocation takes effect at once.

**Activating (invitee):**
1. Opens the link or the activation page.
2. Enters phone number, the code, and a new PIN.
3. Wrong code: shows the number of tries left. After 3 wrong codes, that invitation is locked. Only that invitation is affected.
4. Codes expire after **24 hours (Decided)**. An expired code shows "This invitation has expired. Ask the person who invited you for a new one."
5. On success, the member is signed in.

### 3.6 Dashboard
Shows, in order:
- Greeting with name, role and chama name
- Connection status (Online, or Offline with retry)
- Notices from officers
- Unread messages count
- Cards: My balance (contributions, share capital, penalties, loans owed); Group totals (contributions this cycle, welfare balance, loans outstanding); Items needing action (for officers: pending approvals and decisions)

Each number shows its "as of" time. If data cannot be loaded, the card shows "Unavailable", not zero.

### 3.7 Ledger
- One table of every posting: date, type, member, amount in, amount out, reference, status.
- Filters: member, category, date range, cycle.
- Status labels: Posted, Pending approval, Reversed.
- Export to CSV (see 3.17).
- Clicking a row opens its detail: the entry, who recorded it, who approved it, and any reversal.
- Members see all rows. Welfare claim reasons are not shown; only category totals.

### 3.8 My position
A personal page answering "where do I stand?":
- Contributions this cycle, and any arrears
- Share capital
- Penalties unpaid
- Loans: active, with balance and next due date; and repaid
- Guarantees I have given: amount locked, and the loan it backs
- Guarantee capacity: share capital, less pledges, less my own active loans
- Welfare: contributions, and any claims in progress
- Statement of account (see 3.17)

### 3.9 Record cash (Treasurer only)

**Recording a contribution:**
1. Choose member.
2. Enter amount, date (today or earlier, not in the future), payment type (cash, M-Pesa code, other), reference, note.
3. The screen shows the allocation before saving:
   - Outstanding penalties first
   - Welfare fee if this is the member's first payment this calendar month
   - Remainder to share capital
   - Any shortfall, shown as arrears
4. Treasurer confirms. The system returns a receipt number to show the member.
5. If the network drops after confirming, retrying does not create a duplicate. The same request is recognised.

**Recording a cash-out:**
1. Category: Finance, Expenses, Loan disbursement, Fine refund, Welfare payout or Investment.
2. Amount, date (up to 30 days back, not future), reason (required), payee.
3. Saved as **Pending approval**. It does not change balances until the Chairperson approves.
4. Cash-outs above a limit set in the chama's Rules need a second factor for approval (see 6).

**Recording a loan disbursement:** the Treasurer enters the date, method and the M-Pesa or bank reference. The borrower then confirms receipt.

**Recording a repayment:** the Treasurer chooses the loan and enters the amount. The screen shows how it will be split between interest and principal before saving.

**Reversing an entry:** the Treasurer requests the reversal with a reason. The Chairperson approves it. The original entry stays visible, linked to the reversing entry. Reversals that would break a later repayment are refused with the reason shown.

**Payments from M-Pesa (only if a Daraja connection is enabled for the chama):**
- Contributions can be paid with an STK push from the member's phone, or by paying the chama's Paybill or Till. Each payment is matched by its account reference and receipt number, and posted only once.
- Amount matches the request: posted automatically to the member's account.
- Amount differs from the request, or no matching member: held in a **Review queue**. The Treasurer decides. Nothing is posted automatically.
- Without a Daraja connection, all payments are recorded manually and the Review queue is not shown.

### 3.10 Loans

**Requesting a loan (any member, including the Chairperson):**
1. Enter amount and term (1, 2, 3 or 6 months).
2. The page shows the maximum allowed (3 × share capital, less existing loans) and the amount remaining.
3. Choose two guarantors from active members, not including yourself. The page shows each guarantor's remaining capacity.
4. The page shows the loan's terms, which the chama's Rules fix for every loan:
   - Interest method: set by the chama Rules (flat or reducing). **Proposed:** reducing balance. **Open:** the group chooses.
   - Rate: as set by the Rules. **Proposed:** 5% per month.
   - Total interest and total repayable
   - Installment schedule with due dates
   - Rounding rule: each installment's interest and principal split is rounded to the nearest shilling. Any rounding difference across the schedule is carried to the final installment, so the sum of all installments always equals the total repayable exactly — no shilling is lost or invented to rounding.
5. Submit. The borrower cannot choose the interest method for a loan.

**Guarantor rules:**
- A guarantor's total pledges across all their active loans cannot exceed their share capital that is not already pledged.
- A guarantor sees the request and must accept or decline. Accepting locks the guaranteed amount. Declining cancels the request, and the borrower is told which guarantor declined.
- A person who is a guarantor on a loan cannot decide that loan. A person who is the borrower cannot decide it either.

**Loan approval workflow [Product decision]:**

The Chairperson selects one of two approval models during chama setup:

- **Two-approver model (default):** Chairperson and Treasurer.
- **Three-approver model:** Chairperson, Treasurer, and one designated Member selected in advance.

A majority decision applies. The borrower and any guarantor must not approve a loan in which they have a conflict of interest. The Secretary substitutes for a conflicted approver only when the Secretary is eligible and not conflicted. The system must prevent the borrower from approving their own loan.

Only the borrower, relevant guarantors, and authorized decision-makers may access an individual loan application and its decision details. Every decision must record the decision-maker, timestamp, decision, and reason. Approval settings and substitutions must be audited and versioned.

**[Open]** The tie or disagreement rule for the two-approver model must be finalized before implementation. The real-world survey of chama loan-approval practices remains pending.

**Loan status** (shown on the loan page and in My position):
Requested → Awaiting guarantors → Awaiting decisions → Approved → Disbursed → Repaying → Overdue → Repaid. Rejected and Cancelled are end states.

**Loan page** shows: the approval trail, the schedule with paid and unpaid installments, the running balance, and a printable statement.

### 3.11 Welfare
- Shows the welfare fund balance to all members.
- **Submit a claim:** choose category, amount requested, date, description, and optional proof reference.
- **Decide a claim (Chairperson or Secretary, not the claimant):** approve (amount can be changed, with reason) or reject (reason required), within **7 days of submission (Proposed)**. If 7 days pass with no decision, the claim appears in the Officer cockpit (§3.17) as overdue, so the claimant isn't left without a timeline.
- If the approved amount is more than the fund balance, the page refuses and offers three options: partial payout, special levy, or defer. The choice is recorded.
- A paid claim creates a welfare cash-out, linked to the claim.

### 3.12 Members
- Roster list: name, join date, role, status. Contact details are visible to officers only.
- Member states: Active, Dormant (with return date), Exited, Removed (with reason), Deceased.
- **Exit:**
  1. The member requests exit, and the Rules' notice period applies.
  2. The system lists everything owed to and by the member: unpaid penalties, loan balances, guarantees the member has given (these must be released or replaced first), and any welfare owed.
  3. The Chairperson records the exit decision.
  4. The settlement is calculated: share capital, less amounts owed to the group. The result is paid out, or the balance is carried as a claim on the group, as the Rules state.
  5. The payout is a cash-out, approved as usual. The member's status changes to Exited only when the payout is recorded.
- Removal requires a reason and a minutes reference. The same settlement steps apply.
- Officer changes: the Chairperson proposes a change. A different officer confirms it. The person being appointed cannot confirm their own appointment. The page shows proposer, confirmer and date.

### 3.13 Dissolution (Open)
The app supports a controlled wind-down, not a single button.
1. The group resolves to dissolve, and the Secretary records the resolution with its date.
2. The app stops new loans and new contributions, and shows the remaining balances.
3. Outstanding loans are collected, or written off with a recorded decision.
4. Assets are distributed as the constitution says, through approved cash-outs.
5. The Secretary records the final statement and closes the chama.
6. Closed records stay readable by the Chairperson and Secretary, and are kept under the retention rule in Section 6.

**Open:** the distribution rule, and any filing with the Registrar of Societies if the chama is registered.

### 3.14 Attendance and meetings
- Create a meeting: date, agenda.
- Record attendance for each active member: Present, Absent, Excused, Late. Bulk actions available.
- Minutes: write, then publish. Published minutes cannot be edited. A correction is a new version that refers to the old one.
- Changing attendance after saving needs a reason and is logged.
- Attendance never creates a penalty automatically.

### 3.15 Penalties
- Officer (Chairperson or Secretary) opens **Assess penalties** for a month.
- The page lists members who were short of the contribution by the deadline, with the basis: amount paid, amount due, shortfall.
- Officer selects members and confirms. Each gets one late-contribution penalty for that month. Repeating the action does not create duplicates.
- Missed-meeting penalties are a separate action with their own amount, set by the group.
- Waiving a penalty: Chairperson only, with a reason. No one can waive their own penalty.

### 3.16 Share-out
1. Treasurer opens **Preview** for a cycle. Shows pool (interest and penalty income less expenses), the model (proportional or equal), and each member's share.
2. Every member can view their own projected share.
3. Chairperson opens **Commit**. A second factor is required (see 6). The system recalculates. If any figure changed since the preview, commit is refused and the preview must be redone.
4. Rounding: payouts are rounded down to whole shillings. Leftover shillings go to members with the largest fractions, ties by member number. The total equals the pool exactly.
5. Committed share-outs add to share capital. A cash payout is a separate cash-out.
6. Cycle close: the Secretary records the resolution (date, motion, outcome, rollover). A cycle closes only when every loan is repaid or written off with a reason.

### 3.17 Reports and exports
- **Arrears report:** each member's expected and paid contributions for the cycle.
- **Officer cockpit:** unpaid contributions, loan decisions waiting, cash-outs waiting, unpaid penalties, welfare claims waiting and overdue, invitations expiring, members with three or more missed contributions.
- **Statement of account:** any member, any period. Shows all entries and closing balance. Printable.
- **Loan statement:** terms, decisions, schedule, repayments, balance. Printable.
- **CSV export:** of the ledger, attendance, arrears or loans, limited to what the user may see. Each export is logged. Cells starting with =, +, - or @ are prefixed with an apostrophe to block spreadsheet formula injection.

### 3.18 Group chat
- One thread per chama. Messages visible to all members of that chama only.
- Unread count shown in the menu and on the Dashboard.
- Message text is displayed as plain text. No HTML is rendered.

### 3.19 Administration (Chairperson and Secretary)
- **Chama profile:** name, type, cycle length, registration details.
- **Rules:** contribution amount per member, deadlines, penalty amounts, interest method, rate, welfare categories, approval settings, recusal and substitution rules, exit notice period, step-up threshold. Each change creates a new dated version. Old transactions keep the version they were recorded under.
- **Audit log:** every significant action, with actor, time, and before and after values. Read-only. Hash-chained. Once a day, the latest hash is exported to a location outside the application (see 6). A check run from outside the app confirms the chain matches the exported hashes.
- **Invitations:** list, revoke.
- **Officers:** propose and confirm changes.

### 3.20 Profile
- Edit first name, last name, nickname, phone, email. Duplicate phone or email within the same chama is refused.
- Upload a PNG profile picture. The server checks the file's actual content and size, not just its name.
- Change PIN: requires the current PIN.

---

## 4. Offline behaviour

If the connection drops while recording something:
- The entry is saved on the device, marked **Queued on this device**.
- It is sent when the connection returns, using the same request key, so it cannot be saved twice.
- Until the server confirms, the entry shows as queued, never as posted.
- If the server rejects it later (for example, a duplicate or a rule now broken), the user sees the reason and the entry is not posted.

---

## 5. Errors and status messages

Every failed action shows a plain message saying what happened and what to do next. Examples:

- "Wrong PIN. 2 tries left before a 15-minute lock."
- "This invitation has expired. Ask the person who invited you for a new one."
- "You cannot approve this loan because you are the borrower."
- "This guarantee would take you above your unpledged share capital."
- "Welfare fund has KSh 3,000. This claim is KSh 5,000. Choose an option below."
- "Payment amount does not match the request. Held for review." (Shown only when a Daraja connection is enabled.)
- "Preview is out of date because a contribution changed. Preview again before committing."

The page never shows a success message for an action the server refused.

---

## 6. Security, data and recovery

**Step-up verification (Proposed).** PIN alone is not enough for these actions. The system sends a one-time code to the user's phone and requires it before the action is saved:
- Share-out commit
- Officer change
- Reversal approval
- Cash-out approval above the limit in the chama Rules
- Officer-assisted PIN reset

**Session and access.**
- Sessions expire after 30 minutes of inactivity (current value; see Section 3.3 for the open question).
- Signing out ends the session on the server.
- Users see only their own chama's data. A link to another chama's record shows "Not found."
- Users can change their PIN at any time from Profile.
- Activity that changes money or roles is recorded in the audit log.

**Encryption.**
- All traffic uses HTTPS.
- Passwords (PINs) are stored hashed, never in plain text.
- Encryption of stored data at rest is claimed only when the hosting provider confirms it is enabled. **Open:** choice of hosting.

**Backups and recovery.**
- Database backups are taken daily, stored encrypted, and kept in a location separate from the application server.
- A restore is tested on a schedule, at least once a quarter, and the result is recorded.
- The recovery time and recovery point targets are set by the owner. **Open.**

**Retention and erasure (Open).**
- Financial records are kept for a period set by the owner after legal advice. The period is not fixed in this document.
- A member's request to delete personal data is handled as follows: contact details and profile are erased; financial records are kept for the retention period and their personal fields are restricted, with the reason recorded.
- The retention period and the erasure rules must be confirmed by counsel before real data is stored.

**Audit anchoring.** The hash chain proves tampering only if the check is run outside the system being checked. A daily export of the latest hash to a location the application cannot change makes the check meaningful.

---

## 7. Accessibility and language

- Designed for a phone first. Treasurer recording screens work with one hand.
- English and Kiswahili on every screen; switch at the top of each page.
- Every control has a label. Status is never shown by colour alone.
- Works with a keyboard. Errors are announced to screen readers.

---

## 8. Scope and limits

**Not in v1:**
- USSD and feature-phone access. Many treasurers and members in rural areas use feature phones, so this excludes part of the intended users until it is built. It is planned for v2.
- Vice Chairperson and other additional officials. Their roles and approval rules are set by each group's constitution, and the app will support them after v1.
- Automated M-Pesa disbursement.
- Trusted-device sign-in.
- Investment tracking.

---

## 9. Open items (need the owner's decision or a source)

| # | Question | Default in this document |
|---|---|---|
| 1 | | Loan approval model and threshold | Chairperson selects the two- or three-approver model during setup; majority decision applies. The two-approver tie/disagreement rule remains unresolved. *|**Finalize tie handling before implementation; conduct the planned survey to validate how local chamas handle loan approvals.**|*
| 2 | Late penalty amount and eligibility | KSh 200 after the 5th; configurable |
| 3 | Welfare fee and monthly contribution | Separate settings; welfare fee KSh 500 |
| 4 | Interest method and rate | Set by the chama Rules; reducing balance and 5% per month, proposed |
| 5 | Share-out basis | Proportional, time-weighted |
| 6 | Session timeout for a financial app | 30 minutes; not verified against any source |
| 7 | Retention period for financial records and erasure rules | Not set; counsel to advise |
| 8 | Hosting, encryption at rest, backup recovery targets | Not set |
| 9 | Dissolution distribution rule and Registrar filing | Not set |
| 10 | Limit above which cash-outs need step-up verification | Not set |
| 11 | Cash-related compliance thresholds (POCAMLA) | Not researched; counsel to advise |
| 12 | Vice Chairperson and other officials | Not in v1 |
| 13 | Automated M-Pesa disbursement | Not in v1 |
| 14 | Trusted devices | Not in v1 |
| 15 | USSD access | Planned for v2 |

---

## 10. Document history

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-10-19 | Initial draft |
| 1.1 | 2026-10-19 | Defined M-Pesa matching behaviour under a Daraja connection; moved interest method from borrower choice to the chama Rules; added cumulative guarantee-capacity limits; added recusal for guarantors and borrowers on loan decisions; added exit settlement and dissolution; added backups, encryption and retention statements; added daily audit-hash export; added step-up verification for high-risk actions; added identity check and expiry to officer-assisted PIN reset; listed USSD as a v2 scope gap; left session timeout, POCAMLA thresholds and retention period open pending a source |
| 1.2 | 2026-10-19 | Fixed stale cross-references from §3.7 and §3.8 to §3.17; added a 7-day decision window for welfare claims; specified the loan installment rounding rule |