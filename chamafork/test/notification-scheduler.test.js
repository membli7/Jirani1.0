"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { collectDueReminders, addNotification } = require("../notification-scheduler");

function baseState() {
  return {
    chamas: [{ id: "chama-a" }, { id: "chama-b" }],
    users: [
      { id: "member-a", chamaId: "chama-a", status: "active" },
      { id: "member-b", chamaId: "chama-b", status: "active" },
      { id: "inactive", chamaId: "chama-a", status: "inactive" },
    ],
    transactions: [],
    loans: [],
    messages: [],
    settings: {
      meetingDates: { "2026-11": "2026-11-16" },
      meetingDatesByChama: {
        "chama-a": { "2026-11": "2026-11-16" },
        "chama-b": { "2026-11": "2026-11-16" },
      },
    },
  };
}

const deadlineForMonth = month => month === "2026-11" ? "2026-11-16" : `${month}-05`;
const transactionDate = item => item.date || item.at.slice(0, 10);

test("three-day reminders cover unpaid contributions and explicit meetings for active members only", () => {
  const state = baseState();
  const added = collectDueReminders(state, {
    today: "2026-11-13",
    at: "2026-11-13T07:45:00.000Z",
    deadlineForMonth,
    minimumContribution: 500,
    transactionDate,
  });
  assert.deepEqual(added.map(item => [item.recipientId, item.category]).sort(), [
    ["member-a", "contribution_due"], ["member-a", "meeting"],
    ["member-b", "contribution_due"], ["member-b", "meeting"],
  ].sort());
  assert.equal(added.every(item => item.chamaId === (item.recipientId === "member-a" ? "chama-a" : "chama-b")), true);
});

test("paid minimum, one-day timing, and duplicate sweeps behave correctly", () => {
  const state = baseState();
  state.transactions.push({ id: "paid", chamaId: "chama-a", memberId: "member-a", paymentType: "Monthly Contribution", amount: 500, status: "confirmed", contributionMonth: "2026-11", date: "2026-11-12" });
  const first = collectDueReminders(state, { today: "2026-11-15", deadlineForMonth, minimumContribution: 500, transactionDate });
  assert.equal(first.some(item => item.recipientId === "member-a" && item.category === "contribution_due"), false);
  assert.equal(first.filter(item => item.category === "meeting").length, 2);
  assert.equal(collectDueReminders(state, { today: "2026-11-15", deadlineForMonth, minimumContribution: 500, transactionDate }).length, 0);
});

test("meeting reminders stay within the Chama that scheduled them and suppress ambiguous legacy dates", () => {
  const state = baseState();
  state.settings.meetingDatesByChama = { "chama-a": { "2026-11": "2026-11-16" } };
  const scoped = collectDueReminders(state, { today: "2026-11-13", deadlineForMonth, minimumContribution: 500, transactionDate });
  assert.deepEqual(scoped.filter(item => item.category === "meeting").map(item => [item.recipientId, item.chamaId]), [["member-a", "chama-a"]]);

  state.settings.meetingDatesByChama = {};
  const ambiguous = collectDueReminders(state, { today: "2026-11-13", deadlineForMonth, minimumContribution: 500, transactionDate });
  assert.equal(ambiguous.some(item => item.category === "meeting"), false);
});

test("single-Chama installations can continue using a legacy meeting date", () => {
  const state = baseState();
  state.chamas = [{ id: "chama-a" }];
  state.users = state.users.filter(user => user.chamaId === "chama-a");
  state.settings.meetingDatesByChama = {};
  const added = collectDueReminders(state, { today: "2026-11-13", deadlineForMonth, minimumContribution: 500, transactionDate });
  assert.deepEqual(added.filter(item => item.category === "meeting").map(item => item.recipientId), ["member-a"]);
});

test("loan reminders use each unpaid schedule balance and overdue notices deduplicate by installment", () => {
  const state = baseState();
  state.loans.push({
    id: "loan-a", chamaId: "chama-a", memberId: "member-a", status: "approved",
    schedule: [
      { no: 1, dueDate: "2026-11-16", installment: 1200, paidPrincipal: 500, paidInterest: 100 },
      { no: 2, dueDate: "2026-10-10", installment: 900, paidPrincipal: 0, paidInterest: 0 },
    ],
  });
  const added = collectDueReminders(state, { today: "2026-11-13", deadlineForMonth, minimumContribution: 500, transactionDate });
  const due = added.find(item => item.category === "loan_due");
  assert.match(due.text, /KES 600 loan installment/);
  const overdue = added.find(item => item.category === "loan_overdue");
  assert.match(overdue.text, /due on 2026-10-10 remains unpaid/);
  assert.equal(collectDueReminders(state, { today: "2026-11-13", deadlineForMonth, minimumContribution: 500, transactionDate }).length, 0);
});

test("a fine or decision notification key is deduplicated per recipient and Chama", () => {
  const state = baseState();
  const input = { recipientId: "member-a", chamaId: "chama-a", category: "fine", title: "Fine recorded", text: "A fine was recorded.", notificationKey: "fine:fine-1", at: "2026-11-13T07:45:00.000Z" };
  assert.ok(addNotification(state, input));
  assert.equal(addNotification(state, input), null);
  assert.ok(addNotification(state, { ...input, recipientId: "member-b", chamaId: "chama-b" }));
});
