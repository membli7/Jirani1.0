# Security audit — initial review 2026-10-20; hardening follow-up 2026-10-23

## Scope and method

The initial review was a read-only source review of the `review-fixes` checkout covering authentication and sessions, request protections, authorization, tenant scoping, PostgreSQL persistence and RLS, uploads, exports, messaging, election records, operational configuration, and available automated tests. A 2026-10-23 follow-up hardened F-02 through F-05 and added regression tests. No production database was queried or modified, and no migrations were run. This remains a code review, not a penetration test, live deployment verification, or dependency vulnerability scan.

## Summary

- The application has server-side role checks on financial and administrative writes, tenant-scoped response construction, PostgreSQL RLS policies, a single-writer advisory lock, session regeneration at setup/login, `HttpOnly`/`SameSite=Strict` cookies, production HTTPS redirects, and a same-origin write-request gate.
- A secret-ballot disclosure through the legacy leadership endpoint was confirmed and fixed. Regression tests verify that it does not return election records.
- The follow-up adds HSTS, rejects PostgreSQL runtime roles with RLS bypass flags at startup, restricts production proxy trust and listener binding, and caps OTP sends by destination phone.
- Code-level CSRF, write serialization, and route authorization controls were reviewed and covered by regression tests. The proxy network boundary, actual TLS, and package CVEs were not independently verified.
- Local development binds to loopback by default, uses JSON and in-process sessions in the example environment, and does not trust forwarded proxy headers unless explicitly configured.

## Findings

### F-01 — Raw secret ballots were exposed through legacy leadership API — High — Fixed

`GET /api/leadership-changes` returned unfiltered `leadershipChanges` records to Chairperson and Secretary accounts. Election records include each ballot’s `candidateId` and voter token, defeating secret ballots. The route now filters out elections; callers use the dedicated safe election projection. The integration test asserts the legacy route contains no election records while a tie election is in progress.

Evidence: `chamafork/server.js` near the legacy leadership GET route and `chamafork/test/server.integration.test.js` in the election/runoff scenario.

### F-02 — No HSTS response header — Medium — Fixed

The server now sets `Strict-Transport-Security: max-age=31536000` on requests it recognizes as HTTPS in production. It does not add `includeSubDomains` because subdomain HTTPS coverage was not verified.

Evidence: `chamafork/server.js` security-header middleware.

### F-03 — PostgreSQL RLS bypass capability — High if misconfigured; runtime guard added

The server now checks the connected PostgreSQL role's `rolsuper` and `rolbypassrls` flags before it loads tenant data and refuses to start if either is true or the role cannot be verified. PostgreSQL superusers and roles with `BYPASSRLS` can bypass row policies. No live production role was inspected in this review.

Evidence: `chamafork/db/postgres.js` runtime-role check; `chamafork/server.js` startup sequence.

### F-04 — Proxy trust depends on network isolation — Application hardened; deployment status unverified

Production now binds to `127.0.0.1` by default and accepts forwarded protocol metadata only from exact proxy IPs listed in `TRUSTED_PROXY_IPS`. An optional `APP_BIND_HOST` may select a private interface; wildcard and public addresses fail production configuration validation. Configure exact private proxy addresses and firewall the Node port if using a separate interface. No deployment firewall, proxy address, or live network reachability was verified.

Evidence: `chamafork/server.js` proxy trust and listener setup; `chamafork/security/production-config.js` production validation.

### F-05 — OTP requests are limited by source, not destination phone — Fixed

OTP requests now have a one-per-minute cooldown and a ten-per-24-hour cap keyed to an HMAC of the destination phone. Production uses the shared Redis rate-limit store. The existing per-IP limit remains in place.

Evidence: `chamafork/server.js` OTP request limiters.

### F-06 — Local development listener exposed on every interface — Medium — Fixed in code; running process requires restart

When `NODE_ENV` and `APP_BIND_HOST` were unset, the server passed no host to `app.listen`, which bound to `0.0.0.0:8000` on this Windows host. The app's README directs local users to `localhost`, so this unintentionally exposed the unauthenticated setup/login surface and any active app data to other reachable interfaces. The default now binds to `127.0.0.1`; an explicit `APP_BIND_HOST` remains available, and production validation still rejects public bind addresses. A disposable JSON-backed startup returned HTTP 200 on both `127.0.0.1` and `localhost` and reported `127.0.0.1` as its listener. The already-running process still uses its old wildcard bind until it is restarted.

Evidence: `chamafork/server.js` listener setup; `chamafork/security/production-config.js`; `chamafork/test/production-config.test.js`.

## Verification and limits

- `npm test`: 131 passed, 0 failed, 1 skipped after the fixes. The skipped tenant foreign-key test requires a disposable PostgreSQL test database; none was configured for this run.
- `npm audit --audit-level=low`: 0 known vulnerabilities reported for the locked dependency tree.
- The test runner needed child-process permission on Windows because the sandbox otherwise returns `spawn EPERM` before executing tests.
- `node --check` passed for the changed server, election helper, browser script, and integration tests; `git diff --check` passed.
- No live PostgreSQL/Redis configuration, proxy/firewall, or browser production build was checked. Database role safety and proxy network isolation remain deployment checks.

Production now requires `TRUSTED_PROXY_IPS`; deployers must set the exact private IP address of the reverse proxy. Deployments using a separate private interface must set `APP_BIND_HOST` and restrict access to the Node port at the network boundary.
