"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CONFIRMATION_PATH,
  SAFARICOM_CALLBACK_IPS,
  VALIDATION_PATH,
  getC2bSubscriptionConfig,
  isTrustedCallbackIp,
  parseC2bPayment,
  parseShortcodeMap,
} = require("../security/mpesa-c2b-subscriptions");

const validEnv = {
  NODE_ENV: "test",
  MPESA_ENV: "sandbox",
  MPESA_C2B_CALLBACKS_ENABLED: "1",
  MPESA_C2B_VALIDATION_URL: `https://sandbox.example.test${VALIDATION_PATH}`,
  MPESA_C2B_CONFIRMATION_URL: `https://sandbox.example.test${CONFIRMATION_PATH}`,
  MPESA_SHORTCODE_CHAMA_MAP: "subscription-chama=600001,capped-chama=600002",
  MPESA_TEST_CALLBACK_IPS: "127.0.0.1,::1",
};

test("shortcode map accepts explicit chama-to-shortcode and shortcode-to-chama formats", () => {
  const forward = parseShortcodeMap("subscription-chama=600001,capped-chama=600002");
  assert.equal(forward.valid, true);
  assert.equal(forward.shortcodeToChama.get("600001"), "subscription-chama");

  const reverse = parseShortcodeMap("600001:subscription-chama");
  assert.equal(reverse.valid, true);
  assert.equal(reverse.shortcodeToChama.get("600001"), "subscription-chama");

  const json = parseShortcodeMap('{"subscription-chama":"600001"}');
  assert.equal(json.valid, true);
  assert.equal(json.shortcodeToChama.get("600001"), "subscription-chama");

  assert.equal(parseShortcodeMap("{broken}").valid, false);
  assert.equal(parseShortcodeMap("600001=600002").valid, false);
  assert.equal(parseShortcodeMap("subscription-chama=abc").valid, false);
});

test("C2B subscription callbacks are sandbox-only and require both exact HTTPS callback URLs and a valid map", () => {
  assert.equal(getC2bSubscriptionConfig(validEnv).enabled, true);
  assert.equal(getC2bSubscriptionConfig({ ...validEnv, MPESA_ENV: "production" }).enabled, false);
  assert.equal(getC2bSubscriptionConfig({ ...validEnv, MPESA_C2B_CONFIRMATION_URL: "http://sandbox.example.test/api/mpesa/c2b/confirmation" }).enabled, false);
  assert.equal(getC2bSubscriptionConfig({ ...validEnv, MPESA_C2B_VALIDATION_URL: "https://sandbox.example.test/other" }).enabled, false);
  assert.equal(getC2bSubscriptionConfig({ ...validEnv, MPESA_SHORTCODE_CHAMA_MAP: "{broken}" }).enabled, false);
  assert.equal(getC2bSubscriptionConfig({ ...validEnv, MPESA_C2B_CALLBACKS_ENABLED: "0" }).enabled, false);
});

test("callback source IP checks normalize mapped loopback addresses and use only Safaricom's published list outside tests", () => {
  assert.equal(isTrustedCallbackIp("::ffff:127.0.0.1", validEnv), true);
  assert.equal(isTrustedCallbackIp("203.0.113.7", validEnv), false);
  assert.equal(isTrustedCallbackIp("196.201.214.200", { NODE_ENV: "production" }), true);
  assert.equal(isTrustedCallbackIp("203.0.113.7", { NODE_ENV: "production" }), false);
  assert.ok(SAFARICOM_CALLBACK_IPS.size >= 10);
});

test("C2B payload parser validates KES amount, shortcode, reference and transaction receipt", () => {
  const valid = parseC2bPayment({
    TransID: "TEST123ABC",
    BusinessShortCode: "600001",
    BillRefNumber: "JCABCDEF012345",
    TransTime: "20261107123456",
    TransAmount: "2880.00",
    MSISDN: "254711000001",
  });
  assert.deepEqual(valid, {
    transactionId: "TEST123ABC",
    shortcode: "600001",
    reference: "JCABCDEF012345",
    amountCents: 288000,
    amount: 2880,
    currency: "KES",
    transactionTime: "20261107123456",
  });

  assert.equal(parseC2bPayment({ TransID: "TEST1", BusinessShortCode: "600001", BillRefNumber: "JCABCDEF012345", TransTime: "20261107123456", TransAmount: "0" }), null);
  assert.equal(parseC2bPayment({ TransID: "TEST1", BusinessShortCode: "600001", BillRefNumber: "JCABCDEF012345", TransTime: "20261107123456", TransAmount: "2880.001" }), null);
  assert.equal(parseC2bPayment({ TransID: "TEST1", BusinessShortCode: "600001", BillRefNumber: "JC ABCDEF", TransTime: "20261107123456", TransAmount: "2880" }), null);
  assert.equal(parseC2bPayment({ TransID: "TEST1", BusinessShortCode: "600001", BillRefNumber: "JCABCDEF012345", TransTime: "bad-time", TransAmount: "2880" }), null);
  assert.equal(parseC2bPayment(null), null);
});
