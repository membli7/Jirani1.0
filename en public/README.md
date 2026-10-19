# Jirani Chama dashboard

The dashboard assets in this folder are served by `../chamafork/server.js`.

## Run locally

1. Copy `../chamafork/.env.example` to `../chamafork/.env` and set a long `SESSION_SECRET`.
2. For the first run only, set `CHAMA_BOOTSTRAP_NAME`, `CHAMA_BOOTSTRAP_PHONE`, and a 4–12 digit `CHAMA_BOOTSTRAP_PIN`. This creates the first chairperson. Remove the bootstrap PIN after that account has signed in and changed it.
3. Set Africa's Talking credentials to enable SMS invitation delivery. Without provider credentials, share the one-time activation code privately.
4. From the repository root, run `npm start` (or from `../chamafork`, run `npm start`), then open `http://localhost:8000`.

## Write API contract

All JSON write requests require `X-Requested-With: chama`. Authenticated state-changing requests also require a 16–128 character `Idempotency-Key`; clients reuse the same key when retrying the same action. Invitation and cash-transaction keys replay the saved result for 24 hours, then a retry creates a new record.

- `POST /api/login` accepts `{ phone, pin }` and returns the signed-in user.
- `POST /api/invitations` accepts `{ name, phone, role }` for chairperson/secretary sessions; its response includes the saved invitation record and, when SMS is not configured, the one-time activation code. The activation code is only returned once; retries return the saved record without the code. An invited account activates as a member; the Chairperson can propose an officer assignment for confirmation.
- `POST /api/invitations/activate` accepts `{ phone, code, pin }`.
- `POST /api/pin/change` accepts `{ currentPin, newPin }`.
- `POST /api/payments` is now cash-only for manual entries and accepts `{ memberId, amount, paymentType, method: "Cash", note, loanId? }`; the authenticated treasurer is recorded as `recordedBy` and `recordedByName`.
- `POST /api/contributions` records a cash monthly contribution; `POST /api/loan-repayment` records a cash loan repayment. Both use the same fields as `/api/payments` and return the saved transaction in `data`, including its ID, timestamp, and `idempotencyKey`.
- `GET /api/events/stream` is an authenticated Server-Sent Events stream for loan and member updates. It does not process payments.
- `POST /api/loans` is bound to the signed-in user and accepts `{ amount, months }`.
- `POST /api/loans/:id/decisions` accepts `{ decision: "approve" | "reject", reason }`. Each request needs three role decisions with reasons; a borrower cannot decide their own request. Normally the required roles are Chairperson, Treasurer, and Member. If the borrower is the Chairperson or Treasurer, the Secretary takes that role's approval seat. Duplicate decisions are rejected. Loan terms are 1, 2, 3, or 6 months. Approval records a ledger obligation only; money is not transferred or disbursed by this app.
- `POST /api/leadership-changes` lets the Chairperson propose an officer assignment. The first assignment can be approved by the Chairperson to set up the group; subsequent assignments must be confirmed by a different Chairperson or Secretary using `POST /api/leadership-changes/:id/confirm`. Voting is not available.

## Kept feature scope

### CSV export

The authenticated `GET /api/export.csv` downloads the transaction ledger and attendance registers. Chairperson, Secretary, and Treasurer exports include group records; a Member export includes only that member's transactions, attendance, and relevant edit history. CSV values are escaped, including spreadsheet formula-like values. The export does not include a member directory or phone numbers, and it does not reconcile or import payments.

### Loan requests

Any signed-in role can request a 1-, 2-, 3-, or 6-month loan. Each request requires three role decisions, and no borrower can decide their own loan. The Secretary replaces a Chairperson's or Treasurer's approval seat when that officer is the borrower. Each decision and reason is retained in the approval history. Requests can be rejected, approved, and later repaid through a Treasurer-recorded cash ledger entry. This feature tracks requests and balances only: it does not transfer or disburse money; only the listed terms are supported.

## Deferred / not in scope

- Chat and WhatsApp/SMS broadcast messages are not available. SMS configuration is used only for invitation codes.
- Member voting is not available. Officer assignments remain Chairperson-proposed and officer-confirmed; legacy leadership history remains visible.
- Paybill callback processing and payment matching are not available. Cash entries are ledger records, not money transfers.
- Loan terms outside 1, 2, 3, and 6 months are deferred.

The server is authoritative. The client hides unavailable controls, but a disallowed request receives HTTP 403.

The dashboard uses the authenticated SSE events stream with a polling fallback for loan and member updates. Invitation and cash-payment submissions wait up to 30 seconds for a complete saved-record response; if confirmation is unavailable, the client asks the user to verify the Invitations or Transactions list before retrying. The interface supports English and Kiswahili, larger touch targets, loading/error/retry states, and stacked mobile transaction cards.
