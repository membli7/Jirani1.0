"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");

const servers = [];
const validMessage = {
  name: "Eli Example",
  email: "Eli@example.test",
  subject: "Question about a chama",
  message: "Could you tell me more about the group tools?"
};

async function startTestServer({ emailEnabled = true, logFile = "" } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-contact-test-"));
  const dataFile = path.join(directory, "data.json");
  const port = 42000 + (process.pid % 10000) + servers.length;
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATA_BACKEND: "json",
    APP_BIND_HOST: "127.0.0.1",
    PORT: String(port),
    SESSION_SECRET: "test-contact-form-secret",
    CHAMA_DATA_FILE: dataFile,
    SMTP_TRANSPORT: emailEnabled ? "json" : "",
    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM: "",
    SMTP_LOG_FILE: logFile
  };
  const child = execFile(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 8000);
    const check = setInterval(() => {
      if (output.includes(`localhost:${port}`)) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }
    }, 20);
    child.once("exit", code => {
      clearTimeout(timer);
      clearInterval(check);
      reject(new Error(`Server exited (${code}): ${output}`));
    });
  });
  const server = {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill();
        await new Promise(resolve => child.once("exit", resolve));
      }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
  servers.push(server);
  return server;
}

async function postContact(server, body = validMessage) {
  return fetch(`${server.baseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify(body)
  });
}

after(async () => {
  for (const server of servers) await server.stop();
});

test("contact form emails the fixed inbox and sets the sender as Reply-To after SMTP accepts it", async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-contact-mail-"));
  const logFile = path.join(logDir, "sent-mail.jsonl");
  const server = await startTestServer({ emailEnabled: true, logFile });
  const response = await postContact(server);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, "Your message has been sent.");
  assert.ok(fs.existsSync(logFile), "mail should be logged by the isolated JSON test transport");
  const payload = JSON.parse(fs.readFileSync(logFile, "utf8").trim().split("\n")[0]);
  assert.equal(payload.to[0].address, "09elim3@gmail.com");
  assert.equal(payload.replyTo[0].address, "eli@example.test");
  assert.equal(payload.subject, "Website contact: Question about a chama");
  assert.match(payload.text, /Name: Eli Example/);
  assert.match(payload.text, /Email: eli@example\.test/);
  assert.match(payload.text, /Could you tell me more about the group tools\?/);
  fs.rmSync(logDir, { recursive: true, force: true });
});

test("contact form reports unavailable rather than success when email is not configured", async () => {
  const server = await startTestServer({ emailEnabled: false });
  const response = await postContact(server);
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /temporarily unavailable/i);
});

test("contact form rejects header injection and malformed inputs before sending email", async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-contact-invalid-"));
  const logFile = path.join(logDir, "sent-mail.jsonl");
  const server = await startTestServer({ emailEnabled: true, logFile });
  const response = await postContact(server, { ...validMessage, subject: "Question\r\nBcc: attacker@example.test" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /required fields/i);
  assert.equal(fs.existsSync(logFile), false, "invalid contact data must not be sent");
  fs.rmSync(logDir, { recursive: true, force: true });
});

test("contact form rate-limits repeated submissions", async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-contact-limit-"));
  const logFile = path.join(logDir, "sent-mail.jsonl");
  const server = await startTestServer({ emailEnabled: true, logFile });
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await postContact(server)).status, 200);
  assert.equal((await postContact(server)).status, 429);
  assert.equal(fs.readFileSync(logFile, "utf8").trim().split("\n").length, 5);
  fs.rmSync(logDir, { recursive: true, force: true });
});
