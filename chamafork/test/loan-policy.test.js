"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { evaluateLoanEligibility, validateLoanPolicy } = require("../loan-policy");

const validPolicy = {
  maxGroupCashPercent: 40,
  maxMemberContributionPercent: 250,
  tiers: [
    { maxAmountKsh: 10_000, minActiveDays: 30, minShareContributionKsh: 2_000 },
    { maxAmountKsh: 50_000, minActiveDays: 180, minShareContributionKsh: 10_000 },
  ],
};

test("loan policy validation retains only the supported per-Chama rule fields", () => {
  const normalized = validateLoanPolicy({ ...validPolicy, ignored: "not retained" });
  assert.deepEqual(normalized, validPolicy);
  assert.equal(Object.hasOwn(normalized, "ignored"), false);
});

test("loan policy requires ordered increasing tiers and bounded whole-number settings", () => {
  assert.throws(() => validateLoanPolicy({ ...validPolicy, tiers: [] }), /between 1 and 8/);
  assert.throws(() => validateLoanPolicy({ ...validPolicy, maxGroupCashPercent: 101 }), /0 to 100/);
  assert.throws(() => validateLoanPolicy({ ...validPolicy, maxMemberContributionPercent: -1 }), /0 to 1000/);
  assert.throws(() => validateLoanPolicy({ ...validPolicy, tiers: [validPolicy.tiers[1], validPolicy.tiers[0]] }), /strictly increasing/);
  assert.throws(() => validateLoanPolicy({ ...validPolicy, tiers: [{ ...validPolicy.tiers[0], minActiveDays: 1.5 }] }), /whole active-membership/);
});

test("eligibility uses the amount tier, active period, share contributions, and both percentage limits", () => {
  const policy = validateLoanPolicy(validPolicy);
  const eligible = evaluateLoanEligibility({
    policy,
    amount: 5_000,
    activeDays: 60,
    shareContributions: 3_000,
    groupBalance: 20_000,
    priorPrincipal: 1_000,
  });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.groupLimit, 8_000);
  assert.equal(eligible.memberLimit, 6_500);
  assert.equal(eligible.tier.maxAmountKsh, 10_000);
});

test("higher amount tier requires its own active period and contribution thresholds", () => {
  const result = evaluateLoanEligibility({
    policy: validateLoanPolicy(validPolicy),
    amount: 20_000,
    activeDays: 90,
    shareContributions: 12_000,
    groupBalance: 100_000,
    priorPrincipal: 0,
  });
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join(" "), /requires at least 180 active membership days/);
});

test("percentage caps account for the current recorded group balance and existing member principal", () => {
  const result = evaluateLoanEligibility({
    policy: validateLoanPolicy(validPolicy),
    amount: 9_000,
    activeDays: 60,
    shareContributions: 5_000,
    groupBalance: 20_000,
    priorPrincipal: 4_000,
  });
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join(" "), /group-balance limit is KES 8000/);
  assert.match(result.reasons.join(" "), /remaining member-contribution limit is KES 8500/);
});

test("amount above the highest tier is never silently assigned to a tier", () => {
  const result = evaluateLoanEligibility({
    policy: validateLoanPolicy(validPolicy),
    amount: 50_001,
    activeDays: 365,
    shareContributions: 100_000,
    groupBalance: 1_000_000,
  });
  assert.equal(result.eligible, false);
  assert.equal(result.tier, null);
  assert.match(result.reasons[0], /above the highest configured loan tier/);
});
