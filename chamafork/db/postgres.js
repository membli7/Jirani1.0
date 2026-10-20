"use strict";

const fs = require("fs");

function createPostgresPool({ connectionString = process.env.DATABASE_URL } = {}) {
  if (!connectionString) return null;
  const { Pool } = require("pg");
  const configuredMax = Number(process.env.PG_POOL_MAX || 10);
  const pgSsl = process.env.PGSSL || "";
  if (pgSsl && !["disable", "require", "verify-full"].includes(pgSsl)) throw new Error("PGSSL must be disable, require, or verify-full.");
  const ssl = ["require", "verify-full"].includes(pgSsl)
    ? { rejectUnauthorized: true, ...(process.env.PGSSL_CA_FILE ? { ca: fs.readFileSync(process.env.PGSSL_CA_FILE, "utf8") } : {}) }
    : undefined;
  return new Pool({
    connectionString,
    max: Number.isSafeInteger(configuredMax) ? Math.max(2, configuredMax) : 10,
    ssl,
  });
}

async function acquireRuntimeLock(pool) {
  if (!pool) throw new Error("DATABASE_URL is required for the PostgreSQL runtime lock.");
  const client = await pool.connect();
  let held = false;
  try {
    const result = await client.query("SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS locked", ["jirani-chama-single-writer"]);
    held = result.rows[0]?.locked === true;
    if (!held) throw Object.assign(new Error("Another Jirani Chama server already owns this PostgreSQL database. Run only one server instance."), { code: "CHAMA_INSTANCE_LOCKED" });
  } catch (error) {
    client.release();
    throw error;
  }
  let released = false;
  client.on("error", () => { held = false; });
  return {
    assertHeld() {
      if (!held || released) throw new Error("The PostgreSQL single-writer lock was lost. This server is read-only until it restarts.");
    },
    async release() {
      if (released) return;
      released = true;
      try {
        if (held) await client.query("SELECT pg_advisory_unlock(hashtext($1)::bigint)", ["jirani-chama-single-writer"]);
      } finally {
        held = false;
        client.release();
      }
    },
  };
}

function validTenantId(chamaId) {
  return typeof chamaId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chamaId);
}

async function withTenant(pool, chamaId, work) {
  if (!pool) throw new Error("DATABASE_URL is required for PostgreSQL access.");
  if (!validTenantId(chamaId)) throw new Error("A valid chama id is required for PostgreSQL access.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.chama_id', $1, true)", [chamaId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { acquireRuntimeLock, createPostgresPool, validTenantId, withTenant };
