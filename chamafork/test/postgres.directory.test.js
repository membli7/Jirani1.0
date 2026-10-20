"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const chamas = require("../repo/chamas");

test("tenant directory reads use only the restricted metadata table", async () => {
  let queryText;
  const rows = [{ chama_id: "tenant-id", source_id: "source-id", name: "Test chama" }];
  const result = await chamas.listDirectory({ query: async text => { queryText = text; return { rows }; } });
  assert.match(queryText, /FROM app_chama_directory/);
  assert.doesNotMatch(queryText, /app_list_chamas|FROM chamas\b/i);
  assert.deepEqual(result, rows);
});

test("tenant writes keep the restricted directory synchronized", async () => {
  const statements = [];
  const client = { query: async (text, values) => { statements.push({ text, values }); return { rows: [] }; } };
  const chama = { id: "source-id", name: "Test chama" };
  const state = { settings: {}, idempotency: {}, welfareReserve: 0 };
  await chamas.save(client, chama, state, 4);
  await chamas.remove(client, "tenant-id");
  assert.match(statements[0].text, /INSERT INTO chamas/);
  assert.match(statements[1].text, /INSERT INTO app_chama_directory/);
  assert.deepEqual(statements[1].values.slice(1), ["source-id", "Test chama", 4]);
  assert.match(statements[2].text, /DELETE FROM app_chama_directory/);
  assert.match(statements[3].text, /DELETE FROM chamas/);
});

test("migrations do not grant the tenant directory to every database role", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "db", "002_app_tables.sql"), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS app_chama_directory/);
  assert.doesNotMatch(migration, /GRANT\s+SELECT\s+ON\s+app_chama_directory\s+TO\s+PUBLIC/i);
});
