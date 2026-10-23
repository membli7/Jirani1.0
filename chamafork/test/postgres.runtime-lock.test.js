"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { acquireRuntimeLock, assertLeastPrivilegeRuntimeRole } = require("../db/postgres");

function mockPool(locked = true) {
  const client = new EventEmitter();
  const queries = [];
  let released = false;
  client.query = async (sql, values) => {
    queries.push({ sql, values });
    return { rows: [{ locked }] };
  };
  client.release = () => { released = true; };
  return { client, queries, get released() { return released; }, connect: async () => client };
}

test("PostgreSQL runtime lock is held until graceful release", async () => {
  const pool = mockPool();
  const lock = await acquireRuntimeLock(pool);
  assert.doesNotThrow(() => lock.assertHeld());
  await lock.release();
  assert.equal(pool.queries.length, 2);
  assert.match(pool.queries[1].sql, /pg_advisory_unlock/);
  assert.equal(pool.released, true);
  assert.throws(() => lock.assertHeld(), /lock was lost/);
});

test("a second PostgreSQL runtime cannot take the writer lock", async () => {
  const pool = mockPool(false);
  await assert.rejects(acquireRuntimeLock(pool), error => error.code === "CHAMA_INSTANCE_LOCKED");
  assert.equal(pool.released, true);
  assert.equal(pool.queries.length, 1);
});

test("lost PostgreSQL lock fails closed before application writes", async () => {
  const pool = mockPool();
  const lock = await acquireRuntimeLock(pool);
  pool.client.emit("error", new Error("connection lost"));
  assert.throws(() => lock.assertHeld(), /lock was lost/);
  await lock.release();
});

test("PostgreSQL startup rejects a superuser or BYPASSRLS runtime role", async () => {
  for (const role of [
    { rolsuper: true, rolbypassrls: false },
    { rolsuper: false, rolbypassrls: true },
    { rolsuper: null, rolbypassrls: false },
  ]) {
    const pool = mockPool();
    pool.client.query = async () => ({ rows: [role] });
    await assert.rejects(assertLeastPrivilegeRuntimeRole(pool), /must not be SUPERUSER or BYPASSRLS/);
    assert.equal(pool.released, true);
  }
});

test("PostgreSQL startup accepts a least-privilege runtime role", async () => {
  const pool = mockPool();
  pool.client.query = async () => ({ rows: [{ rolsuper: false, rolbypassrls: false }] });
  await assert.doesNotReject(assertLeastPrivilegeRuntimeRole(pool));
  assert.equal(pool.released, true);
});
