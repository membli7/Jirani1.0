# Jirani Chama dashboard

The dashboard assets in this folder are served by `../chamafork/server.js`.

## Run locally

1. Copy `../chamafork/.env.example` to `../chamafork/.env` and set a long `SESSION_SECRET`.
2. On a fresh local data file, use the first-time setup screen to create the first Chairperson. The current server does not use `CHAMA_BOOTSTRAP_*` environment variables.
3. Set Africa's Talking credentials to enable SMS invitation delivery. Without provider credentials, share the one-time activation code privately.
4. From the repository root, run `npm start` (or from `../chamafork`, run `npm start`), then open `http://localhost:8001`.

## Write API contract

All JSON write requests require `X-Requested-With: chama`. Authenticated state-changing requests also require a 16–128 character `Idempotency-Key`; clients reuse the same key when retrying the same action. Invitation and cash-transaction keys replay the saved result for 24 hours, then a retry creates a new record.

- `POST /api/login` accepts `{ phone, pin }` and returns the signed-in user.
- `POST /api/invitations` accepts `{ name, phone, role }` for chairperson/secretary sessions; its response includes the saved invitation record and, when SMS is not configured, the one-time activation code. The activation code is only returned once; retries return the saved record without the code. An invited account activates as a member; the Chairperson can propose an officer assignment for confirmation.
- `POST /api/invitations/activate` accepts `{ phone, code, pin }`.
- `POST /api/pin/change` accepts `{ currentPin, newPin }`.
- `POST /api/payments` is now cash-only for manual entries and accepts `{ memberId, amount, paymentType, method: "Cash", note, loanId? }`; the authenticated treasurer is recorded as `recordedBy` and `recordedByName`.
- `POST /api/contributions` records a Treasurer-entered cash monthly contribution with `{ memberId, amount, method: "Cash", referenceNumber, date, note }`; the server rejects impossible and future dates. `POST /api/loan-repayment` records a cash loan repayment. Successful writes return the saved transaction in `data`.
- `POST /api/contributions/:id/correct-date` accepts `{ date, reason }` for a confirmed cash contribution. Only the Chairperson or Treasurer may use it. The server requires a non-empty reason, keeps the date within the original month and the existing on-time/late classification, and changes no other transaction fields; it appends an audit event with actor, time, old/new dates, and reason.
- `GET /api/monthly-close?month=YYYY-MM` is a read-only monthly summary available to Chairperson, Secretary, and Treasurer. It summarizes recorded cash activity, tracked open loan balances, and review items; it does not verify bank/M-PESA settlement or move money.
- `GET /api/messages` and `POST /api/messages` provide in-app group chat. `GET /api/events/stream` is an authenticated event stream for message, loan, member, and financial updates; it does not process payments.
- `POST /api/loans` is bound to the signed-in user and accepts `{ amount, months }`.
- `POST /api/loans/:id/decisions` accepts `{ decision: "approve" | "reject", reason }`. Each request needs three role decisions with reasons; a borrower cannot decide their own request. Normally the required roles are Chairperson, Treasurer, and Member. If the borrower is the Chairperson or Treasurer, the Secretary takes that role's approval seat. Duplicate decisions are rejected. Loan terms are 1, 2, 3, or 6 months. Approval records a ledger obligation only; money is not transferred or disbursed by this app.
- `GET/POST /api/leadership-elections` supports post-setup officer elections. The Chairperson or Secretary schedules candidates and a date; eligible active chama accounts vote once by secret ballot, and ties can be resolved through a scheduled runoff.

## Kept feature scope

### CSV export

The authenticated `GET /api/export.csv` downloads the transaction ledger and attendance registers. Chairperson, Secretary, and Treasurer exports include group records; a Member export includes only that member's transactions, attendance, and relevant edit history. CSV values are escaped, including spreadsheet formula-like values. The export does not include a member directory or phone numbers, and it does not reconcile or import payments.

### Loan requests

Any signed-in role can request a 1-, 2-, 3-, or 6-month loan. Each request requires three distinct role decisions, and no borrower can decide their own loan. The Secretary fills a Chairperson's or Treasurer's approval seat when that officer is the borrower. Each decision and reason is retained in the approval history. Requests can be rejected, approved, and later repaid through a Treasurer-recorded cash ledger entry. This feature tracks requests and balances only: it does not transfer or disburse money; only the listed terms are supported.

### Group chat and month-end review

Active accounts can use in-app group chat within their chama. The event stream delivers updates when available; the client polls during stream outages, reconciles periodically after reconnecting, and attempts to reconnect when the device comes online. External WhatsApp/SMS broadcasts and chat by email are not included.

The officer-only month-end close is a read-only review of cash contributions and repayments already recorded, tracked open loan balances, and review items such as pending loan decisions or incomplete cash references. It is not bank/M-PESA reconciliation and does not move funds.

### Audit and corrections

Date corrections are restricted to Chairperson/Treasurer roles and confirmed cash contributions. A non-empty reason is required; the date must be valid, not future-dated, remain in the original month, and preserve on-time/late status. An audit event records the actor, timestamp, old/new dates, and reason. The audit history is application-level and is not tamper-evident.

## Deferred / not in scope

- WhatsApp/SMS broadcast messages and chat by email are not available. SMS configuration is used only for invitation codes.
- General-purpose polls are not available. Post-setup officer seats use secret-ballot elections; legacy leadership history remains visible.
- Paybill callback processing and payment matching are not available. Cash entries are ledger records, not money transfers.
- Loan terms outside 1, 2, 3, and 6 months are deferred.

The server is authoritative. The client hides unavailable controls, but a disallowed request receives HTTP 403.

The authenticated SSE stream can carry message, loan, member, and financial updates. Chat polls while the stream is unavailable and continues slower reconciliation while the stream is healthy. Invitation and cash-payment submissions wait up to 30 seconds for a complete saved-record response; if confirmation is unavailable, the client asks the user to verify the Invitations or Transactions list before retrying. The interface supports English and Kiswahili, larger touch targets, loading/error/retry states, and stacked mobile cards. The audit log is not tamper-evident, and production backup/restore has not been verified.
