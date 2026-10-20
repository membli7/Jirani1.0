# Security audit — 2026-10-20

## Scope and method

Read-only source review of the `review-fixes` checkout covering authentication and sessions, request protections, authorization, tenant scoping, PostgreSQL persistence and RLS, uploads, exports, messaging, election records, operational configuration, and available automated tests. No production database was queried or modified, and no migrations were run. This is a code review, not a penetration test, live deployment verification, or dependency vulnerability scan.

## Summary

- The application has server-side role checks on financial and administrative writes, tenant-scoped response construction, PostgreSQL RLS policies, a single-writer advisory lock, session regeneration at setup/login, `HttpOnly`/`SameSite=Strict` cookies, production HTTPS redirects, and a same-origin write-request gate.
- A secret-ballot disclosure through the legacy leadership endpoint was confirmed and fixed in this change set. A regression test verifies that endpoint does not return election records.
- Production deployment details (proxy network boundary, PostgreSQL runtime role flags, actual TLS, and package CVEs) were not independently verified.

## Findings

### F-01 — Raw secret ballots were exposed through legacy leadership API — High — Fixed

`GET /api/leadership-changes` returned unfiltered `leadershipChanges` records to Chairperson and Secretary accounts. Election records include each ballot’s `candidateId` and voter token, defeating secret ballots. The route now filters out elections; callers use the dedicated safe election projection. The integration test asserts the legacy route contains no election records while a tie election is in progress.

Evidence: `chamafork/server.js` near the legacy leadership GET route and `chamafork/test/server.integration.test.js` in the election/runoff scenario.

### F-02 — No HSTS response header — Medium

The server sets a restrictive Content Security Policy and redirects HTTP to a configured canonical HTTPS origin in production, but no `Strict-Transport-Security` header is set in application responses. If the TLS edge does not add HSTS, first-visit downgrade attacks remain possible.

Recommendation: configure HSTS at the trusted TLS proxy after confirming HTTPS is consistently available for the host and any intended subdomains.

Evidence: `chamafork/server.js` security-header middleware around line 800.

### F-03 — PostgreSQL RLS bypass capability is not verified — High if misconfigured; deployment status unverified

The migration helper grants the configured runtime role data privileges and enables/forces RLS policies in the migrations. It does not verify that the runtime role is neither a superuser nor `BYPASSRLS`. PostgreSQL superusers and roles with `BYPASSRLS` can bypass row policies, which would undermine tenant isolation.

Recommendation: use a dedicated least-privilege runtime role, and verify `rolsuper = false` and `rolbypassrls = false` for the configured role in deployment checks. This audit did not inspect the live database role.

Evidence: `chamafork/db/migrate.js` around lines 21-30; `chamafork/db/002_app_tables.sql` around lines 226-230.

### F-04 — Proxy trust depends on network isolation — Medium if app port is directly reachable; deployment status unverified

Production requires `TRUST_PROXY=1`, and the app trusts one proxy hop for `req.secure`. The HTTP redirect then relies on that value. If clients can reach the Node listener directly, a client-supplied forwarded-protocol header may be treated as proxy metadata. The application listens without an explicit interface binding; network reachability was not tested.

Recommendation: firewall the app port so only the trusted TLS proxy can reach it, or bind the app to a private interface and configure an explicit trusted proxy range.

Evidence: `chamafork/server.js` around lines 80 and 1916; `chamafork/security/production-config.js` around line 39.

### F-05 — OTP requests are limited by source, not destination phone — Medium when SMS is enabled

OTP requests have a shared per-IP rate limit and codes are short-lived and hashed in the session. There is no per-phone send cooldown/cap in the request handler. If SMS delivery is enabled, distributed sources could repeatedly send codes to one phone and incur provider cost or nuisance.

Recommendation: add a shared per-phone cooldown and daily send cap before enabling SMS in production.

Evidence: `chamafork/server.js` around lines 1802-1825.

## Verification and limits

- `npm test`: 125 passed, 0 failed, 1 skipped. The skipped tenant foreign-key test requires a disposable PostgreSQL test database; none was configured for this run.
- The test runner needed child-process permission on Windows because the sandbox otherwise returns `spawn EPERM` before executing tests.
- `node --check` passed for the changed server, election helper, browser script, and integration tests; `git diff --check` passed.
- No live PostgreSQL/Redis configuration, proxy/firewall, browser production build, or dependency advisory feed was checked. Do not treat the unverified deployment findings above as confirmed incidents.