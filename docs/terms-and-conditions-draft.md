# Jirani Chama Terms and Conditions

**Status: working draft for review. Do not publish as final or rely on it as evidence of acceptance.** The bracketed items require the operator’s confirmation. Product statements must be checked against the live deployment and current contracts. This draft is not a legal opinion and cannot guarantee that a dispute or claim will not arise.

**Draft date:** 12 November 2026
**Proposed operator:** [registered legal name, legal form, and country of establishment]  
**Registered or principal address:** [postal and physical address]  
**Legal notices and complaints:** 09elim3@gmail.com, currently shown on the public website. Confirm that this inbox is monitored and provide any required postal contact.

## Contents

- [Important points](#1-important-points)
- [Definitions](#2-definitions)
- [Who enters the agreement](#3-who-enters-the-agreement)
- [What the App does](#4-what-the-app-does)
- [Payment and subscription limits](#5-payment-and-subscription-limits)
- [Accounts and PINs](#6-creating-activating-and-using-an-account)
- [User and Chama responsibilities](#7-user-and-chama-responsibilities)
- [Group records, corrections, and history](#8-group-records-corrections-and-history)
- [Messages, attendance, invitations, and exports](#9-messages-attendance-invitations-and-exports)
- [Privacy](#10-privacy-and-personal-information)
- [Acceptable use and security](#11-acceptable-use-and-security)
- [Fees and product changes](#12-fees-account-limits-and-product-changes)
- [Suspension, closure, and records](#13-suspension-closure-and-records-after-access-ends)
- [Availability and support](#14-service-availability-and-support)
- [Responsibility and non-waivable rights](#15-responsibility-and-non-waivable-rights)
- [Complaints and dispute handling](#16-complaints-and-dispute-handling)
- [Governing law](#17-governing-law)
- [Version and acceptance record](#18-version-notice-and-acceptance-record)
- [Operator and legal notices](#19-operator-and-legal-notices)

### More detail from official sources

- [Kenya Consumer Protection Act, 2012](https://kenyalaw.org/akn/ke/act/2012/46/eng@2022-12-31)
- [Kenya Data Protection Act, 2019](https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31)
- [Data Protection (General) Regulations, 2021](https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-12-31)
- [National Payment System Act, 2011](https://kenyalaw.org/akn/ke/act/2011/39/eng@2025-11-04)
- [CBK Non-Deposit Taking Credit Providers Regulations, 2026](https://kenyalaw.org/akn/ke/act/ln/2026/191/eng@2026-09-29)
- [Kenyan legal research notes and applicability limits](kenyan-legal-research-notes.md)

## 1. Important points

Jirani Chama is intended to help savings groups keep digital records and manage group workflows. It does not, on the information provided for this draft, hold or transfer members’ money, disburse loans, or process live subscription charges.

A record in Jirani Chama is information entered or actioned by a user. It is not, by itself, independent confirmation from a bank, mobile-money provider, borrower, lender, or other third party that money moved or an event occurred. The group and its members must check entries against their own source records.

The application currently has no recorded Terms acceptance step. This draft cannot be described as accepted by any user until an affirmative, version-specific acceptance process is implemented and the server retains reliable evidence of it.

## 2. Definitions

In these Terms:

- **App** means the Jirani Chama web application and related services operated by the operator identified above.
- **Operator** means the legal person or entity that owns or provides the App. The registered name must be inserted before publication.
- **Chama** or **group** means the savings group whose members and records are managed through an App account.
- **Group officer** means a person assigned a Chairperson, Secretary, or Treasurer role for a Chama.
- **Member** means a person with an active or invited membership in a Chama using the App.
- **User** means a person who accesses or uses the App, including a group officer or Member.
- **Group record** means information entered or generated for a Chama, including membership, contribution, loan, repayment, ledger, attendance, message, invitation, dividend, penalty, election, and audit-history information.
- **Policy version** means the dated, identifiable copy of these Terms presented for acceptance.

## 3. Who enters the agreement

These Terms govern the relationship between the Operator and each User who accepts them. A Chama may also have a constitution, bylaws, member agreement, or other rules. Those documents govern the group’s internal decisions and do not become terms of the Operator’s service agreement merely because the App stores them.

A group officer may act for a Chama only to the extent that the Chama has authorized that person to do so. The Operator does not decide whether an officer has authority under the Chama’s constitution or applicable law.

**Complete before publication:** identify whether the customer is the Chama, the officer who registers it, each individual Member, or more than one of these; describe how authority to accept on behalf of a Chama is established; and state which terms apply to an officer acting for the group.

## 4. What the App does

The App provides digital tools for group administration and recordkeeping. Based on the current project scope, these include:

- member accounts, roles, invitations, and membership status;
- contribution and related group-fund entries, transaction records, and ledger views;
- loan requests, Chama-configured automatic eligibility decisions, human-review records, repayment records, and outstanding-balance records;
- attendance registers and meeting dates;
- group messages and in-app activity history;
- officer changes and election workflows;
- penalty, dividend, export, and month-end review workflows where enabled in the relevant account.

The App applies server-side role and workflow rules to some actions. The App’s rules do not replace the Chama’s governing documents or legal obligations. The Operator must keep this feature list current and remove any item that is not live for the relevant users.

### 4.1 Loan workflow recorded in the App

The Chairperson configures each Chama’s eligibility policy; the App supplies no universal numeric thresholds. When rules are configured, each application is assessed immediately without a Chairperson or Treasurer vote. The first configured amount tier that covers the requested principal sets that tier’s minimum active-membership period and minimum recorded share-capital contributions. The requested amount must also fit within both (a) the configured percentage of the Chama’s recorded balance and (b) the configured percentage of the borrower’s recorded share-capital contributions after existing principal exposure is deducted. The borrower must select exactly two distinct active guarantors, whose combined unpledged share capital must cover the request. A request passing every check is recorded as approved; otherwise it is rejected with reasons. The decision record stores the policy version and eligibility inputs. Chairperson, Secretary, and Treasurer accounts can inspect the Chama’s loan records, but this access is not a vote or approval step for a new request. The reviewed App allows only the Chairperson to change the eligibility policy.

The borrower may ask for one human review and give an explanation. A non-conflicted Chairperson, Secretary, or Treasurer may confirm the recorded decision, reassess a rejected application against the original saved policy after checking the relevant records, or withdraw an approval only after confirming that no money was disbursed outside the App. The officer’s action, reasons, and outcome are recorded. The App has no configured response deadline or guaranteed alert to a reviewer; the Chama must set and communicate a practical response target and escalation route before real lending.

For a new application, the App supports loan terms of 1, 2, 3, or 6 months and uses a reducing-balance monthly-interest model. Each Chama’s monthly rate is stored separately and is included in a server-generated estimate shown before submission, including estimated interest, total payable, and the installment amounts and due dates. The estimate uses the amount, term, current Chama rate, and current server calculation; it is not a binding offer, does not reserve funds, and does not confirm an external transfer. An approved record stores the rate and repayment schedule used for that decision. Repayments are applied to interest before principal under the reviewed product rule. This build has no officer/member screen for changing the rate after Chama setup. Before any rate is changed outside setup, the Chama must authorize it and the product must provide a controlled, auditable change process; otherwise new applications should not be made on a rate that has changed without notice. Because the App neither transfers funds nor records the actual off-app disbursement date, do not treat the approval record or projected schedule alone as proof that a loan was advanced or as a complete loan agreement. Before money is advanced, the actual lender must confirm the amount and date advanced, rate and method, total amount payable, due dates, fees, guarantor obligations and release, and consequences of late payment or default.

These statements describe the reviewed App workflow; they do not establish whether the Operator or a Chama is legally a lender or credit provider. Regulation 3 of the [CBK Non-Deposit Taking Credit Providers Regulations, 2026](https://kenyalaw.org/akn/ke/act/ln/2026/191/eng@2026-09-29) defines scope and exclusions, and regulation 54 sets disclosures for providers within scope. The actual legal entity, group form, and lending model must be assessed; do not assume that every Chama is covered or exempt. The responsible controller must also assess the automated-decision rights and safeguards under section 35 of the [Data Protection Act, 2019](https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31) and regulations 22 and 49 of the [Data Protection (General) Regulations, 2021](https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-12-31). This is not legal advice or a finding of compliance. Confirm all product behavior against production and obtain Kenyan counsel’s review before publication or real lending.

### 4.2 Records and calculations

The App may calculate balances or summaries from stored entries. Such results depend on the completeness and accuracy of the underlying records and the current software rules. The Operator does not independently audit the Chama’s cash, bank account, mobile-money account, receipts, or source documents merely because a value appears in the App.

A generated report, export, calculation, or audit-history entry must not be described as an independent audit, bank statement, payment confirmation, legal opinion, or guaranteed proof of a transaction.

## 5. Payment and subscription limits

The information supplied for this draft says live payment processing and subscription billing are disabled. The existing public page describes an M-Pesa C2B subscription verifier as sandbox-only and disabled until the required callback configuration is complete. This is not a live payment feature. Choosing a plan or reporting a payment does not trigger a charge or activate access. Verify these points against the production build before publication. The App does not, on that basis, collect, hold, transfer, settle, or disburse members’ money.

A manually entered amount, reference, receipt, or status is a group record. It is not confirmation from Safaricom, M-Pesa, a bank, or another payment provider. No claim about SMS delivery, M-Pesa integration, automatic reconciliation, or payment verification should be made unless that feature is live and verified.

If a price or plan is displayed while payment is disabled, the page must say exactly what the displayed amount means and whether anyone owes it. The Operator must not collect a fee or activate a paid plan on the strength of this draft. Before introducing charges, the Operator must publish the actual price, payment terms, renewal or cancellation rules, provider, and any applicable consumer disclosures, and obtain the agreement required by Kenyan law.

**Complete before publication:** confirm whether the App is entirely free, whether any group pays the Operator off-platform, whether an activation or setup fee exists, and whether any live payment integration or payment-data processing is present.

## 6. Creating, activating, and using an account

A person must provide accurate information requested for account creation or activation and must use an account only for themselves and the Chama to which it belongs. A User must not impersonate another person, use another person’s credentials, or create an account without the required authority.

A User must keep their PIN private, avoid sharing it, and notify the Operator or an authorized group officer promptly if the account may have been compromised. The User must not put a PIN, activation code, recovery code, or session credential into a message, support request, or group record.

The Operator’s current server implementation derives a stored PIN hash rather than storing the PIN as readable text. This statement must be rechecked against the production build and all supported storage modes before publication. The Operator cannot promise that any account is immune to compromise.

### 6.1 Group access and roles

The App uses the roles Chairperson, Secretary, Treasurer, and Member. Each User must stay within the server-authorized permissions for that role and must not try to bypass them. Group officers are responsible for reviewing membership and officer assignments and requesting changes when a person should no longer have access.

The Chama must make its own decision about who should have access to its records. The Operator must provide the verified process for invitations, role changes, access removal, and disputed role assignments before this section is published.

### 6.2 Account recovery and support

Use only the recovery flow available in the App. The Operator or the responsible Chama may ask for information reasonably needed to verify a request, but should not ask a User to disclose their PIN. A recovery code should be shared only through the method shown in the live App.

**Complete before publication:** identify the monitored support channel, recovery methods actually in service, normal response targets, and the escalation route for a locked or compromised account. Do not promise email or SMS delivery unless it is configured and working.

## 7. User and Chama responsibilities

Each User must:

1. use the App lawfully and only for authorized group work;
2. enter information carefully and correct errors promptly through the supported process;
3. protect their PIN, activation code, recovery code, and exported files;
4. respect the privacy and access rights of other Members;
5. report suspected account compromise, unauthorized disclosure, or a material record error; and
6. keep source records needed to verify the Chama’s transactions and decisions.

Each Chama and its authorized officers are responsible, as applicable, for:

1. adopting and applying valid group rules, approval procedures, and financial controls;
2. deciding what member information is needed and ensuring that a lawful basis exists for collecting and using it;
3. telling Members what records will be kept and who in the group can see them;
4. assigning roles only to authorized people and reviewing access when membership changes;
5. checking contribution, loan, repayment, penalty, dividend, attendance, and ledger entries against source records;
6. deciding how to address a disputed group entry, approval, or loan; and
7. meeting duties that apply to the Chama because of its legal form, registration, bylaws, or activity.

These responsibilities do not release the Operator from its own duties under data-protection, consumer, contract, security, or other applicable law.

## 8. Group records, corrections, and history

A User who enters information must have authority to do so and must take reasonable care to enter the correct person, amount, date, reference, and record type. An officer who reviews or approves information must do so under the Chama’s rules and must not approve their own loan request where the App prohibits it.

If a record is wrong, report the specific Chama, record type, date, amount or other identifying details, and the correction requested. Do not send a PIN or unnecessary sensitive information with the report. The Chama should check the source documents and decide whether the record is inaccurate. Where the App supports a correction workflow, the correction should identify what changed, who made the change, and when, without silently presenting a disputed record as verified.

A request to correct personal data and a request to change a Chama’s financial record may involve different decision-makers. The Operator must route a request to the relevant controller when it processes the record for the Chama. A financial or audit record may need to be restricted rather than erased where the law permits or requires retention. No promise of unconditional deletion is made.

**Complete before publication:** state the actual in-app correction route, whether users can challenge a record, how a correction is reviewed, whether the original value remains in history, who can see that history, and when a record may be restricted or removed.

## 9. Messages, attendance, invitations, and exports

Messages and attendance entries are part of the Chama’s records. Users must not use messages to threaten, defraud, harass, impersonate, disclose information without authority, or distribute unlawful material. The Operator’s handling of a report, review, or removal request must follow a written process and applicable law.

An invitation may identify the intended recipient and proposed role and may contain an activation mechanism. The person inviting another Member must have authority to do so and must use the contact details only for that invitation and related group administration.

A CSV or other export can contain personal and financial information. The User who exports it must keep it secure, send it only to an authorized recipient, and delete or secure copies when they no longer need them. Group officers must consider whether an export includes information about other Members before sharing it.

**Verify before publication:** the exact export fields, invitation expiry and delivery channel, message visibility, moderation/reporting route, and whether any external notification is sent. Do not describe in-app reminders as SMS.

## 10. Privacy and personal information

The Privacy Policy describes the information handled by the App, the purposes and legal bases, who can receive it, how long it is kept, and how a person can exercise their rights. The Privacy Policy is a separate notice. Accepting these Terms is not blanket consent to all processing.

For group records, the Chama may determine the purposes and means of processing and the Operator may act on the Chama’s documented instructions. The Operator may have a separate role for account administration, platform security, or support. The actual role must be determined for each purpose, not selected simply by wording in this agreement.

Read the [Privacy Policy draft](privacy-policy-draft.md). A public Privacy page is linked from the landing-page footer and is explicitly marked as a working draft. It does not complete the missing facts or record acceptance of a final notice.

## 11. Acceptable use and security

A User must not:

- access, export, alter, or disclose records outside their authority;
- attempt to bypass authentication, role checks, tenant boundaries, or rate limits;
- probe, disrupt, overload, or interfere with another account, Chama, or the service;
- introduce malware or use the service to commit fraud or another unlawful act;
- harvest personal information or use group data for an unrelated purpose; or
- make a false report or use the service to intimidate another Member.

A User should report a suspected security issue to **[security contact]** and should not publish a vulnerability or another person’s personal data before giving the Operator a reasonable opportunity to respond. **Complete before publication:** add a monitored security contact and a clear reporting process.

## 12. Fees, account limits, and product changes

At the date of this draft, the Operator has stated that subscription billing is disabled. Any free access, trial, member limit, or account limit must be described only if it is actually in force and accurately shown in the App.

The Operator may maintain or change features, correct defects, or suspend a feature for security or legal reasons. If a change materially affects a User’s rights, access, or charges, the Operator should give notice through **[verified notice channel]** and obtain any updated agreement required by law. The Operator must not silently add a payment obligation.

## 13. Suspension, closure, and records after access ends

The Operator or Chama may need to suspend access to protect an account, correct a security issue, respond to a legal requirement, or implement a valid group decision. Any suspension should be limited to the reason for it and should include notice and a route to challenge the decision where appropriate and lawful.

When a person leaves a Chama or an account is closed, the Chama and Operator must apply the retention and access rules in the Privacy Policy. Removing a person’s access does not automatically erase the Chama’s historical accounting or audit records. A person may still exercise applicable data rights, subject to lawful exceptions.

**Complete before publication:** identify who can suspend or close each account, what notice is given, how a user can appeal, how the Chama exports records, how long exports remain available, and the deletion or restriction process for each record class.

## 14. Service availability and support

The Operator should provide a support contact and a reasonable process for reporting errors, outages, security issues, and complaints. The service may be unavailable during maintenance or due to an event outside the Operator’s control. The Operator should communicate material interruptions when practicable.

No uptime percentage, recovery time, backup restoration time, or service-level commitment is made in this draft. Add one only after it has been approved and can be met in practice.

## 15. Responsibility and non-waivable rights

Nothing in these Terms excludes or limits a right or remedy that Kenyan law does not allow the parties to exclude or limit. Any allocation of responsibility must be clear, proportionate, and consistent with consumer and data-protection law.

The Operator must not use a blanket clause to disclaim its own unlawful conduct, data-protection duties, security failures, or obligations that cannot lawfully be waived. The Chama and Members remain responsible for the decisions they make and information they enter, but that does not remove the Operator’s own legal responsibilities.

**Kenyan counsel should draft and review any detailed warranty, liability cap, indemnity, force-majeure, service-termination, and dispute-resolution clauses against the Operator’s legal identity, business model, and actual controls.**

## 16. Complaints and dispute handling

For a service complaint, send a written message to **09elim3@gmail.com** after confirming that the address is monitored. Include the account or Chama name, the date and time of the event, the screen or record involved, and what outcome you seek. Do not include a PIN, activation code, recovery code, or another person’s unrelated personal information.

A complaint about a Chama’s contribution, loan, approval, penalty, attendance, or other group decision should also be sent to the Chama’s authorized contact. The Operator can investigate how the App handled data or a request but cannot decide the merits of a group’s underlying financial agreement unless it has separately agreed to do so.

The parties should first try to resolve an operational complaint through the stated contact channel. This does not require a person to give up a statutory right, delay urgent relief, or avoid a competent court or regulator. Any mandatory pre-action step, mediation clause, limitation period, or exclusive forum must be reviewed by Kenyan counsel before inclusion.

**Complete before publication:** identify the Chama complaint channel, response target, escalation route, and the Operator’s process for recording, investigating, and closing complaints.

## 17. Governing law

These Terms are intended to be governed by the laws of Kenya. Disputes remain subject to the jurisdiction of any court or tribunal that has authority under Kenyan law. This section must be checked against the Operator’s legal identity, place of establishment, customers, and any mandatory consumer forum or legal procedure.

## 18. Version, notice, and acceptance record

Every published version must have an effective date and a unique version identifier. The Operator must preserve an unaltered copy of each version presented to users and be able to retrieve the version associated with a particular acceptance.

When the acceptance flow is implemented, the server should record at least the user/account identifier, relevant Chama or role where applicable, policy version, acceptance time in a defined timezone or UTC, and the event’s source. The record must be protected against unauthorized editing, included in an auditable process, and retained under the Privacy Policy’s retention schedule. Do not collect extra device or network data solely for acceptance evidence unless there is a documented need and lawful basis.

A user must actively select an unchecked acceptance control after being given access to the document. A privacy notice acknowledgment, if used, must be separate from Terms acceptance. Neither control is blanket consent to unrelated processing. A person who declines Terms must not be recorded as having accepted them.

**Current status:** no in-app Terms acceptance or server-side acceptance record was found in the reviewed source. This clause is a proposed requirement, not a description of current functionality.

## 19. Operator and legal notices

Operator: **[registered legal name and legal form]**  
Address: **[postal and physical address]**  
General contact: **[monitored email and telephone, if applicable]**  
Privacy contact: **[confirmed monitored privacy address]**  
Security contact: **[monitored security address]**  
Legal notices: **[postal and electronic delivery instructions]**

The currently published email address is **09elim3@gmail.com**. Confirm whether it is suitable for each of these uses before publication.

## Publication checklist

This draft is not publication-ready until the Operator’s identity and contracting parties are confirmed; the service, fees, exports, notices, correction process, complaint procedure, loan-interest disclosure, guarantor terms, and account-closure behavior are checked against production; the configured loan thresholds and recorded membership dates are verified; the automated-decision DPIA and human-review process are complete where required; the acceptance workflow and evidence storage are implemented if mandatory assent is required; and a Kenyan lawyer has reviewed the final text. The Privacy Policy’s data map, transfer details, retention schedule, contact routes, and security statements must also be completed.

## Legal references for the reviewer

The drafting research considered the Data Protection Act, 2019; Data Protection Regulations; Consumer Protection Act, 2012; Kenya Information and Communications Act; National Payment System Act; the 2026 Central Bank of Kenya (Non-Deposit Taking Credit Providers) Regulations; and relevant laws for registered cooperatives and groups. Source links and applicability limits are in [Kenyan legal research notes](kenyan-legal-research-notes.md).
