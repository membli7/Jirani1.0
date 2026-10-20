-- Application records are stored in typed tenant tables. record_data carries
-- non-monetary fields that are not part of the relational query surface.

ALTER TABLE chamas
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS record_order INTEGER NOT NULL DEFAULT 0;
UPDATE chamas SET source_id = chama_id::text WHERE source_id IS NULL;
ALTER TABLE chamas ALTER COLUMN source_id SET NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS chama_id UUID REFERENCES chamas(chama_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS share_capital_cents BIGINT NOT NULL DEFAULT 0 CHECK (share_capital_cents >= 0),
  ADD COLUMN IF NOT EXISTS record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS record_order INTEGER NOT NULL DEFAULT 0;
UPDATE users SET source_id = id::text WHERE source_id IS NULL;
ALTER TABLE users ALTER COLUMN source_id SET NOT NULL;
UPDATE users user_row
SET chama_id = chama.chama_id
FROM chamas chama
WHERE user_row.chama_id IS NULL
  AND split_part(user_row.source_id, ':', 1) = chama.source_id;
UPDATE users user_row
SET chama_id = membership.chama_id
FROM memberships membership
WHERE user_row.chama_id IS NULL
  AND membership.user_id = user_row.id;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE chama_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot assign existing users to a chama; resolve orphaned user rows before migration.';
  END IF;
END $$;
ALTER TABLE users ALTER COLUMN chama_id SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;
DROP INDEX IF EXISTS users_phone_idx;
DROP INDEX IF EXISTS users_source_idx;
CREATE INDEX IF NOT EXISTS tenant_users_phone_idx ON users (chama_id, phone);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_source_idx ON users (chama_id, source_id);

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS record_order INTEGER NOT NULL DEFAULT 0;
UPDATE memberships SET source_id = id::text WHERE source_id IS NULL;
ALTER TABLE memberships ALTER COLUMN source_id SET NOT NULL;

ALTER TABLE contributions
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS record_order INTEGER NOT NULL DEFAULT 0;
UPDATE contributions SET source_id = id::text WHERE source_id IS NULL;
ALTER TABLE contributions ALTER COLUMN source_id SET NOT NULL;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS record_order INTEGER NOT NULL DEFAULT 0;
UPDATE loans SET source_id = id::text WHERE source_id IS NULL;
ALTER TABLE loans ALTER COLUMN source_id SET NOT NULL;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS record_order INTEGER NOT NULL DEFAULT 0;
UPDATE attendance SET source_id = id::text WHERE source_id IS NULL;
ALTER TABLE attendance ALTER COLUMN source_id SET NOT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS interest_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS principal_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS welfare_amount_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_capital_amount_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_amount_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS record_order INTEGER NOT NULL DEFAULT 0;
UPDATE transactions SET source_id = id::text WHERE source_id IS NULL;
ALTER TABLE transactions ALTER COLUMN source_id SET NOT NULL;

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS record_order INTEGER NOT NULL DEFAULT 0;
UPDATE ledger_entries SET source_id = id::text WHERE source_id IS NULL;
ALTER TABLE ledger_entries ALTER COLUMN source_id SET NOT NULL;

ALTER TABLE mpesa_callbacks
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS amount_cents BIGINT,
  ADD COLUMN IF NOT EXISTS record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS record_order INTEGER NOT NULL DEFAULT 0;
UPDATE mpesa_callbacks SET source_id = id::text WHERE source_id IS NULL;
ALTER TABLE mpesa_callbacks ALTER COLUMN source_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS loan_repayments (
  id UUID PRIMARY KEY,
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  record_kind TEXT NOT NULL DEFAULT 'event' CHECK (record_kind IN ('event', 'leadership')),
  loan_id UUID REFERENCES loans(id),
  member_id UUID REFERENCES users(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  principal_cents BIGINT NOT NULL DEFAULT 0 CHECK (principal_cents >= 0),
  interest_cents BIGINT NOT NULL DEFAULT 0 CHECK (interest_cents >= 0),
  method TEXT NOT NULL DEFAULT 'Cash',
  reference_number TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chama_id, source_id)
);

CREATE TABLE IF NOT EXISTS attendance_registers (
  id UUID PRIMARY KEY,
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chama_id, source_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY,
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  record_kind TEXT NOT NULL DEFAULT 'event' CHECK (record_kind IN ('event', 'leadership')),
  event_type TEXT NOT NULL,
  entity_id TEXT,
  recorded_by UUID REFERENCES users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chama_id, source_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  author_id UUID REFERENCES users(id),
  body TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chama_id, source_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY,
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  requested_role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'invited',
  code_hash TEXT,
  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chama_id, source_id)
);

CREATE TABLE IF NOT EXISTS dividends (
  id UUID PRIMARY KEY,
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  record_kind TEXT NOT NULL CHECK (record_kind IN ('cycle', 'payout')),
  member_id UUID REFERENCES users(id),
  cycle_start DATE,
  cycle_end DATE,
  amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chama_id, source_id)
);

CREATE TABLE IF NOT EXISTS penalties (
  id UUID PRIMARY KEY,
  chama_id UUID NOT NULL REFERENCES chamas(chama_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  member_id UUID REFERENCES users(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'outstanding',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chama_id, source_id)
);

CREATE INDEX IF NOT EXISTS tenant_chamas_source_idx ON chamas (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_source_idx ON memberships (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_contributions_source_idx ON contributions (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_loans_source_idx ON loans (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_attendance_source_idx ON attendance (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_transactions_source_idx ON transactions (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_ledger_entries_source_idx ON ledger_entries (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_mpesa_callbacks_source_idx ON mpesa_callbacks (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_loan_repayments_source_idx ON loan_repayments (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_attendance_registers_source_idx ON attendance_registers (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_audit_log_source_idx ON audit_log (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_messages_source_idx ON messages (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_invitations_source_idx ON invitations (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_dividends_source_idx ON dividends (chama_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_penalties_source_idx ON penalties (chama_id, source_id);
CREATE INDEX IF NOT EXISTS users_source_idx ON users (source_id);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'chamas', 'users', 'memberships', 'contributions', 'loans', 'attendance',
    'transactions', 'ledger_entries', 'mpesa_callbacks', 'loan_repayments',
    'attendance_registers', 'audit_log', 'messages', 'invitations',
    'dividends', 'penalties'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (chama_id = app_current_chama_id()) WITH CHECK (chama_id = app_current_chama_id())',
      table_name
    );
  END LOOP;
END $$;

-- A global control-plane index lists only tenant identifiers and names. It
-- contains no member or financial records, so tenant data remains under RLS.
CREATE TABLE IF NOT EXISTS app_chama_directory (
  tenant_id UUID PRIMARY KEY,
  source_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  record_order INTEGER NOT NULL DEFAULT 0
);
INSERT INTO app_chama_directory (tenant_id, source_id, display_name, record_order)
SELECT chama_id, source_id, name, record_order FROM chamas
ON CONFLICT (tenant_id) DO UPDATE SET source_id = EXCLUDED.source_id, display_name = EXCLUDED.display_name, record_order = EXCLUDED.record_order;
