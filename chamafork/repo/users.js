"use strict";

const { createTenantRepository } = require("./record-repository");

const repository = createTenantRepository("users");

repository.insert = async function insert(client, chamaId, row) {
  if (row.chama_id !== chamaId) throw new Error("User row chama_id mismatch.");
  const columns = Object.keys(row);
  const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
  if (!columns.length || columns.some(c => !IDENTIFIER.test(c))) throw new TypeError("Invalid repository columns.");
  const names = columns.join(", ");
  const values = columns.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(`INSERT INTO users (${names}) VALUES (${values})`, columns.map(c => row[c]));
};

module.exports = repository;
