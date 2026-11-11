export function changePin(writeRequester, owner, values) {
  return writeRequester.submit({
    owner,
    path: "/api/pin/change",
    method: "POST",
    body: {
      currentPin: values.currentPin,
      newPin: values.newPin,
    },
    validate: response => response?.user?.mustChangePin === false,
  });
}
