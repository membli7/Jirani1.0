# Production readiness limits

Evidence checked on 2026-10-20 for this checkout. This note records local observations; it is not proof of a production deployment.

## Verified in the current environment

- The application supports JSON and PostgreSQL. `DATA_BACKEND` defaults to JSON when unset; the current local `.env` selects PostgreSQL.
- A read-only PostgreSQL connection succeeded. The app-role tenant directory contains one chama. Counting records inside that chama's RLS context returned 5 users, 5 memberships, 6 contributions, 1 loan, 4 attendance rows, 1 attendance register, 8 transactions, 24 audit records, 2 messages, 4 invitations, and 4 penalties; dividends, ledger entries, loan repayments, and M-Pesa callbacks were empty. The database has 33 foreign keys.
- `chamafork/data.json` also exists and parses, with 1 user and no transactions, loans, payouts, invitations, leadership changes, attendance registers, audit records, penalties, dividends, or messages. It is not the selected backend; the PostgreSQL snapshot is populated and materially different. Do not run an import from this JSON snapshot over PostgreSQL. The importer is absent from this checkout.
- The application was not listening on `127.0.0.1:8000` during the check, so its active runtime backend and health endpoint could not be verified.
- `NODE_ENV` is unset, so production-only startup validation is not active in this local process environment. PostgreSQL TLS is disabled and Redis uses a plaintext URL. PostgreSQL and Redis were reachable locally, but these settings do not satisfy production requirements.
- Production startup checks require PostgreSQL, `PGSSL=verify-full`, TLS Redis (`rediss://`) for sessions and shared rate limits, trusted HTTPS origins, proxy configuration, and strong session and metrics secrets. These checks validate configuration values; they do not provision or verify the infrastructure.
- PostgreSQL state writes replace a chama's stored snapshot. A database advisory lock rejects a second application runtime, so deployment must run one server process per database. This design does not support horizontally scaled application processes.
- The M-Pesa callback route returns `503`; automated callback settlement is disabled until authenticated, exact-amount reconciliation is implemented.
- No deployment manifests or backup/restore scripts are present in this checkout. No `SECURITY_AUDIT.md` or JSON importer is tracked in this checkout or its available Git history.

## External deployment evidence still needed

- Public HTTPS routing, certificate renewal, trusted proxy behavior, exact allowed origins, and firewall rules that prevent direct public access to the application port.
- Production PostgreSQL certificate verification and network access controls, plus TLS-protected Redis connectivity and availability.
- A scheduled backup policy and a successful restore exercise into an isolated environment.
- Evidence that any credentials exposed in an earlier audit artifact were rotated if they were ever used live. The artifact is absent from the current tracked tree; its historical values and validity were not established here.
- Applicable data-protection and retention controls for the actual deployment.
