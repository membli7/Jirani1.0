"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { appendJsonEmailCapture } = require("../security/email-log");

test("JSON email captures stay in private temporary storage and rotate with restrictive file modes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-email-log-test-"));
  const file = path.join(directory, "codes.jsonl");
  try {
    const first = JSON.stringify({ subject: "Sign-In Code", text: "Code 123456" });
    assert.equal(appendJsonEmailCapture(file, first), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8").trim()), JSON.parse(first));
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    }

    const priorLog = `${JSON.stringify({ text: "x".repeat(1024 * 1024) })}\n`;
    fs.writeFileSync(file, priorLog, { encoding: "utf8", mode: 0o600 });
    const latest = JSON.stringify({ subject: "PIN Reset Code", text: "Code 654321" });
    appendJsonEmailCapture(file, latest);
    assert.equal(fs.readFileSync(`${file}.1`, "utf8"), priorLog);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8").trim()), JSON.parse(latest));
    if (process.platform !== "win32") assert.equal(fs.statSync(`${file}.1`).mode & 0o777, 0o600);

    const unsafePath = path.join(__dirname, "should-not-create-email-log.jsonl");
    assert.throws(() => appendJsonEmailCapture(unsafePath, first), /private directory in the OS temporary folder/);
    assert.equal(fs.existsSync(unsafePath), false);
    assert.throws(() => appendJsonEmailCapture(file, "not-json"), /valid JSON/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
