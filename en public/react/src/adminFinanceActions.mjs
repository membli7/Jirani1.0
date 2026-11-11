function validCycleInput(input) {
  return Boolean(
    /^\d{4}-\d{2}-\d{2}$/.test(String(input?.cycleStartDate || ""))
    && /^\d{4}-\d{2}-\d{2}$/.test(String(input?.cycleEndDate || ""))
    && !Number.isNaN(Date.parse(input.cycleStartDate))
    && !Number.isNaN(Date.parse(input.cycleEndDate))
    && input.cycleStartDate <= input.cycleEndDate
    && Number.isSafeInteger(input.adminExpenses)
    && input.adminExpenses >= 0,
  );
}

export function assessMonthlyPenalties(writeRequester, owner, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) {
    throw new TypeError("Enter the month as YYYY-MM.");
  }
  return writeRequester.submit({
    owner,
    path: "/api/penalties/assess",
    method: "POST",
    body: { month },
    validate: response => response?.data?.month === month && Array.isArray(response.data.assessed),
  });
}

export function calculateDividendCycle(writeRequester, owner, input) {
  if (!validCycleInput(input)) {
    throw new TypeError("Enter valid cycle dates and admin expenses as whole KES.");
  }
  return writeRequester.submit({
    owner,
    path: "/api/dividends/calculate",
    method: "POST",
    body: input,
    validate: response => response?.data?.cycleStartDate === input.cycleStartDate
      && response.data.cycleEndDate === input.cycleEndDate
      && Array.isArray(response.data.payouts)
      && typeof response.data.overlapsCommitted === "boolean",
  });
}

export function commitDividendCycle(writeRequester, owner, input, payouts) {
  if (!validCycleInput(input) || !Array.isArray(payouts)) {
    throw new TypeError("Calculate a valid dividend preview before committing.");
  }
  const body = {
    ...input,
    payouts: payouts.map(item => ({ memberId: item.memberId, dividend: item.dividend })),
  };
  return writeRequester.submit({
    owner,
    path: "/api/dividends/commit",
    method: "POST",
    body,
    validate: response => response?.data?.cycleStartDate === input.cycleStartDate
      && response.data.cycleEndDate === input.cycleEndDate
      && Array.isArray(response.data.payouts),
  });
}
