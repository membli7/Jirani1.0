"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const users = require("../repo/users");
const postgresState = require("../repo/postgres-state");

test("clearing PostgreSQL users is scoped to the requested chama", async () => {
  let query;
  const client = { query: async (...args) => { query = args; } };
  await users.clear(client, "tenant-a");
  assert.deepEqual(query, ["DELETE FROM users WHERE chama_id = $1", ["tenant-a"]]);
});

test("loading PostgreSQL state restores account records from the users table", async () => {
  const tenantId = "00000000-0000-4000-8000-000000000001";
  const user = { id: "user-a", name: "Example Member", role: "member", status: "active", chamaId: "chama-a" };
  const queries = [];
  const client = {
    query: async (sql, params = []) => {
      queries.push(sql);
      if (sql.includes("SELECT name, settings, payment_policy")) {
        return { rows: [{ name: "Example Chama", settings: {}, payment_policy: {}, state_data: {}, record_data: { id: "chama-a", name: "Example Chama" }, record_order: 0 }] };
      }
      if (sql.includes("SELECT * FROM users ORDER BY")) {
        return { rows: [{ ...user, record_data: user, record_order: 0 }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    query: async () => ({ rows: [{ chama_id: tenantId, source_id: "chama-a", name: "Example Chama", record_order: 0 }] }),
    connect: async () => client,
  };

  const state = await postgresState.loadState(pool);
  assert.deepEqual(state.users, [user]);
  assert.ok(queries.includes("COMMIT"));
});
