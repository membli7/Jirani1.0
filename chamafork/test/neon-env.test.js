"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadAppEnv } = require("../config/env");

test("loads Neon environment values from the root .env.local", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalMigrationUrl = process.env.DATABASE_MIGRATION_URL;
  const originalBranch = process.env.NEON_BRANCH;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_MIGRATION_URL;
  delete process.env.NEON_BRANCH;

  try {
    loadAppEnv();
    assert.match(process.env.DATABASE_URL || "", /^postgres(?:ql)?:\/\//);
    assert.match(process.env.DATABASE_MIGRATION_URL || "", /^postgres(?:ql)?:\/\//);
    assert.equal(process.env.NEON_BRANCH, "production");
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalMigrationUrl === undefined) delete process.env.DATABASE_MIGRATION_URL;
    else process.env.DATABASE_MIGRATION_URL = originalMigrationUrl;
    if (originalBranch === undefined) delete process.env.NEON_BRANCH;
    else process.env.NEON_BRANCH = originalBranch;
  }
});
