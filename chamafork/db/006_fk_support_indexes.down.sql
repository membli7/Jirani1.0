-- Rollback for 006_fk_support_indexes.sql.
DROP INDEX IF EXISTS public.penalties_member_id_idx;
DROP INDEX IF EXISTS public.dividends_member_id_idx;
DROP INDEX IF EXISTS public.invitations_invited_by_idx;
DROP INDEX IF EXISTS public.messages_author_id_idx;
DROP INDEX IF EXISTS public.audit_log_recorded_by_idx;
DROP INDEX IF EXISTS public.loan_repayments_member_id_idx;
DROP INDEX IF EXISTS public.loan_repayments_loan_id_idx;
DROP INDEX IF EXISTS public.mpesa_callbacks_transaction_id_idx;
DROP INDEX IF EXISTS public.ledger_entries_transaction_id_idx;
DROP INDEX IF EXISTS public.transactions_recorded_by_idx;
DROP INDEX IF EXISTS public.transactions_loan_id_idx;
DROP INDEX IF EXISTS public.transactions_member_id_idx;
DROP INDEX IF EXISTS public.attendance_recorded_by_idx;
DROP INDEX IF EXISTS public.attendance_member_id_idx;
DROP INDEX IF EXISTS public.loans_borrower_id_idx;
DROP INDEX IF EXISTS public.contributions_recorded_by_idx;
DROP INDEX IF EXISTS public.contributions_member_id_idx;
