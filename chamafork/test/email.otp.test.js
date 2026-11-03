"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");

const servers = [];
function hashedPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

async function startTestServer({ emailEnabled = false, logFile = "" } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-email-test-"));
  const dataFile = path.join(directory, "data.json");
  const phone = "+254711000001";
  const email = "chair@example.test";
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      version: 2,
      users: [
        {
          id: "chair-1",
          name: "Test Chair",
          phone,
          email,
          role: "chairperson",
          status: "active",
          pinHash: hashedPin("123456"),
          mustChangePin: false,
          chamaId: "chama-1",
        },
      ],
      chamas: [{ id: "chama-1", name: "Alpha Chama" }],
      transactions: [],
      loans: [],
      payouts: [],
      invitations: [],
      leadershipChanges: [],
      pendingMpesas: [],
      idempotency: {},
    })
  );

  const port = 35000 + (process.pid % 10000) + servers.length;
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATA_BACKEND: "json",
    PORT: String(port),
    SESSION_SECRET: "test-email-otp-secret",
    CHAMA_DATA_FILE: dataFile,
    AFRICASTALKING_USERNAME: "",
    AFRICASTALKING_API_KEY: "",
  };

  if (emailEnabled) {
    env.SMTP_TRANSPORT = "json";
    if (logFile) env.SMTP_LOG_FILE = logFile;
  } else {
    env.SMTP_HOST = "";
    env.SMTP_USER = "";
    env.SMTP_PASS = "";
    env.SMTP_TRANSPORT = "";
  }

  const child = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env,
  });

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
    phone,
    email,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill();
        await new Promise(resolve => child.once("exit", resolve));
      }
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
  servers.push(server);
  return server;
}

after(async () => {
  for (const server of servers) await server.stop();
});

test("returns 503 when email delivery is not configured", async () => {
  const server = await startTestServer({ emailEnabled: false });
  const response = await fetch(`${server.baseUrl}/api/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify({ phone: server.phone }),
  });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.match(data.message, /Phone-code sign-in is unavailable until secure email delivery is configured/);
});

test("dispatches OTP email and verifies code successfully when email is configured", async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-smtp-log-"));
  const logFile = path.join(logDir, "sent-mail.jsonl");

  const server = await startTestServer({ emailEnabled: true, logFile });

  // 1. Request OTP
  const reqResponse = await fetch(`${server.baseUrl}/api/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify({ phone: server.phone }),
  });
  assert.equal(reqResponse.status, 200);
  const reqData = await reqResponse.json();
  assert.match(reqData.message, /If that phone number is registered, a sign-in code may be sent/);

  // Capture session cookie from headers
  const setCookie = reqResponse.headers.get("set-cookie");
  assert.ok(setCookie, "Session cookie should be set");
  const cookieValue = setCookie.split(";")[0];

  // 2. Read sent email from logFile
  assert.ok(fs.existsSync(logFile), "Email log file should exist");
  const logContent = fs.readFileSync(logFile, "utf8").trim();
  const emailPayload = JSON.parse(logContent.split("\n")[0]);

  assert.equal(emailPayload.to[0].address, server.email);
  assert.equal(emailPayload.subject, "Jirani Chama Sign-In Code");
  assert.match(emailPayload.text, /Your Jirani Chama sign-in code is (\d{6})\./);

  const otpMatch = emailPayload.text.match(/(\d{6})/);
  assert.ok(otpMatch);
  const otpCode = otpMatch[1];

  // 3. Verify with wrong code -> 401
  const wrongVerify = await fetch(`${server.baseUrl}/api/otp/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
      Cookie: cookieValue,
    },
    body: JSON.stringify({ phone: server.phone, code: "000000" }),
  });
  assert.equal(wrongVerify.status, 401);

  // 4. Verify with correct code -> 200 and logged in
  const correctVerify = await fetch(`${server.baseUrl}/api/otp/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
      Cookie: cookieValue,
    },
    body: JSON.stringify({ phone: server.phone, code: otpCode }),
  });
  assert.equal(correctVerify.status, 200);
  const verifyData = await correctVerify.json();
  assert.equal(verifyData.message, "Signed in successfully.");
  assert.equal(verifyData.user.name, "Test Chair");

  // 5. Code is single-use -> verify again fails
  const reuseVerify = await fetch(`${server.baseUrl}/api/otp/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
      Cookie: cookieValue,
    },
    body: JSON.stringify({ phone: server.phone, code: otpCode }),
  });
  assert.equal(reuseVerify.status, 401);

  fs.rmSync(logDir, { recursive: true, force: true });
});
