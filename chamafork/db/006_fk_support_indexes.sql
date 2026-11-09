-- These child-side indexes support FK checks during saveState()'s repeated tenant
-- replacement, where dependent rows are cleared before referenced users, loans,
-- and transactions are deleted. Existing tenant-leading indexes already cover
-- chama_id reads/deletes; the runtime has no direct query filters on these keys.
--
-- The migration runner wraps all migrations in one transaction, so CONCURRENTLY
-- is not valid here. Apply during a low-write window. Fail fast on lock contention
-- instead of waiting indefinitely while application writes queue behind the DDL.
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS contributions_member_id_idx
  ON contributions (member_id);
CREATE INDEX IF NOT EXISTS contributions_recorded_by_idx
  ON contributions (recorded_by)
  WHERE recorded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS loans_borrower_id_idx
  ON loans (borrower_id);

CREATE INDEX IF NOT EXISTS attendance_member_id_idx
  ON attendance (member_id);
CREATE INDEX IF NOT EXISTS attendance_recorded_by_idx
  ON attendance (recorded_by)
  WHERE recorded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_member_id_idx
  ON transactions (member_id)
  WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_loan_id_idx
  ON transactions (loan_id)
  WHERE loan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_recorded_by_idx
  ON transactions (recorded_by)
  WHERE recorded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS ledger_entries_transaction_id_idx
  ON ledger_entries (transaction_id)
  WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mpesa_callbacks_transaction_id_idx
  ON mpesa_callbacks (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS loan_repayments_loan_id_idx
  ON loan_repayments (loan_id)
  WHERE loan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS loan_repayments_member_id_idx
  ON loan_repayments (member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_log_recorded_by_idx
  ON audit_log (recorded_by)
  WHERE recorded_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_author_id_idx
  ON messages (author_id)
  WHERE author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invitations_invited_by_idx
  ON invitations (invited_by)
  WHERE invited_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS dividends_member_id_idx
  ON dividends (member_id)
  WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS penalties_member_id_idx
  ON penalties (member_id)
  WHERE member_id IS NOT NULL;
