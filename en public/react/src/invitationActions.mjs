const invitationFields = [
  "id", "name", "phone", "requestedRole", "idempotencyKey", "attemptsRemaining",
  "invitedBy", "invitedAt", "expiresAt", "usedAt",
];

export function createInvitation(writeRequester, owner, values) {
  const body = {
    name: String(values?.name || "").trim(),
    phone: String(values?.phone || "").trim(),
    email: String(values?.email || "").trim(),
    role: String(values?.role || ""),
  };
  if (!body.name) throw new TypeError("Enter the member's name.");
  if (!body.phone) throw new TypeError("Enter the member's Kenyan phone number.");
  if (!body.email) throw new TypeError("Enter the member's email address.");
  if (!["member", "secretary", "treasurer"].includes(body.role)) throw new TypeError("Choose a member role.");

  return writeRequester.submit({
    owner,
    path: "/api/invitations",
    method: "POST",
    body,
    validate: (response, key) => {
      const invitation = response?.invitation;
      return !!invitation
        && invitationFields.every(field => Object.hasOwn(invitation, field))
        && typeof invitation.id === "string"
        && typeof invitation.invitedAt === "string"
        && typeof invitation.expiresAt === "string"
        && invitation.idempotencyKey === key
        && invitation.name === body.name
        && typeof invitation.phone === "string"
        && invitation.requestedRole === body.role
        && (response.activationCode === undefined || /^\d{6}$/.test(response.activationCode));
    },
  });
}
