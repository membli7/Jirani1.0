"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { createPostgresPool } = require("../db/postgres");

const connectionString = process.env.FINANCIAL_REFERENCE_TEST_DATABASE_URL || "";
let localTestDatabase = false;
try {
  const hostname = new URL(connectionString).hostname.toLowerCase();
  localTestDatabase = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
} catch {}

async function setChama(client, chamaId) {
  await client.query("SELECT set_config('app.chama_id', $1, true)", [chamaId]);
}

async function expectReceiptConflict(client, work) {
  await client.query("SAVEPOINT expected_receipt_conflict");
  let caught;
  try { await work(); } catch (error) { caught = error; }
  await client.query("ROLLBACK TO SAVEPOINT expected_receipt_conflict");
  await client.query("RELEASE SAVEPOINT expected_receipt_conflict");
  assert.equal(caught?.code, "23505");
  assert.equal(caught?.constraint, "financial_reference_reservations_pkey");
}

async function insertTransaction(client, { id = crypto.randomUUID(), chamaId, sourceId, referenceNumber, status = "confirmed" }) {
  await client.query(
    `INSERT INTO public.transactions
      (id, chama_id, source_id, amount_cents, payment_type, method, status, reference_number, occurred_at)
     VALUES ($1, $2, $3, 1000, 'Monthly Contribution', 'Cash', $4, $5, now())`,
    [id, chamaId, sourceId, status, referenceNumber],
  );
  return id;
}

async function insertChama(client, chamaId, sourceId, name) {
  await setChama(client, chamaId);
  await client.query(
    `INSERT INTO public.chamas (chama_id, name, source_id, record_data, state_data, record_order)
     VALUES ($1, $2, $3, '{}'::jsonb, '{}'::jsonb, 0)`,
    [chamaId, name, sourceId],
  );
  await client.query(
    "INSERT INTO public.app_chama_directory (tenant_id, source_id, display_name, record_order) VALUES ($1, $2, $3, 0)",
    [chamaId, sourceId, name],
  );
}

test("PostgreSQL receipt reservations cover financial tables and remain append-only", {
  skip: process.env.NODE_ENV === "production" || !localTestDatabase,
}, async () => {
  const pool = createPostgresPool({ connectionString });
  const client = await pool.connect();
  const chamaA = crypto.randomUUID();
  const chamaB = crypto.randomUUID();
  const userA = crypto.randomUUID();
  const transactionA = crypto.randomUUID();
  const contributionA = crypto.randomUUID();
  const repaymentA = crypto.randomUUID();
  const callbackA = crypto.randomUUID();
  const ownerSourceId = `receipt-event-${crypto.randomUUID()}`;

  try {
    await client.query("BEGIN");
    const role = await client.query("SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user");
    assert.equal(role.rows[0]?.rolsuper, false, "test connection must not be superuser");
    assert.equal(role.rows[0]?.rolbypassrls, false, "test connection must exercise RLS");

    const table = await client.query("SELECT to_regclass('public.financial_reference_reservations') AS name");
    assert.ok(table.rows[0]?.name, "apply migrations 001-005 to the isolated test database first");

    await insertChama(client, chamaA, `source-${chamaA}`, "Receipt Test A");
    await setChama(client, chamaA);
    await client.query(
      `INSERT INTO public.users (id, name, phone, status, chama_id, source_id, record_data, record_order)
       VALUES ($1, 'Receipt Test Member', $2, 'active', $3, 'receipt-member', '{}'::jsonb, 0)`,
      [userA, `+254700${crypto.randomInt(100000, 999999)}`, chamaA],
    );
    await insertTransaction(client, { id: transactionA, chamaId: chamaA, sourceId: ownerSourceId, referenceNumber: "  MiXeD-Receipt  " });

    // These two rows are projections of the same source transaction and may reserve the same key.
    await client.query(
      `INSERT INTO public.contributions
        (id, chama_id, source_id, member_id, amount_cents, method, status, reference_number, record_data, record_order)
       VALUES ($1, $2, $3, $4, 1000, 'Cash', 'confirmed', 'mixed-receipt', '{}'::jsonb, 0)`,
      [contributionA, chamaA, ownerSourceId, userA],
    );
    await client.query(
      `INSERT INTO public.loan_repayments
        (id, chama_id, source_id, amount_cents, method, reference_number, record_data, record_order)
       VALUES ($1, $2, $3, 1000, 'Cash', 'MIXED-RECEIPT', '{}'::jsonb, 0)`,
      [repaymentA, chamaA, ownerSourceId],
    );

    // A provider receipt linked to the same financial transaction is the same event.
    await client.query(
      `INSERT INTO public.mpesa_callbacks
        (id, chama_id, source_id, callback_key, transaction_id, payload, received_at, mpesa_receipt_number, record_data, record_order)
       VALUES ($1, $2, 'callback-linked', 'callback-linked', $3, '{}'::jsonb, now(), 'mixed-receipt', '{}'::jsonb, 0)`,
      [callbackA, chamaA, transactionA],
    );

    await expectReceiptConflict(client, () => insertTransaction(client, {
      chamaId: chamaA, sourceId: `different-event-${crypto.randomUUID()}`, referenceNumber: "mixed-receipt",
    }));
    await expectReceiptConflict(client, () => client.query(
      `INSERT INTO public.mpesa_callbacks
        (id, chama_id, source_id, callback_key, payload, received_at, mpesa_receipt_number, record_data, record_order)
       VALUES ($1, $2, 'callback-unlinked', 'callback-unlinked', '{}'::jsonb, now(), ' MIXED-RECEIPT ', '{}'::jsonb, 0)`,
      [crypto.randomUUID(), chamaA],
    ));

    // Correction to a different receipt reserves the new key but never releases the prior one.
    await client.query("UPDATE public.transactions SET reference_number = 'Corrected-Receipt' WHERE id = $1", [transactionA]);
    await client.query("UPDATE public.transactions SET status = 'Reversed' WHERE id = $1", [transactionA]);
    await expectReceiptConflict(client, () => insertTransaction(client, {
      chamaId: chamaA, sourceId: `old-receipt-reuse-${crypto.randomUUID()}`, referenceNumber: "mixed-receipt",
    }));
    await expectReceiptConflict(client, () => insertTransaction(client, {
      chamaId: chamaA, sourceId: `new-receipt-reuse-${crypto.randomUUID()}`, referenceNumber: " corrected-receipt ",
    }));

    // The same normalized reference is allowed in a different chama.
    await insertChama(client, chamaB, `source-${chamaB}`, "Receipt Test B");
    await setChama(client, chamaB);
    await insertTransaction(client, { chamaId: chamaB, sourceId: `other-chama-${crypto.randomUUID()}`, referenceNumber: "mixed-receipt" });
    const visible = await client.query("SELECT count(*)::int AS count FROM public.financial_reference_reservations");
    assert.equal(visible.rows[0].count, 1, "RLS exposes only the active chama's reservations");

    // Even after source rows are removed, reservation keys remain in the table.
    await setChama(client, chamaA);
    await client.query("DELETE FROM public.mpesa_callbacks WHERE id = $1", [callbackA]);
    await client.query("DELETE FROM public.contributions WHERE id = $1", [contributionA]);
    await client.query("DELETE FROM public.loan_repayments WHERE id = $1", [repaymentA]);
    await client.query("DELETE FROM public.transactions WHERE id = $1", [transactionA]);
    await expectReceiptConflict(client, () => insertTransaction(client, {
      chamaId: chamaA, sourceId: `deleted-record-reuse-${crypto.randomUUID()}`, referenceNumber: "corrected-receipt",
    }));

    await assert.rejects(
      client.query("DELETE FROM public.financial_reference_reservations WHERE chama_id = $1", [chamaA]),
      error => ["42501", "55000"].includes(error.code),
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    await pool.end();
  }
});
