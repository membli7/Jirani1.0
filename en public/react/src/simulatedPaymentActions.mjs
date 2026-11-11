export function simulatedPaymentFromForm(formData) {
  const values = Object.fromEntries(formData);
  values.amount = Number(values.amount);
  values.timestamp = new Date(values.timestamp).toISOString();
  return values;
}

export function submitSimulatedPayment(writeRequester, owner, values) {
  return writeRequester.submit({
    owner,
    path: "/api/payments/simulate",
    method: "POST",
    body: values,
    validate: response => response?.data?.status === "Unverified"
      && response.data.transactionId === values.transactionId.toUpperCase()
      && response.data.rawPayload?.testOnly === true,
  });
}
