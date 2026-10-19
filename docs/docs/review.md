# Jirani Chama — Site and Security Review

Review date: 10 October 2026

## Executive summary

The site is a group-savings ("chama") dashboard for managing members, contributions, loans, attendance, notifications, and leadership changes. Four synthetic QA accounts were created and tested.

No critical or high-severity issue was confirmed within the limited checks performed. Three hardening items merit follow-up, and one role-policy question requires stakeholder confirmation:

1. **F-01**: PIN credential policy (6+ digits, throttling, legacy compatibility)
2. **F-02**: Session cookie transport hardening (Secure flag, proxy configuration)
3. **F-03**: Invitation code rate limiting and reuse prevention (verification needed)
4. **F-04**: Officer role data scope (policy clarification needed for all officer roles)

## Findings

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| F-01 | Medium | 4-digit PIN allowed in signup form | Enforce minimum PIN length (6+ digits recommended) server-side on signup, invite activation, and PIN change. Add login throttling with progressive delays and temporary lockout. Existing 4-digit PINs must still log in, then be forced to change. Thresholds should be chosen during implementation. |
| F-02 | Low | Session cookie missing Secure flag in production | Set `secure: true` in production. Configure trusted-proxy handling correctly for your deployment path (do not blindly copy `app.set('trust proxy', 1)`). Verify HTTP requests redirect to HTTPS. |
| F-03 | Review | Invitation codes need verification | Codes were observed as 6-digit and stated to expire in 24 hours. Verify that codes are: random, single-use (with reuse prevention), bound to the invited phone, and rate-limited with an attempt cap. This was not tested; treat as a verification item. |
| F-04 | Informational | All officer roles (Chairperson, Secretary, Treasurer) receive group-wide roster and balance data | Confirm role policy and least-privilege expectations. If separation of duties is required, narrow each office's read/write scope accordingly. The Member role correctly scopes data to personal records only. |

## Tested workflows

- ✓ Sign-in with synthetic accounts; role-specific dashboards rendered
- ✓ Member data scoped to personal records (own contributions, own loans); group balance not shown to Member
- ✓ Unauthenticated requests to /api/dashboard and /api/export.csv returned 401
- ✓ Session logout invalidated subsequent requests
- ✓ Cash contribution recorded as ledger entry (no funds moved)
- ✓ Loan request and multi-role approvals (no funds moved)
- ✓ Loan repayment recorded; outstanding balance updated to KES 0
- ✓ Attendance register creation and role-scoped editing with audit trail
- ✓ Leadership vote proposed, co-signed, voted, and role restoration applied
- ✓ In-app notification created; SMS not configured (0 sent, 1 reported failed)
- ✓ CSV exports returned scoped data (Member saw only own records; Secretary saw full roster)

## Not tested

- Paybill callback and reconciliation (no incoming Paybill events in test instance)
- SMS delivery (provider not configured)
- Overdue/default loan actions and recovery workflows
- Server-side PIN hashing and storage details
- Brute-force resistance, code-guessing, injection, CSRF, concurrency
- Every role-sensitive endpoint authorization

## QA state

Test data created during review:
- 5 active synthetic accounts (Chairperson, Secretary, Treasurer, 2 Members)
- 1 KES 1 Monthly Contribution (ledger entry, no funds received)
- 1 KES 1 Loan Repayment (ledger entry, no funds received); loan outstanding = KES 0
- 1 Attendance register for 10 Oct 2026 showing 4/5 present
- 1 In-app reminder notification (read)
- 1 Leadership vote and role-restoration audit record

**Action**: Delete all QA accounts and test records before using the app with real members. Do not reuse the synthetic phone numbers or PINs.

## Scope and limitations

This review:
- Used only the test site and synthetic test data
- Checked API authentication, Member data scoping, and role-specific dashboard rendering
- Did not perform penetration testing, fuzzing, injection attacks, or destructive testing
- Did not access server code, deployment configuration, or database implementation
- Did not exhaustively audit every write endpoint or concurrency scenario

The findings above are a scoped review, not a security certification.