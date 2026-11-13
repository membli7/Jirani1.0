"use strict";

const crypto = require("node:crypto");

const PUSH_CATEGORIES = new Set([
  "message",
  "contribution_due",
  "loan_due",
  "loan_overdue",
  "meeting",
  "fine",
  "loan_decision",
]);
const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_OFFSETS = [3, 1];

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function daysBetween(fromDate, toDate) {
  if (!isCalendarDate(fromDate) || !isCalendarDate(toDate)) return null;
  return Math.round((Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / DAY_MS);
}

function nextMonths(today, count = 3) {
  const start = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  const months = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(start);
    date.setUTCMonth(date.getUTCMonth() + offset);
    months.push(date.toISOString().slice(0, 7));
  }
  return months;
}

function addNotification(state, { recipientId, chamaId, category, title, text, notificationKey, at }) {
  if (!state || !recipientId || !chamaId || !PUSH_CATEGORIES.has(category) || !notificationKey) return null;
  if (!Array.isArray(state.messages)) state.messages = [];
  if (state.messages.some(item => item?.type === "notification" && item.recipientId === recipientId && item.chamaId === chamaId && item.notificationKey === notificationKey)) return null;
  const notification = {
    id: crypto.randomUUID(),
    type: "notification",
    recipientId,
    at: at || new Date().toISOString(),
    authorId: null,
    authorName: "Jirani Chama",
    authorRole: "system",
    category,
    title: String(title || "Chama notification").slice(0, 100),
    text: String(text || "").slice(0, 500),
    notificationKey: String(notificationKey).slice(0, 180),
    chamaId,
  };
  state.messages.push(notification);
  return notification;
}

function notifyMembers(state, chamaId, notification) {
  const recipients = (Array.isArray(state?.users) ? state.users : []).filter(user => user?.chamaId === chamaId && user.status === "active");
  const created = [];
  for (const user of recipients) {
    const item = addNotification(state, { ...notification, recipientId: user.id, chamaId });
    if (item) created.push(item);
  }
  return created;
}

function paidByDeadline(state, member, month, deadline, transactionDate, minimumContribution) {
  const transactions = Array.isArray(state?.transactions) ? state.transactions : [];
  return transactions
    .filter(item => item?.chamaId === member.chamaId
      && item.memberId === member.id
      && item.paymentType === "Monthly Contribution"
      && item.status !== "pending-member"
      && item.status !== "rejected"
      && (item.contributionMonth || String(transactionDate(item) || "").slice(0, 7)) === month
      && isCalendarDate(transactionDate(item))
      && transactionDate(item) <= deadline)
    .reduce((sum, item) => sum + (Number.isSafeInteger(item.amount) && item.amount > 0 ? item.amount : 0), 0) >= minimumContribution;
}

function collectDueReminders(state, {
  today,
  deadlineForMonth,
  minimumContribution,
  transactionDate = item => item?.date || String(item?.at || "").slice(0, 10),
  at = new Date().toISOString(),
} = {}) {
  if (!isCalendarDate(today) || typeof deadlineForMonth !== "function") return [];
  const activeMembers = (Array.isArray(state?.users) ? state.users : []).filter(user => user?.status === "active" && user.chamaId);
  const added = [];
  const months = nextMonths(today, 3);
  const requiredMinimum = Number.isSafeInteger(minimumContribution) && minimumContribution > 0 ? minimumContribution : 0;

  if (requiredMinimum > 0) {
    for (const month of months) {
      const deadline = deadlineForMonth(month);
      if (!isCalendarDate(deadline)) continue;
      const daysUntil = daysBetween(today, deadline);
      if (!REMINDER_OFFSETS.includes(daysUntil)) continue;
      for (const member of activeMembers) {
        if (paidByDeadline(state, member, month, deadline, transactionDate, requiredMinimum)) continue;
        const item = addNotification(state, {
          recipientId: member.id,
          chamaId: member.chamaId,
          category: "contribution_due",
          title: "Monthly contribution due soon",
          text: `Your ${month} monthly contribution is still below the KES ${requiredMinimum} minimum welfare fee. Due in ${daysUntil} day${daysUntil === 1 ? "" : "s"} on ${deadline}.`,
          notificationKey: `contribution-due:${month}:${daysUntil}`,
          at,
        });
        if (item) added.push(item);
      }
    }
  }

  const settings = state?.settings && typeof state.settings === "object" ? state.settings : {};
  const tenantMeetingDates = settings.meetingDatesByChama && typeof settings.meetingDatesByChama === "object" && !Array.isArray(settings.meetingDatesByChama) ? settings.meetingDatesByChama : {};
  const legacyMeetingDates = settings.meetingDates && typeof settings.meetingDates === "object" && !Array.isArray(settings.meetingDates) ? settings.meetingDates : {};
  const activeChamaIds = [...new Set(activeMembers.map(user => user.chamaId).filter(value => typeof value === "string"))];
  const tenantCount = Array.isArray(state?.chamas) && state.chamas.length ? state.chamas.length : activeChamaIds.length;
  for (const chamaId of activeChamaIds) {
    const scopedDates = Object.hasOwn(tenantMeetingDates, chamaId) && tenantMeetingDates[chamaId] && typeof tenantMeetingDates[chamaId] === "object" && !Array.isArray(tenantMeetingDates[chamaId])
      ? tenantMeetingDates[chamaId]
      : {};
    const meetingDates = tenantCount <= 1 ? { ...legacyMeetingDates, ...scopedDates } : scopedDates;
    for (const [month, date] of Object.entries(meetingDates)) {
      if (!/^\d{4}-\d{2}$/.test(month) || !isCalendarDate(date) || date.slice(0, 7) !== month) continue;
      const daysUntil = daysBetween(today, date);
      if (!REMINDER_OFFSETS.includes(daysUntil)) continue;
      for (const member of activeMembers.filter(item => item.chamaId === chamaId)) {
        const item = addNotification(state, {
          recipientId: member.id,
          chamaId,
          category: "meeting",
          title: `Chama meeting in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
          text: `Your Chama meeting is scheduled for ${date}.`,
          notificationKey: `meeting-reminder:${chamaId}:${month}:${date}:${daysUntil}`,
          at,
        });
        if (item) added.push(item);
      }
    }
  }

  const usersById = new Map(activeMembers.map(user => [user.id, user]));
  for (const loan of Array.isArray(state?.loans) ? state.loans : []) {
    if (loan?.status !== "approved" || !Array.isArray(loan.schedule)) continue;
    const borrower = usersById.get(loan.memberId);
    if (!borrower || borrower.chamaId !== loan.chamaId) continue;
    for (const [index, row] of loan.schedule.entries()) {
      if (!isCalendarDate(row?.dueDate)) continue;
      const remaining = Math.max(0, (Number.isSafeInteger(row.installment) ? row.installment : 0)
        - (Number.isSafeInteger(row.paidPrincipal) ? row.paidPrincipal : 0)
        - (Number.isSafeInteger(row.paidInterest) ? row.paidInterest : 0));
      if (!remaining) continue;
      const installmentNo = Number.isSafeInteger(row.no) ? row.no : index + 1;
      const daysUntil = daysBetween(today, row.dueDate);
      if (REMINDER_OFFSETS.includes(daysUntil)) {
        const item = addNotification(state, {
          recipientId: borrower.id,
          chamaId: loan.chamaId,
          category: "loan_due",
          title: "Loan repayment due soon",
          text: `Your KES ${remaining} loan installment is due in ${daysUntil} day${daysUntil === 1 ? "" : "s"} on ${row.dueDate}.`,
          notificationKey: `loan-due:${loan.id}:${installmentNo}:${daysUntil}`,
          at,
        });
        if (item) added.push(item);
      } else if (daysUntil !== null && daysUntil < 0) {
        const item = addNotification(state, {
          recipientId: borrower.id,
          chamaId: loan.chamaId,
          category: "loan_overdue",
          title: "Loan repayment overdue",
          text: `Your KES ${remaining} loan installment due on ${row.dueDate} remains unpaid. Please contact your Chama Treasurer about repayment.`,
          notificationKey: `loan-overdue:${loan.id}:${installmentNo}`,
          at,
        });
        if (item) added.push(item);
      }
    }
  }

  return added;
}

module.exports = { PUSH_CATEGORIES, addNotification, notifyMembers, collectDueReminders, daysBetween, isCalendarDate };
