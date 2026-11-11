export function buildCashEntryRequest(writeRequester, formData) {
  if (!writeRequester || typeof writeRequester.cashEntryRequest !== "function") {
    throw new TypeError("The cash-entry request helper is unavailable.");
  }
  return writeRequester.cashEntryRequest(formData);
}

export function recordCashEntry(writeRequester, owner, request) {
  if (!request?.path || !request.body || typeof request.body !== "object") {
    throw new TypeError("A valid cash-entry request is required.");
  }
  const values = request.body;
  return writeRequester.submit({
    owner,
    path: request.path,
    method: "POST",
    body: values,
    validate: (result, key) => {
      const transaction = result?.data;
      const fields = ["id", "at", "memberId", "memberName", "amount", "method", "paymentType", "note", "loanId", "recordedBy", "recordedByName", "source", "status", "idempotencyKey"];
      return !!transaction
        && fields.every(field => Object.hasOwn(transaction, field))
        && typeof transaction.id === "string"
        && typeof transaction.at === "string"
        && transaction.idempotencyKey === key
        && transaction.memberId === values.memberId
        && transaction.amount === values.amount
        && transaction.paymentType === values.paymentType
        && transaction.method === "Cash"
        && transaction.note === values.note
        && transaction.status === "confirmed";
    },
  });
}
