"use strict";

const { createTenantRepository } = require("./record-repository");

module.exports = createTenantRepository("ledger_entries");
