-- Safe rollback of write enforcement only.
-- Keep the reservation table, all keys, and the per-chama callback index so rollback cannot make a receipt reusable.

DROP TRIGGER IF EXISTS transactions_receipt_reference_guard ON public.transactions;
DROP TRIGGER IF EXISTS contributions_receipt_reference_guard ON public.contributions;
DROP TRIGGER IF EXISTS loan_repayments_receipt_reference_guard ON public.loan_repayments;
DROP TRIGGER IF EXISTS mpesa_callbacks_receipt_reference_guard ON public.mpesa_callbacks;

DROP FUNCTION IF EXISTS public.reserve_transaction_receipt_reference();
DROP FUNCTION IF EXISTS public.reserve_mpesa_receipt_reference();

-- Intentionally retain financial_reference_reservations, its RLS policy, its append-only guard,
-- and tenant_mpesa_callbacks_receipt_number_unique; none of these rows or protections are dropped.
