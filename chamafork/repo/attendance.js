"use strict";

const { createTenantRepository } = require("./record-repository");

module.exports = {
  registers: createTenantRepository("attendance_registers"),
  attendees: createTenantRepository("attendance"),
};
