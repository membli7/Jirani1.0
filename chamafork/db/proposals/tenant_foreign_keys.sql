-- PROPOSAL ONLY: this file is intentionally not registered by db/migrate.js.
-- It covers 18 typed foreign-key columns. This is not a complete tenant boundary:
--   * loans.record_data.approvals[].approverId and guarantors[].memberId reference users;
--   * attendance.record_data.registerId references attendance_registers, while register
--     createdBy.id and editedBy.id reference users;
--   * penalties.record_data.transactionId and paidTransactionId reference transactions;
--   * audit_log.entity_id is polymorphic (transaction, loan, penalty, invitation, or
--     leadership record by event type); leadership records also contain incomingUserId,
--     outgoingUserId, proposedBy, confirmedBy, and audit[].by user references;
--   * record_data duplicates IDs already represented by typed columns, so writes must keep
--     those copies consistent. M-Pesa callback payload IDs are external/untrusted input and
--     are not treated as database relationships.
-- JSON relationships and staged enforcement are specified in
-- db/proposals/tenant_integrity_design.md. Neither proposal is registered.

-- Add tenant-aware targets before replacing any existing foreign keys.
CREATE UNIQUE INDEX IF NOT EXISTS users_chama_id_id_unique ON users (chama_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS loans_chama_id_id_unique ON loans (chama_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_chama_id_id_unique ON transactions (chama_id, id);

-- This proposal is unregistered. If adopted, split installation into a one-time
-- migration and keep validation as the separate gated Phase 2 below: db/migrate.js
-- replays migrations, and rerunning this block after Phase 2 would reset validated
-- constraints to NOT VALID. Do not rerun this installation after validation.
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_member_id_tenant_fkey;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_recorded_by_tenant_fkey;
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_recorded_by_tenant_fkey;
ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_member_id_tenant_fkey;
ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_recorded_by_tenant_fkey;
ALTER TABLE dividends DROP CONSTRAINT IF EXISTS dividends_member_id_tenant_fkey;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_invited_by_tenant_fkey;
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_transaction_id_tenant_fkey;
ALTER TABLE loan_repayments DROP CONSTRAINT IF EXISTS loan_repayments_loan_id_tenant_fkey;
ALTER TABLE loan_repayments DROP CONSTRAINT IF EXISTS loan_repayments_member_id_tenant_fkey;
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_borrower_id_tenant_fkey;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_user_id_tenant_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_author_id_tenant_fkey;
ALTER TABLE mpesa_callbacks DROP CONSTRAINT IF EXISTS mpesa_callbacks_transaction_id_tenant_fkey;
ALTER TABLE penalties DROP CONSTRAINT IF EXISTS penalties_member_id_tenant_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_loan_id_tenant_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_member_id_tenant_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_recorded_by_tenant_fkey;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_member_id_tenant_fkey
  FOREIGN KEY (chama_id, member_id) REFERENCES users (chama_id, id) NOT VALID,
  ADD CONSTRAINT attendance_recorded_by_tenant_fkey
  FOREIGN KEY (chama_id, recorded_by) REFERENCES users (chama_id, id) NOT VALID;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_recorded_by_tenant_fkey
  FOREIGN KEY (chama_id, recorded_by) REFERENCES users (chama_id, id) NOT VALID;
ALTER TABLE contributions
  ADD CONSTRAINT contributions_member_id_tenant_fkey
  FOREIGN KEY (chama_id, member_id) REFERENCES users (chama_id, id) NOT VALID,
  ADD CONSTRAINT contributions_recorded_by_tenant_fkey
  FOREIGN KEY (chama_id, recorded_by) REFERENCES users (chama_id, id) NOT VALID;
ALTER TABLE dividends
  ADD CONSTRAINT dividends_member_id_tenant_fkey
  FOREIGN KEY (chama_id, member_id) REFERENCES users (chama_id, id) NOT VALID;
ALTER TABLE invitations
  ADD CONSTRAINT invitations_invited_by_tenant_fkey
  FOREIGN KEY (chama_id, invited_by) REFERENCES users (chama_id, id) NOT VALID;
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_transaction_id_tenant_fkey
  FOREIGN KEY (chama_id, transaction_id) REFERENCES transactions (chama_id, id) NOT VALID;
ALTER TABLE loan_repayments
  ADD CONSTRAINT loan_repayments_loan_id_tenant_fkey
  FOREIGN KEY (chama_id, loan_id) REFERENCES loans (chama_id, id) NOT VALID,
  ADD CONSTRAINT loan_repayments_member_id_tenant_fkey
  FOREIGN KEY (chama_id, member_id) REFERENCES users (chama_id, id) NOT VALID;
ALTER TABLE loans
  ADD CONSTRAINT loans_borrower_id_tenant_fkey
  FOREIGN KEY (chama_id, borrower_id) REFERENCES users (chama_id, id) NOT VALID;
ALTER TABLE memberships
  ADD CONSTRAINT memberships_user_id_tenant_fkey
  FOREIGN KEY (chama_id, user_id) REFERENCES users (chama_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE messages
  ADD CONSTRAINT messages_author_id_tenant_fkey
  FOREIGN KEY (chama_id, author_id) REFERENCES users (chama_id, id) NOT VALID;
ALTER TABLE mpesa_callbacks
  ADD CONSTRAINT mpesa_callbacks_transaction_id_tenant_fkey
  FOREIGN KEY (chama_id, transaction_id) REFERENCES transactions (chama_id, id) NOT VALID;
ALTER TABLE penalties
  ADD CONSTRAINT penalties_member_id_tenant_fkey
  FOREIGN KEY (chama_id, member_id) REFERENCES users (chama_id, id) NOT VALID;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_loan_id_tenant_fkey
  FOREIGN KEY (chama_id, loan_id) REFERENCES loans (chama_id, id) NOT VALID,
  ADD CONSTRAINT transactions_member_id_tenant_fkey
  FOREIGN KEY (chama_id, member_id) REFERENCES users (chama_id, id) NOT VALID,
  ADD CONSTRAINT transactions_recorded_by_tenant_fkey
  FOREIGN KEY (chama_id, recorded_by) REFERENCES users (chama_id, id) NOT VALID;

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_member_id_fkey;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_recorded_by_fkey;
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_recorded_by_fkey;
ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_member_id_fkey;
ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_recorded_by_fkey;
ALTER TABLE dividends DROP CONSTRAINT IF EXISTS dividends_member_id_fkey;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_invited_by_fkey;
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_transaction_id_fkey;
ALTER TABLE loan_repayments DROP CONSTRAINT IF EXISTS loan_repayments_loan_id_fkey;
ALTER TABLE loan_repayments DROP CONSTRAINT IF EXISTS loan_repayments_member_id_fkey;
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_borrower_id_fkey;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_user_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_author_id_fkey;
ALTER TABLE mpesa_callbacks DROP CONSTRAINT IF EXISTS mpesa_callbacks_transaction_id_fkey;
ALTER TABLE penalties DROP CONSTRAINT IF EXISTS penalties_member_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_loan_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_member_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_recorded_by_fkey;

-- PHASE 1 ends here: the installation leaves all 18 tenant constraints NOT VALID.
-- Do not place executable VALIDATE statements in this file or run validation as
-- part of installation. The constraints still reject cross-chama links on new writes.
--
-- PHASE 2 is a separate, manual operator action. Before copying/running any command:
--   1. Complete every read-only typed-link preflight in tenant_integrity_design.md.
--   2. Review all findings; resolve them only through separately approved repairs.
--   3. Require zero unexplained orphans/cross-chama mismatches and confirm all 18
--      constraints below exist with convalidated = false in pg_constraint.
--   4. Complete the JSON relationship backfill/validation and staging tests in the
--      design document. Stop on any failed check; never auto-rewrite source rows.
--   5. Only after the gate passes in staging, run these 18 commands individually
--      in staging, then production after staging verification. Stop at first error.
-- These are comments, not part of the installation SQL:
-- ALTER TABLE attendance VALIDATE CONSTRAINT attendance_member_id_tenant_fkey;
-- ALTER TABLE attendance VALIDATE CONSTRAINT attendance_recorded_by_tenant_fkey;
-- ALTER TABLE audit_log VALIDATE CONSTRAINT audit_log_recorded_by_tenant_fkey;
-- ALTER TABLE contributions VALIDATE CONSTRAINT contributions_member_id_tenant_fkey;
-- ALTER TABLE contributions VALIDATE CONSTRAINT contributions_recorded_by_tenant_fkey;
-- ALTER TABLE dividends VALIDATE CONSTRAINT dividends_member_id_tenant_fkey;
-- ALTER TABLE invitations VALIDATE CONSTRAINT invitations_invited_by_tenant_fkey;
-- ALTER TABLE ledger_entries VALIDATE CONSTRAINT ledger_entries_transaction_id_tenant_fkey;
-- ALTER TABLE loan_repayments VALIDATE CONSTRAINT loan_repayments_loan_id_tenant_fkey;
-- ALTER TABLE loan_repayments VALIDATE CONSTRAINT loan_repayments_member_id_tenant_fkey;
-- ALTER TABLE loans VALIDATE CONSTRAINT loans_borrower_id_tenant_fkey;
-- ALTER TABLE memberships VALIDATE CONSTRAINT memberships_user_id_tenant_fkey;
-- ALTER TABLE messages VALIDATE CONSTRAINT messages_author_id_tenant_fkey;
-- ALTER TABLE mpesa_callbacks VALIDATE CONSTRAINT mpesa_callbacks_transaction_id_tenant_fkey;
-- ALTER TABLE penalties VALIDATE CONSTRAINT penalties_member_id_tenant_fkey;
-- ALTER TABLE transactions VALIDATE CONSTRAINT transactions_loan_id_tenant_fkey;
-- ALTER TABLE transactions VALIDATE CONSTRAINT transactions_member_id_tenant_fkey;
-- ALTER TABLE transactions VALIDATE CONSTRAINT transactions_recorded_by_tenant_fkey;
