const allowedTerms = new Set([1, 2, 3, 6]);

export function loanStatusPresentation(status) {
  const normalized = String(status || "").toLowerCase();
  if (["pending", "requested", "waiting for decisions"].includes(normalized)) return { label: "Pending", className: "pending" };
  if (normalized === "approved") return { label: "Approved", className: "success" };
  if (normalized === "rejected") return { label: "Rejected", className: "inactive" };
  if (normalized === "cancelled") return { label: "Cancelled", className: "inactive" };
  if (normalized === "repaid") return { label: "Repaid", className: "success" };
  if (normalized === "closed") return { label: "Closed", className: "inactive" };
  return { label: status || "Unknown", className: "pending" };
}

export function loanRequestFromForm(formData) {
  const amount = Number(formData.get("amount"));
  const months = Number(formData.get("months"));
  const guarantorIds = formData.getAll("guarantorIds").map(value => String(value).trim());
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new TypeError("Enter a whole loan amount greater than zero.");
  }
  if (!allowedTerms.has(months)) {
    throw new TypeError("Choose a repayment period of 1, 2, 3, or 6 months.");
  }
  if (guarantorIds.length !== 2 || guarantorIds.some(value => !value) || new Set(guarantorIds).size !== 2) {
    throw new TypeError("Choose exactly two different active members to guarantee this loan.");
  }
  return { amount, months, guarantorIds };
}

export function submitLoanRequest(writeRequester, owner, payload) {
  return writeRequester.submit({
    owner,
    path: "/api/loans",
    method: "POST",
    body: payload,
    validate: response => response?.data?.id
      && response.data.amount === payload.amount
      && response.data.months === payload.months,
  });
}

export async function requestLoanEstimate(amount, months, fetcher = globalThis.fetch) {
  if (!Number.isSafeInteger(amount) || amount < 1 || !allowedTerms.has(months) || typeof fetcher !== "function") {
    throw new TypeError("Enter a whole loan amount and a supported repayment period to get an estimate.");
  }
  const query = new URLSearchParams({ amount: String(amount), months: String(months) });
  const response = await fetcher(`/api/loans/estimate?${query}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || "The loan repayment estimate could not be loaded.");
    error.status = response.status;
    throw error;
  }
  const estimate = payload?.data;
  const schedule = Array.isArray(estimate?.schedule) ? estimate.schedule : [];
  const validRows = schedule.length === months && schedule.every((row, index) => row
    && row.no === index + 1
    && typeof row.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.dueDate)
    && Number.isSafeInteger(row.principal) && row.principal >= 0
    && Number.isSafeInteger(row.interest) && row.interest >= 0
    && Number.isSafeInteger(row.installment) && row.installment === row.principal + row.interest);
  const principalTotal = schedule.reduce((sum, row) => sum + row.principal, 0);
  const interestTotal = schedule.reduce((sum, row) => sum + row.interest, 0);
  const installmentTotal = schedule.reduce((sum, row) => sum + row.installment, 0);
  if (estimate?.amount !== amount || estimate?.months !== months
    || !Number.isFinite(estimate?.monthlyRatePercent) || estimate.monthlyRatePercent < 0 || estimate.monthlyRatePercent > 100
    || estimate?.interestModel !== "reducing"
    || !Number.isSafeInteger(estimate?.totalInterest) || estimate.totalInterest < 0
    || !Number.isSafeInteger(estimate?.totalPayable) || estimate.totalPayable < amount
    || !validRows || !Number.isSafeInteger(principalTotal) || principalTotal !== amount
    || !Number.isSafeInteger(interestTotal) || interestTotal !== estimate.totalInterest
    || !Number.isSafeInteger(installmentTotal) || installmentTotal !== estimate.totalPayable) {
    throw new Error("The server returned an invalid repayment estimate.");
  }
  return estimate;
}

export function saveLoanPolicy(writeRequester, owner, payload) {
  return writeRequester.submit({
    owner,
    path: "/api/loans/policy",
    method: "POST",
    body: payload,
    validate: response => Array.isArray(response?.data?.tiers)
      && response.data.tiers.length === payload.tiers.length,
  });
}

export function requestLoanHumanReview(writeRequester, owner, loanId, reason) {
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (!loanId || normalizedReason.length < 5 || normalizedReason.length > 1000) {
    throw new TypeError("Explain why you want a human review in 5 to 1,000 characters.");
  }
  return writeRequester.submit({
    owner,
    path: `/api/loans/${encodeURIComponent(loanId)}/review-requests`,
    method: "POST",
    body: { reason: normalizedReason },
    validate: response => response?.data?.id === loanId && response.data.humanReview?.status === "requested",
  });
}

export function respondToLoanHumanReview(writeRequester, owner, loanId, payload) {
  if (!loanId || !["upheld", "not_upheld"].includes(payload?.outcome)) {
    throw new TypeError("Choose whether the original automated decision is upheld or not upheld.");
  }
  if (payload.memberExplanationConsidered !== true) {
    throw new TypeError("Confirm that you considered the member's explanation and relevant information.");
  }
  if (payload.noConflictOfInterest !== true) {
    throw new TypeError("Confirm that you have no other conflict of interest in this review.");
  }
  const informationConsidered = typeof payload.informationConsidered === "string" ? payload.informationConsidered.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (informationConsidered.length < 5 || informationConsidered.length > 2000) {
    throw new TypeError("Record the information considered in 5 to 2,000 characters.");
  }
  if (reason.length < 20 || reason.length > 2000) {
    throw new TypeError("Enter written reasons for the review outcome in 20 to 2,000 characters.");
  }
  return writeRequester.submit({
    owner,
    path: `/api/loans/${encodeURIComponent(loanId)}/reviews`,
    method: "POST",
    body: { outcome: payload.outcome, memberExplanationConsidered: true, noConflictOfInterest: true, informationConsidered, reason },
    validate: response => response?.data?.id === loanId
      && response.data.humanReview?.status === "completed"
      && ["upheld", "not_upheld"].includes(response.data.humanReview.response?.outcome),
  });
}

export function cancelLegacyLoanRequest(writeRequester, owner, loanId) {
  if (!loanId) throw new TypeError("Choose a loan request to cancel.");
  return writeRequester.submit({
    owner,
    path: `/api/loans/${encodeURIComponent(loanId)}/cancel`,
    method: "POST",
    body: {},
    validate: response => response?.data?.id === loanId && response.data.status === "cancelled",
  });
}

export function requestDashboardRefresh(target = globalThis.window) {
  if (!target?.dispatchEvent || typeof target.CustomEvent !== "function") return false;
  target.dispatchEvent(new target.CustomEvent("chama:dashboard-refresh-requested"));
  return true;
}
