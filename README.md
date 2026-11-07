# Jirani Chama — MVP

A web app for running a savings chama: cash contributions with a welfare fee, member loans with guarantors, monthly penalties, dividends, and an audit log. The server is Node.js and Express, local development uses a JSON data file, and production can use PostgreSQL. The front end is a single-page app with vanilla JavaScript and English/Kiswahili language support. Translation coverage still needs a review.

This README describes the state at the end of the sprint. Anything not listed under "What it does" is not built.

## What it does

**Contributions** (`POST /api/contributions`)
- Cash only. Each entry needs a member, an amount, a 3–40 character reference number, a date (YYYY-MM-DD), and a note.
- The KES 500 welfare fee is charged on a member's first payment in each calendar month. The rest goes to the member's share capital, and the welfare fee goes to the welfare reserve.
- Payments are applied in this order: outstanding penalties, then the welfare fee, then share capital. The amount must cover penalties plus the welfare fee.
- Legacy payments were backfilled once with the same split. Backfill is idempotent.

**Penalties**
- A payment logged after the month's deadline charges a KES 200 penalty. The default deadline is the 5th of each month.
- `POST /api/settings/meeting-date` (Chairperson or Secretary) sets a different deadline for one month.
- `POST /api/penalties/assess` (Chairperson or Secretary) runs after a month's deadline. It gives an outstanding KES 200 penalty to each active member who paid less than KES 500 by then. Each member is penalised once per month, and members with a late-payment penalty for that month are skipped.

**Loans** (`POST /api/loans`, `POST /api/loans/:id/decisions`, `POST /api/loans/repay`)
- Limit: up to 3 times the borrower's share capital.
- Guarantors: exactly two different active members, not the borrower. Their unpledged share capital must cover the principal. Pledges are locked until the loan is repaid or rejected.
- Interest: 5% a month. Reducing balance is the default; flat rate can be requested. The schedule is created on approval. Terms are 1, 2, 3, or 6 months.
- Approval needs three role decisions, as before. The repayment form records cash only. The app records the schedule and balances; it does not move money.
- Repayments pay interest first on the earliest installment, then principal. Guarantor pledges are released as principal falls.

**Dividends** (`POST /api/dividends/calculate`, `POST /api/dividends/commit`; Chairperson or Treasurer)
- The pool is interest and paid penalties dated within the cycle, minus admin expenses.
- Each active member's share is pro-rata to share capital, rounded to whole shillings. Leftover shillings go to the largest remainders, with ties going to the member ID that sorts first, so payouts add up to the pool exactly.
- Calculate changes nothing. Commit recalculates and rejects the request if the payouts differ from the current figures, adds each dividend to share capital, and is refused for cycles that overlap a cycle already paid out.

**Attendance**
- The Secretary can record and revise meeting attendance registers. Edits are retained in the audit trail.

**Leadership elections**
- After initial setup, the Secretary proposes 2–20 active ordinary members for an officer seat. The Chairperson opens voting and manually closes it; each eligible chama account may cast one secret ballot. The Chairperson verifies the result, and the role change takes effect 24 hours later. A tie for the highest vote opens a runoff among tied candidates; no quorum threshold applies.

**Audit log** (`GET /api/audit-log`; Chairperson or Treasurer)
- Records payments, contributions, penalties, loan requests, decisions, repayments, pledge releases, officer changes, meeting-date changes, backfill, and dividend batches.
- The app has no endpoint that edits or deletes entries. The log is not tamper-evident: anyone with access to the JSON file can change it.

## Install and run

Requirements: Node.js 20 or newer (tested on Node 24), on Windows PowerShell or any shell.

1. Install dependencies:

   ```powershell
   cd chamafork
   npm install
   ```

2. Create the environment file. Copy `chamafork/.env.example` to `chamafork/.env` and set `SESSION_SECRET` to a long random string:

   ```powershell
   Copy-Item .env.example .env
   ```

   `PORT` defaults to 8001. `CHAMA_DATA_FILE` optionally moves the data file; by default it is `chamafork/data.json`. The Africa's Talking settings are optional. Without them, invitation codes are shown once on screen instead of being sent by SMS.

3. Start the server:

   ```powershell
   npm start
   ```

   Or from the repository root, `npm start` runs the same thing.

4. Open `http://localhost:8001`.

On first run with no data, the screen offers first-time setup. This creates the first Chairperson, using a name, a Kenyan phone number, and a 6–12 digit PIN.

## Setting up roles and logging in

There are no default accounts and no default PINs. Set them up as follows.

1. **Chairperson:** create the account with the first-time setup screen.
2. **Members:** the Chairperson or Secretary invites each person with a name, Kenyan phone number, and email address. The invitation shows a one-time activation code. The person enters their phone number, the code, and a PIN of their own choosing on the activation screen. Activated accounts start as Members.
3. **Officers:** direct assignment is limited to initial setup. After setup, the Secretary proposes 2–20 active ordinary members for an officer role; the Chairperson opens voting and closes it manually; eligible group accounts vote once by secret ballot; then the Chairperson verifies the result. A verified role change takes effect after 24 hours. A tie for the highest vote opens a runoff among the tied candidates; there is no quorum threshold.
4. **Logging in:** each account signs in with its phone number and PIN at the sign-in screen. Use a separate browser profile or private window for each role. Accounts with a temporary PIN must change it before they can use the dashboard.

Suggested test order: Chairperson, then Secretary, then Treasurer, then a few members. Then record a few contributions, request a loan with two guarantors, approve it, repay it, assess penalties after a month's deadline, and run a dividend preview.

## Running the tests

From `chamafork`:

```powershell
npm test
```

This runs the Node.js built-in test runner (`node --test`) over `chamafork/test/`. Each integration suite starts its own server with temporary data. On 2026-11-01, 134 tests passed and one PostgreSQL tenant-foreign-key integration test was skipped because `TENANT_FK_TEST_DATABASE_URL` was not configured. Test mode ignores `chamafork/.env` and uses in-process sessions so local PostgreSQL and Redis settings cannot leak into test runs.

Browser behaviour has not been tested. The front-end tests check that the expected HTML and script text is present. They do not click through the UI.

## Known limits (not built or not verified)

- **Browser testing:** the UI has not been exercised in a browser. Please open the dashboard as each role before relying on it.
- **Language:** English and Kiswahili are available in the interface. Translation completeness and wording have not been reviewed end to end.
- **Payments:** the app does not initiate M-PESA STK requests or live subscription charges. A sandbox-only inbound C2B subscription verifier is disabled until public HTTPS validation/confirmation URLs are registered and the shortcode-to-group map is valid. Bank reconciliation is not available; existing cash entries remain unchanged.
- **Messages:** general chat, broadcast, and email delivery are not available. Invitation codes can be delivered through Africa's Talking when configured; live provider delivery has not been verified. Otherwise the one-time code is shown in the app.
- **Security:** no two-factor authentication or tamper-evident audit chain. Same-origin write protections, role checks, and write serialization have source review and regression coverage; this is not an independent penetration test or deployment verification.
- **Data:** `DATA_BACKEND` selects JSON or PostgreSQL; it defaults to JSON for development, while production startup requires PostgreSQL. The PostgreSQL snapshot writer allows only one server process per database. See [production readiness limits](docs/docs/production-readiness.md) for the verified local state and infrastructure items that still need deployment evidence.
- **Legacy loans:** approved loans created before the schedule change have no schedule, so they carry no interest. They repay against principal only.
- **Penalties:** the penalty-first rule works for outstanding penalties. Assessment only runs when someone calls the endpoint, so nothing is penalised automatically.
- **Dividend preview:** it shows the combined pool, not the penalty and interest split.
- **Document vault, minutes, noticeboard, goals, and welfare disbursements:** not built.
- **Leadership elections:** post-setup officer changes use secret-ballot elections. General-purpose polls are not built.
- **Roles:** only Chairperson, Secretary, Treasurer, and Member exist. Vice-Chairperson and Welfare Officer are not built.

## Repository layout

- `chamafork/server.js`: the server and all business rules.
- `chamafork/test/`: integration tests.
- `en public/`: the front end (`index.html`, `chama.js`, `chama.css`, `i18n.js`).
- `docs/`: review and UX notes from earlier work.
- `TASKS.md`: the decisions and task list that drove the sprint.

`en public/README.md` predates this file and still describes bootstrap environment variables that the server does not read. Use this README instead.
