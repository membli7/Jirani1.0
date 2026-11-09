"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const foundation = read("db/001_foundation.sql");
const appTables = read("db/002_app_tables.sql");
const receipts = read("db/004_mpesa_receipts.sql");
const mapper = read("repo/postgres-state.js");
const server = read("server.js");
const elections = read("leadership-elections.js");
const design = read("db/proposals/tenant_integrity_design.md");
const typedProposal = read("db/proposals/tenant_foreign_keys.sql");
const migrationRunner = read("db/migrate.js");
const envExample = read(".env.example");

test("tenant JSON design names fields that exist in the current schema and writer", () => {
  for (const [label, source, patterns] of [
    ["foundation schema", foundation, [/approvals JSONB NOT NULL/]],
    ["application schema", appTables, [/record_data JSONB NOT NULL/g, /CREATE TABLE IF NOT EXISTS attendance_registers/, /CREATE TABLE IF NOT EXISTS audit_log/, /entity_id TEXT/, /CREATE TABLE IF NOT EXISTS messages/, /CREATE TABLE IF NOT EXISTS invitations/, /CREATE TABLE IF NOT EXISTS dividends/, /CREATE TABLE IF NOT EXISTS penalties/]],
    ["state mapper", mapper, [/approvals: JSON\.stringify/, /record_data: storedRecord\(\{ registerId: register\.id, \.\.\.attendee \}\)/, /record\.transactionId/, /invitation\.invitedBy/]],
    ["application writers", server, [/register\.history\.push\(\{ at: recordedAt, by: actor, changes \}\)/, /paidTransactionId/, /payouts: expected/, /recipientId/, /approverId/, /guarantors/, /incomingUserId/, /confirmedBy/]],
    ["election writer", elections, [/candidateIds/, /eligibleVoterIds/, /ballot\.candidateId/, /tiedCandidateIds/, /parentElectionId/, /incomingUserId/]],
  ]) {
    for (const pattern of patterns) assert.match(source, pattern, `${label} should contain ${pattern}`);
  }

  for (const field of [
    "approvals[].approverId", "guarantors[].memberId", "registerId", "createdBy.id",
    "editedBy.id", "history[].by", "history[].changes[].userId", "transactionId",
    "paidTransactionId", "incomingUserId", "outgoingUserId", "proposedBy",
    "confirmedBy", "candidateIds", "eligibleVoterIds", "ballots[].candidateId",
    "parentElectionId", "recipientId", "payouts[].memberId", "entityId",
  ]) assert.ok(design.includes(field), `design catalog should cover ${field}`);
});

test("typed FK installation cannot validate before the preflight gate", () => {
  const executableSql = typedProposal.split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.match(typedProposal, /It covers 18 typed foreign-key columns/);
  assert.doesNotMatch(executableSql, /^\s*ALTER TABLE\s+\w+\s+VALIDATE CONSTRAINT\b/im);
  assert.match(typedProposal, /PHASE 1 ends here: the installation leaves all 18 tenant constraints NOT VALID/);
  assert.match(typedProposal, /Before copying\/running any command:/);
  assert.match(typedProposal, /zero unexplained orphans\/cross-chama mismatches/i);
  assert.match(typedProposal, /Only after the gate passes in staging/);
  assert.match(typedProposal, /Do not rerun this installation after validation/);

  const validationNames = [...typedProposal.matchAll(/^-- ALTER TABLE \w+ VALIDATE CONSTRAINT (\w+);\r?$/gm)]
    .map(match => match[1]);
  assert.equal(validationNames.length, 18, "follow-up phase must list all 18 validations as comments only");
  assert.equal(new Set(validationNames).size, 18, "follow-up phase must not duplicate a validation command");
  assert.deepEqual(validationNames, [
    "attendance_member_id_tenant_fkey", "attendance_recorded_by_tenant_fkey",
    "audit_log_recorded_by_tenant_fkey", "contributions_member_id_tenant_fkey",
    "contributions_recorded_by_tenant_fkey", "dividends_member_id_tenant_fkey",
    "invitations_invited_by_tenant_fkey", "ledger_entries_transaction_id_tenant_fkey",
    "loan_repayments_loan_id_tenant_fkey", "loan_repayments_member_id_tenant_fkey",
    "loans_borrower_id_tenant_fkey", "memberships_user_id_tenant_fkey",
    "messages_author_id_tenant_fkey", "mpesa_callbacks_transaction_id_tenant_fkey",
    "penalties_member_id_tenant_fkey", "transactions_loan_id_tenant_fkey",
    "transactions_member_id_tenant_fkey", "transactions_recorded_by_tenant_fkey",
  ]);
  assert.doesNotMatch(migrationRunner, /tenant_foreign_keys|tenant_integrity_design/);
});

test("both tenant proposals remain unapplied", () => {
  assert.match(typedProposal, /It covers 18 typed foreign-key columns/);
  assert.doesNotMatch(migrationRunner, /tenant_foreign_keys|tenant_integrity_design/);
  assert.doesNotMatch(migrationRunner, /tenant_json_relationships/);
});

test("tenant integrity proposal preserves the existing payment-disabled boundary", () => {
  assert.match(envExample, /^MPESA_C2B_CALLBACKS_ENABLED=0$/m);
  assert.match(design, /Do not enable payments, hosted callbacks, or settlement/);
  assert.doesNotMatch(typedProposal, /ENABLE.*MPESA|REGISTER.*CALLBACK/i);
  assert.match(receipts, /Daraja account references and receipt-level idempotency/);
});
