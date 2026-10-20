-- Phase 1 foundation. Run this migration as the database owner.
-- Application connections must use a role that does not have BYPASSRLS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS chamas (
  chama_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  pin_hash TEXT,
  must_change_pin BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('chairperson', 'secretary', 'treasurer', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chama_id, user_id)
);

CREATE TABLE IF NOT EXISTS contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES users(id),
  recorded_by UUID REFERENCES users(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  welfare_amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (welfare_amount_cents >= 0),
  share_capital_amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (share_capital_amount_cents >= 0),
  penalty_amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (penalty_amount_cents >= 0),
  method TEXT NOT NULL,
  contribution_month DATE,
  status TEXT NOT NULL DEFAULT 'confirmed',
  reference_number TEXT,
  note TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES users(id),
  principal_cents BIGINT NOT NULL CHECK (principal_cents >= 0),
  outstanding_cents BIGINT NOT NULL DEFAULT 0 CHECK (outstanding_cents >= 0),
  months INTEGER NOT NULL CHECK (months IN (1, 2, 3, 6)),
  interest_model TEXT NOT NULL DEFAULT 'reducing',
  status TEXT NOT NULL DEFAULT 'pending',
  approvals JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES users(id),
  meeting_date DATE NOT NULL,
  present BOOLEAN NOT NULL,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chama_id, member_id, meeting_date)
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  member_id UUID REFERENCES users(id),
  loan_id UUID REFERENCES loans(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  payment_type TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  reference_number TEXT,
  recorded_by UUID REFERENCES users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id),
  account TEXT NOT NULL,
  debit_cents BIGINT NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents BIGINT NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit_cents = 0 OR credit_cents = 0)
);

CREATE TABLE IF NOT EXISTS mpesa_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  callback_key TEXT NOT NULL,
  transaction_id UUID REFERENCES transactions(id),
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chama_id, callback_key)
);

CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id);
CREATE INDEX IF NOT EXISTS tenant_contributions_idx ON contributions (chama_id, recorded_at);
CREATE INDEX IF NOT EXISTS tenant_loans_idx ON loans (chama_id, created_at);
CREATE INDEX IF NOT EXISTS tenant_attendance_idx ON attendance (chama_id, meeting_date);
CREATE INDEX IF NOT EXISTS tenant_transactions_idx ON transactions (chama_id, occurred_at);
CREATE INDEX IF NOT EXISTS tenant_ledger_entries_idx ON ledger_entries (chama_id, created_at);
CREATE INDEX IF NOT EXISTS tenant_mpesa_callbacks_idx ON mpesa_callbacks (chama_id, received_at);

CREATE OR REPLACE FUNCTION app_current_chama_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.chama_id', true), '')::uuid
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['chamas', 'memberships', 'contributions', 'loans', 'attendance', 'transactions', 'ledger_entries', 'mpesa_callbacks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (chama_id = app_current_chama_id()) WITH CHECK (chama_id = app_current_chama_id())', table_name);
  END LOOP;
END $$;
