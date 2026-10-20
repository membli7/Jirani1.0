-- Daraja account references and receipt-level idempotency.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_account_number_unique
  ON users (chama_id, lower(trim(account_number)))
  WHERE account_number IS NOT NULL AND trim(account_number) <> '';

ALTER TABLE mpesa_callbacks
  ADD COLUMN IF NOT EXISTS mpesa_receipt_number TEXT;

ALTER TABLE chamas
  ADD COLUMN IF NOT EXISTS payment_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS mpesa_callbacks_receipt_number_unique
  ON mpesa_callbacks (mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL AND trim(mpesa_receipt_number) <> '';
