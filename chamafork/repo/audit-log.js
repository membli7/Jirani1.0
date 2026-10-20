"use strict";

const { createTenantRepository } = require("./record-repository");

module.exports = createTenantRepository("audit_log");
