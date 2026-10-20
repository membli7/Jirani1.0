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
      await client.query(`DELETE FROM ${name} WHERE chama_id = $1`, [chamaId]);
      for (const row of rows) {
        if (row.chama_id !== chamaId) throw new Error(`Repository ${name} received a row for another chama.`);
        const columns = Object.keys(row);
        await client.query(insertSql(name, columns), columns.map(column => row[column]));
      }
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
