const validDate = /^\d{4}-\d{2}-\d{2}$/;

export function canCorrectContributionDate(transaction, user) {
  return ["chairperson", "treasurer"].includes(user?.role)
    && transaction?.status === "confirmed"
    && transaction?.paymentType === "Monthly Contribution"
    && transaction?.method === "Cash"
    && validDate.test(String(transaction?.date || ""));
}

export function contributionDateBounds(date, today) {
  if (!validDate.test(String(date || "")) || !validDate.test(String(today || ""))) return null;
  const month = date.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
  return { min: `${month}-01`, max: today < monthEnd ? today : monthEnd };
}

export function correctContributionDate(writeRequester, owner, transactionId, payload) {
  const date = String(payload?.date || "").trim();
  const reason = String(payload?.reason || "").trim();
  if (!transactionId || !validDate.test(date) || !reason || reason.length > 500) {
    throw new TypeError("Enter a valid date and a reason of up to 500 characters.");
  }
  return writeRequester.submit({
    owner,
    path: `/api/contributions/${encodeURIComponent(transactionId)}/correct-date`,
    method: "POST",
    body: { date, reason },
    validate: response => response?.data?.transaction?.id === transactionId,
  });
}
