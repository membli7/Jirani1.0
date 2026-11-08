"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createTenantRepository } = require("../repo/record-repository");

function fakeClient() {
  const queries = [];
  return { queries, async query(sql, values) { queries.push({ sql, values }); return { rows: [] }; } };
}

const repository = createTenantRepository("transactions");

test("tenant replacement validates the complete batch before deleting existing rows", async () => {
  const client = fakeClient();
  await assert.rejects(repository.replace(client, "chama-a", [
    { chama_id: "chama-a", source_id: "a-1", amount: 100 },
    { chama_id: "chama-b", source_id: "b-1", amount: 900 },
  ]), /another chama/);
  assert.deepEqual(client.queries, [], "a mixed-tenant batch must issue no delete or insert");
});

test("tenant replacement validates row shape and SQL columns before deleting", async () => {
  for (const rows of [null, [{ chama_id: "chama-a", "bad-column": "x" }], [null]]) {
    const client = fakeClient();
    await assert.rejects(repository.replace(client, "chama-a", rows));
    assert.deepEqual(client.queries, [], "invalid input must not touch persisted rows");
  }
});

test("valid tenant replacement deletes only after all rows are prepared", async () => {
  const client = fakeClient();
  await repository.replace(client, "chama-a", [
    { chama_id: "chama-a", source_id: "a-1", amount: 100 },
    { chama_id: "chama-a", source_id: "a-2", amount: 200 },
  ]);
  assert.match(client.queries[0].sql, /^DELETE FROM transactions WHERE chama_id = \$1$/);
  assert.equal(client.queries.length, 3);
  assert.deepEqual(client.queries.slice(1).map(query => query.values), [
    ["chama-a", "a-1", 100],
    ["chama-a", "a-2", 200],
  ]);
});
