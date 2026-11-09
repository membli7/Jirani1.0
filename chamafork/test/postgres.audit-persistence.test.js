"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const postgresState = require("../repo/postgres-state");

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";

function memoryPool() {
  const directory = new Map([
    [TENANT_A, { tenant_id: TENANT_A, source_id: "chama-a", display_name: "Chama A", record_order: 0 }],
    [TENANT_B, { tenant_id: TENANT_B, source_id: "chama-b", display_name: "Chama B", record_order: 1 }],
  ]);
  const chamas = new Map();
  const tables = new Map();

  async function query(sql, values = []) {
    const statement = String(sql).replace(/\s+/g, " ").trim();
    if (statement.startsWith("SELECT tenant_id AS chama_id, source_id, display_name AS name,")) {
      return { rows: [...directory.values()].map(row => ({
        chama_id: row.tenant_id,
        source_id: row.source_id,
        name: row.display_name,
        record_data: {},
        state_data: {},
        record_order: row.record_order,
      })).sort((left, right) => left.record_order - right.record_order || left.chama_id.localeCompare(right.chama_id)) };
    }
    if (statement.startsWith("SELECT name, settings, payment_policy, state_data, record_data, record_order FROM chamas WHERE chama_id = $1")) {
      const row = chamas.get(values[0]);
      return { rows: row ? [structuredClone(row)] : [] };
    }
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(statement) || statement.startsWith("SELECT set_config(")) {
      return { rows: [] };
    }

    let match = statement.match(/^SELECT \* FROM ([a-z_]+) WHERE chama_id = \$1 ORDER BY record_order, source_id$/i);
    if (match) {
      return { rows: (tables.get(match[1]) || []).filter(row => row.chama_id === values[0])
        .map(row => structuredClone(row))
        .sort((left, right) => (left.record_order || 0) - (right.record_order || 0) || String(left.source_id).localeCompare(String(right.source_id))) };
    }

    match = statement.match(/^DELETE FROM app_chama_directory WHERE tenant_id = \$1$/i);
    if (match) {
      directory.delete(values[0]);
      return { rows: [] };
    }
    match = statement.match(/^DELETE FROM chamas WHERE chama_id = \$1$/i);
    if (match) {
      chamas.delete(values[0]);
      return { rows: [] };
    }
    match = statement.match(/^DELETE FROM ([a-z_]+) WHERE chama_id = \$1$/i);
    if (match) {
      tables.set(match[1], (tables.get(match[1]) || []).filter(row => row.chama_id !== values[0]));
      return { rows: [] };
    }

    if (statement.startsWith("INSERT INTO chamas (")) {
      const [chama_id, source_id, name, settings, state_data, record_data, record_order] = values;
      chamas.set(chama_id, { chama_id, source_id, name, settings, state_data, record_data, record_order, payment_policy: {} });
      return { rows: [] };
    }
    if (statement.startsWith("INSERT INTO app_chama_directory (")) {
      const [tenant_id, source_id, display_name, record_order] = values;
      directory.set(tenant_id, { tenant_id, source_id, display_name, record_order });
      return { rows: [] };
    }

    match = statement.match(/^INSERT INTO ([a-z_]+) \(([^)]+)\) VALUES \(/i);
    if (match) {
      const row = Object.fromEntries(match[2].split(",").map((column, index) => [column.trim(), values[index]]));
      if (!tables.has(match[1])) tables.set(match[1], []);
      tables.get(match[1]).push(row);
      return { rows: [] };
    }

    throw new Error(`Unexpected test SQL: ${statement}`);
  }

  return {
    query,
    connect: async () => ({ query, release() {} }),
    rows(table) { return (tables.get(table) || []).map(row => structuredClone(row)); },
  };
}

function fixtureState() {
  const state = postgresState.stateTemplate();
  state.chamas = [
    { id: "chama-a", name: "Chama A" },
    { id: "chama-b", name: "Chama B" },
  ];
  state.users = [
    { id: "member-a", name: "Member A", role: "member", status: "active", chamaId: "chama-a" },
    { id: "treasurer-a", name: "Treasurer A", role: "treasurer", status: "active", chamaId: "chama-a" },
    { id: "chair-a", name: "Chair A", role: "chairperson", status: "active", chamaId: "chama-a" },
    { id: "member-b", name: "Member B", role: "member", status: "active", chamaId: "chama-b" },
    { id: "treasurer-b", name: "Treasurer B", role: "treasurer", status: "active", chamaId: "chama-b" },
  ];
  state.transactions = [
    { id: "contribution-tx", memberId: "member-a", recordedBy: "treasurer-a", amount: 500, paymentType: "Monthly Contribution", method: "Cash", at: "2026-10-05T09:00:00.000Z", chamaId: "chama-a" },
    { id: "repayment-tx", memberId: "member-a", recordedBy: "treasurer-a", loanId: "loan-repaid", amount: 100, paymentType: "Loan Repayment", method: "Cash", at: "2026-10-06T09:00:00.000Z", chamaId: "chama-a" },
    { id: "other-tx", memberId: "member-b", recordedBy: "treasurer-b", amount: 100, paymentType: "Payment", method: "Cash", at: "2026-10-07T09:00:00.000Z", chamaId: "chama-b" },
  ];
  state.loans = [
    { id: "loan-requested", memberId: "member-a", amount: 200, status: "approved", chamaId: "chama-a" },
    { id: "loan-repaid", memberId: "member-a", amount: 100, outstanding: 0, status: "repaid", chamaId: "chama-a" },
  ];
  state.auditLog = [
    { id: "event-contribution", type: "contribution.recorded", entityId: "contribution-tx", at: "2026-10-05T09:00:00.000Z", by: { id: "treasurer-a", name: "Treasurer A", role: "treasurer" }, amount: 500 },
    { id: "event-repayment", type: "loan.repaid", entityId: "loan-repaid", at: "2026-10-06T09:00:00.000Z", by: { id: "treasurer-a", name: "Treasurer A", role: "treasurer" }, amount: 100 },
    { id: "event-loan-request", type: "loan.requested", entityId: "loan-requested", at: "2026-10-07T09:00:00.000Z", by: { id: "member-a", name: "Member A", role: "member" }, amount: 200 },
    { id: "event-loan-approval", type: "loan.decided", entityId: "loan-requested", at: "2026-10-08T09:00:00.000Z", by: { id: "chair-a", name: "Chair A", role: "chairperson" }, decision: "approve", status: "approved" },
    { id: "event-other-tenant", type: "payment.recorded", entityId: "other-tx", at: "2026-10-09T09:00:00.000Z", by: { id: "treasurer-b", name: "Treasurer B", role: "treasurer" }, amount: 100 },
  ];
  return state;
}

test("PostgreSQL save/reload preserves ledger entries across repeated state saves", async () => {
  assert.deepEqual(postgresState.stateTemplate().ledgerEntries, []);
  const pool = memoryPool();
  const state = fixtureState();
  const ledgerEntries = [
    {
      id: "ledger-entry-a", chamaId: "chama-a", transactionId: "contribution-tx",
      account: "test-account-a", debit: 12.34, credit: 0,
      description: "synthetic persistence marker A", createdAt: "2026-10-05T09:00:00.000Z",
    },
    {
      id: "ledger-entry-b", chamaId: "chama-b", transactionId: "other-tx",
      account: "test-account-b", debit: 0, credit: 56.78,
      description: "synthetic persistence marker B", createdAt: "2026-10-07T09:00:00.000Z",
    },
  ];
  state.ledgerEntries = ledgerEntries;

  await postgresState.saveState(pool, state);
  let loaded = await postgresState.loadState(pool);
  assert.deepEqual(loaded.ledgerEntries, ledgerEntries);
  assert.equal(pool.rows("ledger_entries").length, ledgerEntries.length);
  assert.deepEqual(pool.rows("ledger_entries").map(row => row.chama_id).sort(), [TENANT_A, TENANT_B]);

  await postgresState.saveState(pool, loaded);
  loaded = await postgresState.loadState(pool);
  assert.deepEqual(loaded.ledgerEntries, ledgerEntries);
  assert.equal(pool.rows("ledger_entries").length, ledgerEntries.length);
});

test("PostgreSQL save/reload retains financial audit events and keeps their existing event JSON format", async () => {
  const pool = memoryPool();
  await postgresState.saveState(pool, fixtureState());

  const rawRows = pool.rows("audit_log");
  assert.equal(rawRows.filter(row => row.chama_id === TENANT_A).length, 4);
  assert.equal(rawRows.filter(row => row.chama_id === TENANT_B).length, 1);
  for (const row of rawRows) assert.equal(Object.hasOwn(row.record_data, "chamaId"), false);

  const expected = [
    ["contribution.recorded", "event-contribution"],
    ["loan.repaid", "event-repayment"],
    ["loan.requested", "event-loan-request"],
    ["loan.decided", "event-loan-approval"],
  ];
  let loaded = await postgresState.loadState(pool);
  for (const [type, id] of expected) {
    const event = loaded.auditLog.find(item => item.id === id);
    assert.ok(event, `${type} should survive save/reload`);
    assert.equal(event.type, type);
    assert.equal(event.chamaId, "chama-a");
  }
  assert.equal(loaded.auditLog.find(item => item.id === "event-loan-approval").decision, "approve");
  assert.ok(loaded.transactions.some(item => item.id === "contribution-tx"));
  assert.ok(loaded.transactions.some(item => item.id === "repayment-tx"));
  assert.ok(loaded.loans.some(item => item.id === "loan-requested"));
  assert.ok(loaded.loans.some(item => item.id === "loan-repaid"));
  assert.equal(loaded.auditLog.find(item => item.id === "event-other-tenant").chamaId, "chama-b");

  await postgresState.saveState(pool, loaded);
  loaded = await postgresState.loadState(pool);
  for (const [type, id] of expected) assert.equal(loaded.auditLog.find(item => item.id === id)?.type, type);
  for (const row of pool.rows("audit_log")) assert.equal(Object.hasOwn(row.record_data, "chamaId"), false);
});

test("PostgreSQL save rejects an unscoped audit event when its actor belongs to multiple chamas", async () => {
  const state = postgresState.stateTemplate();
  state.chamas = [{ id: "chama-a", name: "Chama A" }, { id: "chama-b", name: "Chama B" }];
  state.users = [
    { id: "shared-actor", name: "Shared A", chamaId: "chama-a" },
    { id: "shared-actor", name: "Shared B", chamaId: "chama-b" },
  ];
  state.auditLog = [{ id: "ambiguous-event", type: "test.event", by: { id: "shared-actor" } }];

  await assert.rejects(postgresState.saveState(memoryPool(), state), /Cannot safely assign audit event ambiguous-event/);
});
