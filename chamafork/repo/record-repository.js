"use strict";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function checkedTable(table) {
  if (!IDENTIFIER.test(table)) throw new TypeError("Invalid repository table name.");
  return table;
}

function insertSql(table, columns) {
  const name = checkedTable(table);
  if (!Array.isArray(columns) || !columns.length || columns.some(column => !IDENTIFIER.test(column))) {
    throw new TypeError("Invalid repository columns.");
  }
  const names = columns.join(", ");
  const values = columns.map((_, index) => `$${index + 1}`).join(", ");
  return `INSERT INTO ${name} (${names}) VALUES (${values})`;
}

function createTenantRepository(table) {
  const name = checkedTable(table);
  return {
    async list(client, chamaId) {
      const result = await client.query(
        `SELECT * FROM ${name} WHERE chama_id = $1 ORDER BY record_order, source_id`,
        [chamaId],
      );
      return result.rows;
    },
    async replace(client, chamaId, rows) {
      if (!Array.isArray(rows)) throw new TypeError(`Repository ${name} rows must be an array.`);
      const inserts = rows.map(row => {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new TypeError(`Repository ${name} rows must be objects.`);
        if (row.chama_id !== chamaId) throw new Error(`Repository ${name} received a row for another chama.`);
        const columns = Object.keys(row);
        return { sql: insertSql(name, columns), values: columns.map(column => row[column]) };
      });
      // saveState runs replacements inside a tenant-scoped PostgreSQL transaction;
      // validate the full batch before deleting, so ownership errors are non-destructive.
      await client.query(`DELETE FROM ${name} WHERE chama_id = $1`, [chamaId]);
      for (const insert of inserts) await client.query(insert.sql, insert.values);
    },
    async clear(client, chamaId) {
      await client.query(`DELETE FROM ${name} WHERE chama_id = $1`, [chamaId]);
    },
  };
}

function createGlobalRepository(table) {
  const name = checkedTable(table);
  return {
    async list(client) {
      const result = await client.query(`SELECT * FROM ${name} ORDER BY record_order, source_id`);
      return result.rows;
    },
    async replace(client, rows) {
      await client.query(`DELETE FROM ${name}`);
      for (const row of rows) {
        const columns = Object.keys(row);
        await client.query(insertSql(name, columns), columns.map(column => row[column]));
      }
    },
  };
}

module.exports = { createTenantRepository, createGlobalRepository };
