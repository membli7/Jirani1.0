"use strict";

const MAX_POLICY_TIERS = 8;
const MAX_LOAN_AMOUNT_KES = 1_000_000_000;
const MAX_MEMBERSHIP_DAYS = 36_500;
const MAX_MEMBER_CONTRIBUTION_PERCENT = 1_000;

function isIntegerInRange(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validateLoanPolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Send a loan policy object.");
  }
  if (!isIntegerInRange(input.maxGroupCashPercent, 0, 100)) {
    throw new TypeError("Set the maximum group-balance percentage from 0 to 100.");
  }
  if (!isIntegerInRange(input.maxMemberContributionPercent, 0, MAX_MEMBER_CONTRIBUTION_PERCENT)) {
    throw new TypeError(`Set the maximum member-contribution percentage from 0 to ${MAX_MEMBER_CONTRIBUTION_PERCENT}.`);
  }
  if (!Array.isArray(input.tiers) || input.tiers.length < 1 || input.tiers.length > MAX_POLICY_TIERS) {
    throw new TypeError(`Set between 1 and ${MAX_POLICY_TIERS} loan amount tiers.`);
  }

  let previousMaximum = 0;
  const tiers = input.tiers.map((tier, index) => {
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) {
      throw new TypeError(`Complete loan amount tier ${index + 1}.`);
    }
    if (!isIntegerInRange(tier.maxAmountKsh, 1, MAX_LOAN_AMOUNT_KES)) {
      throw new TypeError(`Enter a whole KES ceiling for loan amount tier ${index + 1}.`);
    }
    if (tier.maxAmountKsh <= previousMaximum) {
      throw new TypeError("Loan amount tier ceilings must be in strictly increasing order.");
    }
    if (!isIntegerInRange(tier.minActiveDays, 0, MAX_MEMBERSHIP_DAYS)) {
      throw new TypeError(`Enter a whole active-membership period from 0 to ${MAX_MEMBERSHIP_DAYS} days for tier ${index + 1}.`);
    }
    if (!isIntegerInRange(tier.minShareContributionKsh, 0, MAX_LOAN_AMOUNT_KES)) {
      throw new TypeError(`Enter a whole KES minimum share contribution for tier ${index + 1}.`);
    }
    previousMaximum = tier.maxAmountKsh;
    return {
      maxAmountKsh: tier.maxAmountKsh,
      minActiveDays: tier.minActiveDays,
      minShareContributionKsh: tier.minShareContributionKsh,
    };
  });

  return {
    maxGroupCashPercent: input.maxGroupCashPercent,
    maxMemberContributionPercent: input.maxMemberContributionPercent,
    tiers,
  };
}

function evaluateLoanEligibility({ policy, amount, activeDays, shareContributions, groupBalance, priorPrincipal = 0 }) {
  const reasons = [];
  if (!policy) {
    return { eligible: false, reasons: ["The Chama has not configured its loan eligibility rules."], tier: null };
  }

  const tier = policy.tiers.find(item => amount <= item.maxAmountKsh) || null;
  if (!tier) reasons.push(`This amount is above the highest configured loan tier of KES ${policy.tiers.at(-1).maxAmountKsh}.`);
  if (!Number.isSafeInteger(activeDays) || activeDays < 0) {
    reasons.push("The active-membership date could not be verified.");
  } else if (tier && activeDays < tier.minActiveDays) {
    reasons.push(`This loan tier requires at least ${tier.minActiveDays} active membership days; the recorded period is ${activeDays} days.`);
  }
  if (!Number.isSafeInteger(shareContributions) || shareContributions < 0) {
    reasons.push("Recorded share-capital contributions could not be verified.");
  } else if (tier && shareContributions < tier.minShareContributionKsh) {
    reasons.push(`This loan tier requires KES ${tier.minShareContributionKsh} in recorded share-capital contributions; the recorded amount is KES ${shareContributions}.`);
  }

  const safeBalance = Number.isSafeInteger(groupBalance) ? Math.max(0, groupBalance) : 0;
  const groupLimit = Math.floor(safeBalance * policy.maxGroupCashPercent / 100);
  const safeContributions = Number.isSafeInteger(shareContributions) ? Math.max(0, shareContributions) : 0;
  const contributionCeiling = Math.floor(safeContributions * policy.maxMemberContributionPercent / 100);
  const safePriorPrincipal = Number.isSafeInteger(priorPrincipal) ? Math.max(0, priorPrincipal) : 0;
  const memberLimit = Math.max(0, contributionCeiling - safePriorPrincipal);
  if (amount > groupLimit) {
    reasons.push(`The current recorded group-balance limit is KES ${groupLimit} (${policy.maxGroupCashPercent}% of KES ${safeBalance}).`);
  }
  if (amount > memberLimit) {
    reasons.push(`The remaining member-contribution limit is KES ${memberLimit} after existing principal, based on ${policy.maxMemberContributionPercent}% of KES ${safeContributions} in recorded share-capital contributions.`);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    tier,
    groupBalance: safeBalance,
    groupLimit,
    shareContributions: safeContributions,
    memberContributionCeiling: contributionCeiling,
    priorPrincipal: safePriorPrincipal,
    memberLimit,
  };
}

module.exports = {
  MAX_POLICY_TIERS,
  MAX_LOAN_AMOUNT_KES,
  MAX_MEMBERSHIP_DAYS,
  MAX_MEMBER_CONTRIBUTION_PERCENT,
  validateLoanPolicy,
  evaluateLoanEligibility,
};
