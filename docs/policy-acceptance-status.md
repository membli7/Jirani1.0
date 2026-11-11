# Policy page and acceptance status

**Checked:** 11 November 2026. The policy text was expanded and rendered into the existing static HTML pages. No React, Express route, API, database, schema, authentication, or payment behavior was changed. No build or deployment was run.

## Current state

- The landing page links to `/privacy.html` and `/terms.html` in its footer.
- The React member-login and registration forms still have no policy acceptance control.
- The application has no stored Terms/Privacy acceptance field, accepted-policy version, or acceptance record.
- `en public/terms.html` and `en public/privacy.html` now contain detailed, linked HTML versions of the review drafts. Both pages include a visible draft warning and a `noindex, nofollow` directive.
- The Terms source retains the existing payment disclosure: live billing is disabled, and the M-Pesa C2B subscription verifier is described as sandbox-only and disabled pending configuration. No payment code was changed.
- The legal operator identity, controller/processor map, providers and data locations, retention schedule, children’s-data position, and other marked factual items remain unconfirmed. The documents are not ready to be treated as final legal terms or a complete final privacy notice.

## Serving and deployment note

Express serves `chamafork/frontend-dist` first and then falls back to the `en public` source directory. The two policy pages were not present in `frontend-dist` during inspection. Therefore, a running Express instance that uses this configuration can serve the edited source pages directly without a Vite build. If the currently open Cloudflare tunnel still points to that instance, the draft pages may already be reachable there even though no deployment or build was performed.

The `noindex, nofollow` directive asks compliant search crawlers not to index or follow links from these pages. It is not access control and does not prevent a person with the URL from reading a draft. Do not treat the content update as a production release. Confirm whether the temporary tunnel should remain publicly reachable while these pages contain draft placeholders.

## Acceptance gate status

The user has directed that the policy pages be prepared now and that enforcement be handled later because deployment is not happening today. Accordingly, no acceptance gate has been implemented. A real gate still requires application/API work and durable server-side evidence; a browser-only checkbox would not satisfy the project’s security requirements.

When authorized, the implementation decision must define coverage for:

1. New Chama registration and the initial Chairperson account.
2. Invited-member account activation.
3. Existing users at their next sign-in.
4. Material Terms or Privacy Policy version changes.

Terms acceptance must be separate from a Privacy Notice acknowledgment, and neither should be treated as blanket consent to unrelated processing. Any optional consent-based processing requires its own specific choice.

## Before final release

Complete the factual fields in both policy documents, verify the current production data and vendor flows, check the applicable Kenyan law again on the release date, obtain Kenyan legal review, remove the draft banner only after approval, and then update the public pages. Implement and test the separately authorized server-enforced acceptance gate before representing that users must accept the policies to sign in.
