# Policy page and acceptance status

**Checked:** 13 November 2026. This update implements separate new-account Terms acceptance and Privacy Notice acknowledgment in Jirani Chama. The policy texts remain working drafts and are not ready for final legal reliance or an unreviewed production release.

## Current state

- The landing page links to `/privacy.html` and `/terms.html`; both pages are visible working drafts with `noindex, nofollow` and linked legal sources. `noindex` is not access control.
- React and direct-source registration and invited-member activation forms show links to both pages before account details and require two distinct checkboxes. English and Kiswahili labels are available.
- The server rejects either missing or non-affirmative choice during initial Chairperson setup and invited-member activation.
- The server stores separate Terms acceptance and Privacy Notice acknowledgment metadata and audit events. Each records a SHA-256 fingerprint of the current policy HTML, timestamp, source, and account/Chama context. This uses existing account/audit structures without a relational schema migration. It is application-level evidence, not tamper-evident proof.
- A Privacy Notice acknowledgment records that the notice was presented and acknowledged; it is not consent to unrelated processing. Existing accounts are not gated at sign-in, and re-acknowledgment after policy updates is not implemented.
- No subscription/payment flow was changed. Live payment processing was reported as disabled or simulated in the reviewed context; production status and provider arrangements still require verification.

## Verification

- The configured Vite production build passed. It reported existing asset-reference and large-chunk warnings.
- The focused frontend MVP test file passed all 47 tests, including the updated forms and client payload behavior.
- The full `npm test` run did not complete successfully: server-dependent integration suites could not connect to their child test servers. A same-process loopback probe also returned `EACCES` for both Node `fetch` and `http.get`, indicating this execution environment blocks local HTTP connections. This prevents end-to-end server verification here; it is not evidence that the implementation passes those tests. Re-run server integration tests in an environment that permits loopback before release.

## Unresolved before publication or production reliance

Confirm the operator’s registered legal identity and address; which Chama and operator are controllers or processors for each purpose; the lawful basis for each purpose; actual production fields, providers, storage/access countries and transfer safeguards; retention/deletion criteria and backup expiry; whether minors may be recorded; required ODPC registration or an evidenced exemption; and secure, monitored handling of `09elim3@gmail.com` and privacy requests. Complete the loan-processing DPIA/legal classification and verify that the human-review route is staffed and has an appropriate response target before relying on the automated-loan descriptions. Obtain Kenyan advocate review, complete the remaining bracketed facts, set the approved policy version and effective date, then publish only after environment-permitted server integration tests pass.

No deployment or production release was made as part of this change.
