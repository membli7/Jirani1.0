# Policy page and acceptance status

**Checked:** 13 November 2026. A server-enforced Terms acceptance gate is implemented for initial Chairperson setup and invited-account activation. Acceptance metadata uses the existing JSON-backed user and audit records; no relational schema migration was needed. Existing-user sign-in, Privacy acknowledgment, and payment behavior were not changed.

## Current state

- The landing page links to `/privacy.html` and `/terms.html` in its footer.
- The React member-login and registration forms require an explicit checkbox linked to the Terms page when a new account is created; the direct-source fallback forms have the same control.
- The server rejects account creation when explicit acceptance is missing. It stores a SHA-256 fingerprint of the Terms file, UTC acceptance time, source, and account/Chama context in existing JSON-backed user metadata and the application audit log.
- Existing accounts are not gated at sign-in, acceptance of Privacy is not requested, and re-acceptance after a material policy change is not implemented.
- `en public/terms.html` and `en public/privacy.html` now contain detailed, linked HTML versions of the review drafts. Both pages include a visible draft warning and a `noindex, nofollow` directive.
- The Terms source retains the existing payment disclosure: live billing is disabled, and the M-Pesa C2B subscription verifier is described as sandbox-only and disabled pending configuration. No payment code was changed.
- The legal operator identity, controller/processor map, providers and data locations, retention schedule, children’s-data position, and other marked factual items remain unconfirmed. The documents are not ready to be treated as final legal terms or a complete final privacy notice.

## Serving and deployment note

Express serves `chamafork/frontend-dist` first and then falls back to the `en public` source directory. The Terms and Privacy pages are not included in `frontend-dist`, so Express serves the source pages directly. A local Vite build was run while verifying the acceptance UI; no deployment was made. If the currently open Cloudflare tunnel still points to this instance, the draft pages may already be reachable there.

The `noindex, nofollow` directive asks compliant search crawlers not to index or follow links from these pages. It is not access control and does not prevent a person with the URL from reading a draft. Do not treat the content update as a production release. Confirm whether the temporary tunnel should remain publicly reachable while these pages contain draft placeholders.

## Acceptance gate status

The new-account Terms gate is enforced in both UI and server validation. Missing or non-affirmative `termsAccepted` values are rejected; an accepted version fingerprint, timestamp, source, and account context are persisted in the existing user record and audit history. This is application-level evidence, not a tamper-evident record. No schema migration was needed.

Coverage status:

1. New Chama registration and the initial Chairperson account — implemented.
2. Invited-member account activation — implemented.
3. Existing users at their next sign-in — not implemented; outside the current scope.
4. Re-acceptance after material Terms changes or any Privacy acknowledgment — not implemented; outside the current scope.

Terms acceptance must be separate from a Privacy Notice acknowledgment, and neither should be treated as blanket consent to unrelated processing. Any optional consent-based processing requires its own specific choice.

## Before final release

Complete the factual fields in both policy documents, verify the current production data and vendor flows, check the applicable Kenyan law again on the release date, obtain Kenyan legal review, remove the draft banner only after approval, and then update the public pages. Do not describe this change as an existing-user sign-in gate, a Privacy acceptance, or a tamper-evident audit record; those behaviors remain unimplemented.
