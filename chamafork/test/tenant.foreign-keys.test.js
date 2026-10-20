"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { createPostgresPool } = require("../db/postgres");

const databaseUrl = process.env.NODE_ENV === "production" ? null : process.env.TENANT_FK_TEST_DATABASE_URL;
const migrationFile = path.join(__dirname, "..", "db", "proposals", "tenant_foreign_keys.sql");
const references = [
  ["memberships", "user_id", "users", "memberships_user_id_fkey", true],
  ["contributions", "member_id", "users", "contributions_member_id_fkey"],
  ["contributions", "recorded_by", "users", "contributions_recorded_by_fkey"],
  ["loans", "borrower_id", "users", "loans_borrower_id_fkey"],
  ["attendance", "member_id", "users", "attendance_member_id_fkey"],
  ["attendance", "recorded_by", "users", "attendance_recorded_by_fkey"],
  ["transactions", "member_id", "users", "transactions_member_id_fkey"],
  ["transactions", "loan_id", "loans", "transactions_loan_id_fkey"],
  ["transactions", "recorded_by", "users", "transactions_recorded_by_fkey"],
  ["ledger_entries", "transaction_id", "transactions", "ledger_entries_transaction_id_fkey"],
  ["mpesa_callbacks", "transaction_id", "transactions", "mpesa_callbacks_transaction_id_fkey"],
  ["loan_repayments", "loan_id", "loans", "loan_repayments_loan_id_fkey"],
  ["loan_repayments", "member_id", "users", "loan_repayments_member_id_fkey"],
  ["audit_log", "recorded_by", "users", "audit_log_recorded_by_fkey"],
  ["messages", "author_id", "users", "messages_author_id_fkey"],
  ["invitations", "invited_by", "users", "invitations_invited_by_fkey"],
  ["dividends", "member_id", "users", "dividends_member_id_fkey"],
  ["penalties", "member_id", "users", "penalties_member_id_fkey"],
];

test("tenant foreign keys accept same-chama links, reject cross-chama links, and fail safely on existing mismatches", { skip: !databaseUrl }, async () => {
  assert.equal(references.length, 18);
  const pool = createPostgresPool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE users (id UUID PRIMARY KEY, chama_id UUID NOT NULL) ON COMMIT DROP");
    await client.query("CREATE TEMP TABLE loans (id UUID PRIMARY KEY, chama_id UUID NOT NULL, borrower_id UUID, CONSTRAINT loans_borrower_id_fkey FOREIGN KEY (borrower_id) REFERENCES users(id)) ON COMMIT DROP");
    await client.query("CREATE TEMP TABLE transactions (id UUID PRIMARY KEY, chama_id UUID NOT NULL, member_id UUID, loan_id UUID, recorded_by UUID, CONSTRAINT transactions_member_id_fkey FOREIGN KEY (member_id) REFERENCES users(id), CONSTRAINT transactions_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES loans(id), CONSTRAINT transactions_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id)) ON COMMIT DROP");

    const tableReferences = new Map();
    for (const [table, column, parent, oldConstraint, cascade] of references) {
      if (table === "loans" || table === "transactions") continue;
      if (!tableReferences.has(table)) tableReferences.set(table, []);
      tableReferences.get(table).push({ column, parent, oldConstraint, cascade });
    }
    for (const [table, columns] of tableReferences) {
      const fields = columns.map(item => `${item.column} UUID`).join(", ");
      const constraints = columns.map(item => `CONSTRAINT ${item.oldConstraint} FOREIGN KEY (${item.column}) REFERENCES ${item.parent}(id)${item.cascade ? " ON DELETE CASCADE" : ""}`).join(", ");
      await client.query(`CREATE TEMP TABLE ${table} (id UUID PRIMARY KEY, chama_id UUID NOT NULL, ${fields}, ${constraints}) ON COMMIT DROP`);
    }

    const chamaA = "00000000-0000-4000-8000-000000000001";
    const chamaB = "00000000-0000-4000-8000-000000000002";
    const userA = "10000000-0000-4000-8000-000000000001";
    const userB = "10000000-0000-4000-8000-000000000002";
    const loanA = "20000000-0000-4000-8000-000000000001";
    const loanB = "20000000-0000-4000-8000-000000000002";
    const transactionA = "30000000-0000-4000-8000-000000000001";
    const transactionB = "30000000-0000-4000-8000-000000000002";

    await client.query("INSERT INTO users (id, chama_id) VALUES ($1, $2), ($3, $4)", [userA, chamaA, userB, chamaB]);
    await client.query("INSERT INTO loans (id, chama_id, borrower_id) VALUES ($1, $2, $3), ($4, $5, $6)", [loanA, chamaA, userA, loanB, chamaB, userB]);
    await client.query("INSERT INTO transactions (id, chama_id, member_id, loan_id, recorded_by) VALUES ($1, $2, $3, $4, $3), ($5, $6, $7, $8, $7)", [transactionA, chamaA, userA, loanA, transactionB, chamaB, userB, loanB]);

    const rowIds = new Map();
    for (const [table, column] of references) {
      if (!rowIds.has(table)) rowIds.set(table, cryptoRandomUUID());
      const parentId = table === "loans" ? userA : column === "loan_id" ? loanA : column === "transaction_id" ? transactionA : userA;
      if (table === "loans" || table === "transactions") continue;
      await client.query(`INSERT INTO ${table} (id, chama_id, ${column}) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET ${column} = EXCLUDED.${column}`, [rowIds.get(table), chamaA, parentId]);
    }

    await client.query(fs.readFileSync(migrationFile, "utf8"));
    await client.query(fs.readFileSync(migrationFile, "utf8"));

    const userColumns = new Set(["user_id", "member_id", "recorded_by", "borrower_id", "author_id", "invited_by"]);
    for (let index = 0; index < references.length; index += 1) {
      const [table, column] = references[index];
      const rowId = table === "loans" ? loanA : table === "transactions" ? transactionA : rowIds.get(table);
      const sameChamaId = userColumns.has(column) ? userA : column === "loan_id" ? loanA : transactionA;
      const crossChamaId = userColumns.has(column) ? userB : column === "loan_id" ? loanB : transactionB;
      await client.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [sameChamaId, rowId]);
      await client.query("SAVEPOINT tenant_fk_probe");
      let rejected = false;
      try {
        await client.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [crossChamaId, rowId]);
      } catch (error) {
        if (error.code !== "23503") throw error;
        rejected = true;
      }
      await client.query("ROLLBACK TO SAVEPOINT tenant_fk_probe");
      await client.query("RELEASE SAVEPOINT tenant_fk_probe");
      assert.equal(rejected, true, `${table}.${column} must reject a reference from another chama`);
    }

    const membershipDelete = await client.query("SELECT confdeltype FROM pg_constraint WHERE conname = 'memberships_user_id_tenant_fkey'");
    assert.equal(membershipDelete.rows[0]?.confdeltype, "c", "membership cascade delete behavior must be preserved");

    const attendanceRowId = rowIds.get("attendance");
    await client.query("ALTER TABLE attendance DROP CONSTRAINT attendance_member_id_tenant_fkey");
    await client.query("UPDATE attendance SET member_id = $1 WHERE id = $2", [userB, attendanceRowId]);
    await client.query("SAVEPOINT existing_mismatch_probe");
    let validationRejected = false;
    try {
      await client.query(fs.readFileSync(migrationFile, "utf8"));
    } catch (error) {
      if (error.code !== "23503") throw error;
      validationRejected = true;
    }
    await client.query("ROLLBACK TO SAVEPOINT existing_mismatch_probe");
    await client.query("RELEASE SAVEPOINT existing_mismatch_probe");
    assert.equal(validationRejected, true, "migration validation must stop when existing cross-chama rows are found");
    const preservedMismatch = await client.query("SELECT chama_id, member_id FROM attendance WHERE id = $1", [attendanceRowId]);
    assert.equal(preservedMismatch.rows[0]?.chama_id, chamaA);
    assert.equal(preservedMismatch.rows[0]?.member_id, userB, "failed validation must not silently rewrite existing values");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    await pool.end();
  }
});

function cryptoRandomUUID() {
  return require("node:crypto").randomUUID();
}
