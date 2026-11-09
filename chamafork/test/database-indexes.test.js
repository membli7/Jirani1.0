"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const migrationPath = path.join(__dirname, "..", "db", "006_fk_support_indexes.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const runner = fs.readFileSync(path.join(__dirname, "..", "db", "migrate.js"), "utf8");

const expected = [
  ["contributions_member_id_idx", "contributions", "member_id", false],
  ["contributions_recorded_by_idx", "contributions", "recorded_by", true],
  ["loans_borrower_id_idx", "loans", "borrower_id", false],
  ["attendance_member_id_idx", "attendance", "member_id", false],
  ["attendance_recorded_by_idx", "attendance", "recorded_by", true],
  ["transactions_member_id_idx", "transactions", "member_id", true],
  ["transactions_loan_id_idx", "transactions", "loan_id", true],
  ["transactions_recorded_by_idx", "transactions", "recorded_by", true],
  ["ledger_entries_transaction_id_idx", "ledger_entries", "transaction_id", true],
  ["mpesa_callbacks_transaction_id_idx", "mpesa_callbacks", "transaction_id", true],
  ["loan_repayments_loan_id_idx", "loan_repayments", "loan_id", true],
  ["loan_repayments_member_id_idx", "loan_repayments", "member_id", true],
  ["audit_log_recorded_by_idx", "audit_log", "recorded_by", true],
  ["messages_author_id_idx", "messages", "author_id", true],
  ["invitations_invited_by_idx", "invitations", "invited_by", true],
  ["dividends_member_id_idx", "dividends", "member_id", true],
  ["penalties_member_id_idx", "penalties", "member_id", true],
];

test("FK support indexes lead with their referencing columns and migration is transaction-safe", () => {
  const actual = [...migration.matchAll(
    /CREATE INDEX IF NOT EXISTS ([a-z_]+)\s+ON ([a-z_]+)\s*\(\s*([a-z_]+)\s*\)(?:\s+WHERE\s+([a-z_]+)\s+IS NOT NULL)?\s*;/gi,
  )].map(([, name, table, column, predicateColumn]) => [name, table, column, Boolean(predicateColumn)]);

  assert.deepEqual(actual, expected);
  for (const [name, , column, nullable] of expected) {
    const definition = migration.match(new RegExp(`CREATE INDEX IF NOT EXISTS ${name}\\s+ON [a-z_]+\\s*\\(\\s*([a-z_]+)\\s*\\)(?:\\s+WHERE\\s+([a-z_]+)\\s+IS NOT NULL)?\\s*;`, "i"));
    assert.ok(definition, `${name} is defined`);
    assert.equal(definition[1], column, `${name} leads with its FK column`);
    assert.equal(Boolean(definition[2]), nullable, `${name} uses a partial predicate only when its FK is nullable`);
    if (nullable) assert.equal(definition[2], column, `${name} excludes NULL values from its index`);
  }

  assert.match(runner, /005_receipt_reference_reservations\.sql",\s*"006_fk_support_indexes\.sql"/);
  assert.match(migration, /SET LOCAL lock_timeout = '5s'/);
  assert.doesNotMatch(migration, /CREATE\s+INDEX\s+CONCURRENTLY/i);
});
