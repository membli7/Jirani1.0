"use strict";

const { createGlobalRepository } = require("./record-repository");

const repository = createGlobalRepository("users");
repository.clear = async function clear(client, chamaId) {
  await client.query("DELETE FROM users WHERE chama_id = $1", [chamaId]);
};

module.exports = repository;
