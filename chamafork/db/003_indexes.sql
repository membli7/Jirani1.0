CREATE INDEX IF NOT EXISTS tenant_transactions_idx
  ON transactions (chama_id, occurred_at);

CREATE INDEX IF NOT EXISTS tenant_loans_idx
  ON loans (chama_id, created_at);

CREATE INDEX IF NOT EXISTS tenant_attendance_created_at_idx
  ON attendance (chama_id, created_at);

CREATE INDEX IF NOT EXISTS memberships_user_idx
  ON memberships (user_id);
