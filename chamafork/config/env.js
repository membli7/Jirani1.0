"use strict";

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

function loadAppEnv() {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") return;
  const projectRoot = path.join(__dirname, "..", "..");
  const neonEnvPath = path.join(projectRoot, ".env.local");
  const neonEnv = fs.existsSync(neonEnvPath) ? dotenv.parse(fs.readFileSync(neonEnvPath, "utf8")) : {};
  dotenv.config({ path: path.join(projectRoot, "chamafork", ".env") });
  dotenv.config({ path: path.join(projectRoot, ".env") });
  dotenv.config({ path: neonEnvPath, override: true });
  if (neonEnv.DATABASE_URL && !neonEnv.DATABASE_MIGRATION_URL) {
    process.env.DATABASE_MIGRATION_URL = process.env.DATABASE_URL;
  }
}

module.exports = { loadAppEnv };
