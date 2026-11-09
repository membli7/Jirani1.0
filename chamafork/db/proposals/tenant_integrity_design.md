# Tenant integrity design

**Status:** proposal and validation contract only. Nothing here is registered in `db/migrate.js` or applied to a database. The existing `tenant_foreign_keys.sql` remains the proposed typed-column migration; this document completes its JSON relationship design.

## Core rule

Every relationship between application records must remain inside one `chama_id`. Keep row-level security (RLS), but do not treat it as a substitute for referential integrity: RLS scopes queries, while composite foreign keys prevent a row in one chama from pointing at a valid row in another.

The app stores external/logical IDs in `record_data` JSONB and maps rows to database UUIDs in `repo/postgres-state.js`. JSON user IDs are not database UUIDs. In particular, `users.source_id` is `${chamaId}:${userId}`, so JSON links must target a tenant-scoped logical-user key derived from `users.record_data->>'id'`, not compare an unqualified ID to `users.source_id`.

## Relationships found in the current schema and writer

| Stored record | JSON path or field | Target and enforcement |
|---|---|---|
| `loans` | `memberId` | Borrower; duplicate of typed `borrower_id`, which must identify the same user in the same chama. |
| `loans` | `approvals[].approverId` in both the JSONB `approvals` column and `record_data.approvals` | Same-chama user. These two copies must agree. The historical `${role}-legacy` placeholder produced by `normalizeLoan` is not a user ID; preserve it as an explicit legacy sentinel or reconcile it before enforcing approval links. |
| `loans` | `guarantors[].memberId` | Same-chama user. |
| `attendance` | `registerId`, `userId` | `registerId` targets `attendance_registers`; `userId` duplicates typed `member_id` and must identify that same user. |
| `attendance_registers` | `createdBy.id`, `editedBy.id`; `history[].by.id`; `history[].changes[].userId` | Same-chama users. `history[].by` can be a user object; treat its `id` as the link. |
| `transactions` | `memberId`, `loanId`, `recordedBy` | Same-chama user/loan, matching the typed columns. |
| `contributions` | `memberId`, `recordedBy` | Same-chama users, matching the typed columns. |
| `memberships` | `userId` | Same-chama user, matching typed `user_id`. |
| `loan_repayments` | `loanId`, `memberId` | Same-chama loan/user, matching typed columns. |
| `ledger_entries` | `transactionId` | Same-chama transaction, matching typed `transaction_id`. |
| `messages` | `authorId`, `recipientId` | `authorId` matches typed `author_id`; notification `recipientId` targets a same-chama user. A null author is valid for system-authored notifications. |
| `invitations` | `invitedBy` | Same-chama user, matching typed `invited_by`. |
| `dividends` | `memberId`; cycle `payouts[].memberId` | Same-chama users. The cycle snapshot is JSON-only; each payout reference must be checked even though the cycle row has no single `member_id`. |
| `penalties` | `memberId`, `transactionId`, `paidTransactionId` | Same-chama user and transactions. `memberId` duplicates typed `member_id`; the two transaction links are currently JSON-only. |
| `audit_log` event rows | `by.id`, top-level `memberId` / leadership IDs, `changes[].userId`, `guarantors[].memberId`, `pledgesReleased[].memberId`, `transactionId`, `loanId`, and `entityId` | `by.id` duplicates typed `recorded_by`; other user/record links must be tenant-scoped. `entityId` is polymorphic and must be classified by event type (below). |
| `audit_log` leadership rows (`record_kind='leadership'`) | `incomingUserId`, `outgoingUserId`, `proposedBy`, `confirmedBy`, `candidateIds[]`, `candidateNames[].id`, `eligibleVoterIds[]`, `ballots[].candidateId`, `winnerId`, `result.winnerId`, `result.tiedCandidateIds[]`, `audit[].by`, `audit[].incomingUserId`, `audit[].outgoingUserId` | Same-chama users. The literal `system` in election history is an intentional system actor, not a user. `parentElectionId` targets another leadership record in the same chama. |
| `mpesa_callbacks` | typed `transaction_id` | A local transaction link resolved by the mapper and covered by the typed-FK proposal. Raw provider payload/callback IDs remain untrusted external data, not database relationships. |

`record_data` contains copies of several typed IDs. Enforce both tenant ownership and copy consistency; do not silently prefer whichever copy happens to be valid.

### Polymorphic audit entity map

Use an explicit event-type allowlist when materializing `audit_log.entity_id` links:

- `payment.recorded`, `contribution.recorded`, `contribution.date_corrected`, and `contribution.backfilled` → `transactions`.
- `loan.*` and `pledge.released` → `loans`.
- `penalty.*` → `penalties`.
- `invitation.*` → `invitations`.
- `attendance.created` and `attendance.edited` → `attendance_registers`.
- `message.posted` → `messages`.
- `dividend.distributed` → the dividend cycle (`record_kind='cycle'`).
- `leadership.*` → the leadership record (`record_kind='leadership'`) in `audit_log`.

Known non-row identifiers such as the month used by `meeting-date.set` and subscription references used by `subscription.selection.created` / `subscription.verified` are not foreign keys. Keep these in an explicit external/reference allowlist. Any new event type with a non-null `entityId` must be classified before rollout; do not guess based on the ID string.

## Enforcement model

1. **Keep typed composite FKs.** The 18 relationships in `tenant_foreign_keys.sql` reference `(chama_id, id)` and retain the existing membership cascade. Create the required unique parent keys before the FKs. Existing mismatches must block validation, not be rewritten automatically.
2. **Expose tenant-scoped logical keys.** Add a stored generated `users` logical ID from `record_data->>'id'` and a unique `(chama_id, logical_user_id)` key. Add equivalent logical keys for leadership records and dividend cycles, whose `source_id` values are namespaced (`leadership:` / `cycle:`) and therefore differ from their JSON IDs. Other referenced records can use their existing `(chama_id, source_id)` keys.
3. **Scalar JSON references.** For each scalar JSON reference, derive a typed/generated source-ID column and add a composite FK on `(chama_id, source_id)`. For fields duplicated by typed UUID columns, use a three-column key or a consistency guard so the JSON ID must map to the *same* typed parent row, not merely to some other same-tenant user.
4. **JSON arrays and snapshots.** PostgreSQL cannot place an FK on every member of a JSON array. Materialize array entries into owner-specific shadow link tables (for example, loan approvers, loan guarantors, attendance-history actors/changes, dividend-cycle payouts, and leadership user references). Each link row carries `chama_id`, its owning row key, path/kind, ordinal, and the logical referenced ID. Give the owner and target composite FKs; a trigger on insert/update of the JSON source replaces the derived links in the same transaction. Keep the JSON payload as the application's read/write format until a separately reviewed normalization change.
5. **Polymorphic audit links.** Materialize recognized `entityId` references into an `audit_entity_refs` table with exactly one nullable target key set and a composite FK for each supported target kind. Use deferred FKs for targets written later in `saveState`'s replacement order. The event-type map above, not caller-supplied JSON, selects the target column.
6. **Duplicate-copy guards.** Add checks/triggers for JSON/typed pairs (`loans.memberId`/`borrower_id`, attendance attendee `userId`/`member_id`, transaction/contribution/repayment IDs, audit `by.id`/`recorded_by`, etc.). A missing typed resolution with a non-null JSON reference is a validation error. Preserve intentional nulls and the documented `system`/legacy sentinels only.
7. **Tenant/RLS behavior.** Every new link table must include `chama_id`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, and the same tenant policy as the owner tables. Trigger-created link rows must copy `NEW.chama_id`; never trust a JSON tenant field. Runtime roles remain non-superuser and `NOBYPASSRLS`. Deferred target FKs accommodate the current table-replacement order; link-table RLS checks run while `saveState` has set the matching tenant.

## Safe rollout and validation

1. Take a restorable backup and run the proposal only in an isolated staging database first. Check PostgreSQL version support for stored generated columns and verify runtime/migration roles.
2. Run read-only preflight reports for: missing or duplicate `(chama_id, logical_user_id)` values; each JSON link with no same-chama target; cross-chama targets; typed/JSON mismatches; divergence between `loans.approvals` and `record_data.approvals`; unmapped audit event types; and legacy approval/system sentinels. Do not auto-repair financial or audit rows.
3. Add logical keys and indexes, build/backfill the shadow link rows, then install write-through triggers. Keep these changes atomic per tenant. If an index must be built concurrently, do it outside the current all-in-one migration transaction and document the restart point.
4. Add the composite FKs as `NOT VALID` where existing data must first be reviewed. They still protect new writes. Reconcile any pre-existing mismatch with an explicitly reviewed data repair, then `VALIDATE CONSTRAINT` in staging and production only after the report is clean.
5. Exercise same-chama success, cross-chama rejection for every relationship kind, missing-target rejection, same logical IDs in different chamas, update/delete/cascade behavior, multi-chama `saveState`, and rollback on a bad JSON reference. Verify RLS using the runtime role, not a superuser.
6. Rollback removes only generated columns, link tables, triggers and new constraints/indexes after stopping the new writer path; it does not delete or rewrite the source JSON. Retain the backup until staging and post-deploy integrity checks pass.

The proposal files remain unregistered, so this design has not changed the running database or any user data.

## Payment boundary

Do not enable payments, hosted callbacks, or settlement. Do not register callback URLs, change payment flags, alter callback routes, or write settlement logic as part of tenant-integrity work. `db/004_mpesa_receipts.sql` remains an existing schema migration only; its receipt/account columns do not activate payment processing. Payment enablement is a separate deliberate change requiring the hosted callback and settlement workflow to be implemented and tested first.
