const allowedTerms = new Set([1, 2, 3, 6]);

export function loanStatusPresentation(status) {
  const normalized = String(status || "").toLowerCase();
  if (["pending", "requested", "waiting for decisions"].includes(normalized)) return { label: "Pending", className: "pending" };
  if (normalized === "approved") return { label: "Approved", className: "success" };
  if (normalized === "rejected") return { label: "Rejected", className: "inactive" };
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

export function recordLoanDecision(writeRequester, owner, loanId, decision, reason) {
  const normalizedReason = String(reason ?? "").trim();
  if (!loanId || !["approve", "reject"].includes(decision)) {
    throw new TypeError("Choose a valid loan decision.");
  }
  if (normalizedReason.length < 5 || normalizedReason.length > 500) {
    throw new TypeError("Enter a reason between 5 and 500 characters.");
  }
  return writeRequester.submit({
    owner,
    path: `/api/loans/${encodeURIComponent(loanId)}/decisions`,
    method: "POST",
    body: { decision, reason: normalizedReason },
    validate: response => response?.data?.id === loanId,
  });
}

export function requestDashboardRefresh(target = globalThis.window) {
  if (!target?.dispatchEvent || typeof target.CustomEvent !== "function") return false;
  target.dispatchEvent(new target.CustomEvent("chama:dashboard-refresh-requested"));
  return true;
}
