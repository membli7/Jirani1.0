# Jirani Chama Privacy Policy

**Status: detailed working draft for review. Do not publish as final until the bracketed facts are verified and completed.** This draft describes the product and code reviewed on 13 November 2026. Production settings, contracts, providers, and data practices may differ and must be checked. This document is not legal advice and cannot guarantee an outcome in a complaint or court case.

**Proposed operator:** [registered legal name and legal form]  
**Address:** [postal and physical address]  
**Privacy and service support:** [09elim3@gmail.com](mailto:09elim3@gmail.com), the contact supplied for the service. Before publication, confirm who controls the mailbox, that it is monitored, and that access and handling are suitable for privacy requests.<br>
**Data Protection Officer:** [name/contact if appointed or required]  
**ODPC registration status/certificate:** [UNRESOLVED — confirm whether registration is required for each relevant entity and verify actual status. If registered, enter the registered entity and certificate number; if an application is pending, state that it is pending, not registered.]<br>
**Policy version:** [unique version]  
**Effective date:** [date after verification and publication]

## Contents

- [1. Scope and service](#1-scope-and-service)
- [2. Who is responsible for the data](#2-who-is-responsible-for-the-data)
- [3. Personal data the App handles](#3-personal-data-the-app-handles)
- [4. Where data comes from](#4-where-data-comes-from)
- [5. Why data is used and the legal basis](#5-why-data-is-used-and-the-legal-basis)
- [6. Who can see data and when it is shared](#6-who-can-see-data-and-when-it-is-shared)
- [7. Storage, service providers, and transfers](#7-storage-service-providers-and-transfers)
- [8. Retention, closure, and deletion](#8-retention-closure-and-deletion)
- [9. Your rights and how to make a request](#9-your-rights-and-how-to-make-a-request)
- [10. Accuracy, corrections, and disputed group records](#10-accuracy-corrections-and-disputed-group-records)
- [11. Security and data breaches](#11-security-and-data-breaches)
- [12. Children’s data](#12-childrens-data)
- [13. Cookies and session technologies](#13-cookies-and-session-technologies)
- [14. Automated decisions and profiling](#14-automated-decisions-and-profiling)
- [15. Policy updates and notice](#15-policy-updates-and-notice)
- [16. Contact and complaints](#16-contact-and-complaints)
- [17. More information and official sources](#17-more-information-and-official-sources)

## 1. Scope and service

This policy explains how personal data is handled in the Jirani Chama web application (the **App**). Personal data is information that identifies a person or can reasonably be linked to them. It includes ordinary account details and may include records about a person’s contributions, loans, guarantors, repayments, attendance, messages, or group role.

The App is described as a recordkeeping and administration tool for savings groups. On the product information supplied for this draft, it does not itself disburse loans or move members’ money, and live subscription billing is disabled. A record entered in the App is not independent confirmation from a bank or mobile-money provider. Verify these statements against the production deployment and contracts before publication.

This policy applies to the App’s web service and related account, support, and security processes that the Operator controls. A Chama may separately decide how it uses member and financial records. Its own privacy notice or member rules may also apply. This policy does not replace a Chama’s duty to tell its members how it uses their information.

Read the [Terms and Conditions draft](terms-and-conditions-draft.md) for the service agreement. Accepting the Terms is not blanket consent to every use of personal data.

## 2. Who is responsible for the data

The legal identity of the Operator must be completed above. The name “Jirani Chama” alone may be a product name, not the legal person responsible for the service. Before this policy is published, the Operator must state its registered legal name, legal form, address, and a monitored contact channel.

The person or entity responsible for a particular use of data is called the **data controller** under Kenya’s Data Protection Act. A person handling data on a controller’s instructions is a **data processor**. The actual role depends on who decides why and how the data is used, not only on what a contract calls the parties.

| Data activity | Likely role to verify | What must be confirmed |
|---|---|---|
| A Chama’s membership, contributions, loans, attendance, messages, and group decisions | The Chama may be controller; the Operator may be processor | Which legal person in the Chama decides each purpose, who can instruct the Operator, and whether a written data-processing agreement exists. |
| App account administration, sign-in security, and support | The Operator may be an independent controller for some purposes | Exact purposes, lawful basis, retention, contact, and whether any information is shared with the Chama. |
| Hosting, database, session storage, email, and support tools | Providers may act as processors or sub-processors | Provider identity, purpose, access, countries, contract terms, security measures, and deletion/return obligations. |

A single organisation may be a controller for one activity and a processor for another. Each party must comply with the duties that apply to its actual role. **Complete the role map and identify the relevant Chama contact before publication.**

## 3. Personal data the App handles

The categories below are based on the database schema and server behavior reviewed for this draft. The database also has flexible `record_data` and `state_data` fields. Those fields can contain additional information, so the Operator must compare this list with real production records and every application write path before publishing it.

| Category | Examples visible in the reviewed data model | Why the information matters |
|---|---|---|
| Chama and group settings | Group name, group identifier, contribution due date, welfare contribution, penalty and loan-rate settings, meeting dates, and other configured rules | Identifies the group and supplies the settings used to display or calculate group records. |
| Account and contact details | Name, Kenyan phone number, email address where provided, account status, creation date, and profile details | Creates and administers an account, supports identification and contact, and records whether an account is active, invited, or inactive. |
| Membership and role | Chama membership, Chairperson/Secretary/Treasurer/Member role, invitation and membership status | Controls access to group features and records. The exact visibility of each record type by role must be verified against the current server permissions. |
| Authentication and recovery | PIN used to sign in, stored PIN hash, temporary PIN-change status, invitation-code hash, password/PIN reset challenge data held in a session, and expiry timestamps | Verifies access, activates accounts, supports recovery, and reduces unauthorized use. The reviewed server derives a PIN hash with `scrypt`; confirm the production build and storage mode before stating this as a live control. The plain PIN should not be kept in readable form. |
| Contributions and penalties | Member identifier, amount, contribution month/date, method, reference number, note, welfare/share-capital/penalty amounts, status, and the person recording the entry | Maintains the group’s record of amounts attributed to a Member and who entered or changed an entry. |
| Loans, estimates, guarantors, automated decisions, and repayments | Requested amount and term; Chama-specific monthly rate; estimated interest, total payable, and installment amounts/due dates; applied rate and saved schedule; borrower, principal, outstanding amount, membership-start date/days, recorded share-capital contributions, Chama balance, existing principal, selected amount tier and policy version, guarantor identities and pledged/unpledged share-capital capacity, decision criteria/reasons, human-review request and response, repayments, principal/interest allocation, methods, references, and dates | Estimates and records a Chama loan request, explains an automated decision, and records later repayment or review. These may reveal a person’s financial circumstances; verify actual production fields and role access before publication. |
| Transactions and ledger | Transaction type, amount, status, method, reference, related Member or loan, recording User, debit/credit account entries, descriptions, and timestamps | Supports group bookkeeping and summaries. These are App records, not external payment confirmations. |
| Attendance and meeting registers | Member, meeting date, presence/absence, recorder, register revisions, and correction history | Keeps group participation records and shows who recorded or revised them. |
| Messages | Message body, author, group, timestamp, and related record fields | Allows group communication and may contain personal or financial information that users include in messages. |
| Invitations and leadership | Invitee name, phone, email, proposed role, inviter, invite status, code hash, expiry/use time, officer changes, proposals, ballots, and results where enabled | Invites members and records group leadership or election workflows. Verify every ballot and election field in production. |
| Dividends and penalties | Member, cycle dates, amounts, payment/status details, penalty status, and related group records | Records group allocations and amounts attributed to a Member. It does not establish that funds were transferred. |
| Audit and activity history | Event type, affected record, actor, role, date/time, and event details | Helps the Chama understand which account recorded an action. Audit history can itself reveal financial and personal information. Do not describe it as impossible to alter unless that has been independently verified. |
| Payment-related data, if enabled | The schema includes fields for transaction references and an M-Pesa callback payload. The reviewed product information says live payment handling is disabled. | Confirm whether production receives any callback, receipt, reference, or provider data. Do not publish that an M-Pesa integration works or that a callback is processed unless verified. |
| Support and contact messages | Information a person includes in a contact or support request and the reply address | Allows the Operator to respond. The server uses configurable SMTP for email; the actual provider and processing location are not identified here. |
| Technical and session data | Session identifier/cookie, access and security events, rate-limit records, request identifiers, and temporary recovery or OTP state where used | Maintains a sign-in session and protects the service. Confirm whether IP address, device/browser information, and web-server logs are collected and how long each is kept. |

Some financial records may reveal a person’s economic circumstances or other information protected by the Act, depending on context. The controller must classify the actual information and apply any additional legal safeguards that follow from that classification.

The Operator must not ask users to put PINs, recovery codes, or secret activation codes into group messages, notes, support forms, or financial references. If such a secret is received accidentally, the Operator should restrict access and follow its incident process.

## 4. Where data comes from

Data may come from:

1. **You**, when you register, sign in, update your profile, send a message, make a request, contact support, or enter a group record.
2. **Your Chama or its officers**, when they create an account, invite you, assign a role, or record information about your membership, contributions, loan, attendance, or group activity.
3. **Other Members**, when they create or update a record that identifies you or refers to a shared group activity.
4. **The App**, when it creates account, session, activity, audit, status, or calculation records as a result of a user action.
5. **A service provider**, only where a verified integration returns information to the App. No live payment or mobile-money data source is confirmed for this draft.

If a controller obtains information about you from another person rather than from you, it must provide the required notice within the timeframe and in the manner required by Kenyan law, subject to the exceptions that apply. The Chama and Operator must agree who sends that notice and how they prove it was provided.

### 4.1 Collection notice: fields, requiredness, and non-provision consequences

Before collecting personal data, and insofar as practicable, section 29 of the Data Protection Act requires notice of the fact and purpose of collection, the data subject’s rights, third-party recipients and safeguards, controller/processor contacts and other possible recipients, security measures, whether collection is under a law and whether provision is voluntary or mandatory, and the consequences of not providing requested data. The table maps the current forms and routes reviewed for this draft; it does not establish production settings or every data path.

“Required” below means required by the current form or server route for that task, not that a statute itself requires the field. The reviewed code does not establish that any listed field is mandated by a specific written law. **[CONFIRM for each purpose whether a field is required by a particular law, otherwise whether it is voluntary or needed for the service, and the responsible controller and lawful basis.]**

| Current form or route | Required and optional fields shown by the reviewed app | Purpose and consequence if required information is not provided |
|---|---|---|
| Initial Chama and Chairperson setup | Required: Chama name, Chairperson name, Kenyan phone, email, 6–12 digit PIN, monthly deadline day, welfare contribution, late-contribution penalty, loan monthly rate, separate Terms acceptance, and Privacy Notice acknowledgment. The four group settings are prefilled in the form but marked required. Optional in the form: operator bootstrap code, unless the deployment has configured one; the form says it is not saved with the account. | Creates the Chama and Chairperson account, configures group rules, and records the two separate policy choices. Missing or invalid required values or either unchecked choice means setup is rejected and no account or Chama is created. If a bootstrap code is configured, a missing or incorrect code is rejected. Verify its actual production handling. |
| Invite and activate a Member | Required for the inviter: invitee name, phone, email, and requested role. Required for activation: phone, activation code, new PIN, Terms acceptance, and Privacy Notice acknowledgment. No optional field is shown in these forms. | Creates and verifies an invitation, assigns its proposed role, and activates an account. Missing or invalid invitation fields prevent creation; missing or invalid activation data or either unchecked choice prevents account activation. Invitation delivery uses configured email, or a manually shared code when email is not configured. **[CONFIRM the actual email provider, recipients, countries, and how the invitee receives the section 29 notice before another person enters their details.]** |
| Sign-in and PIN recovery | Sign-in requires phone and PIN. Recovery requires the account email to request a code, then email, the reset code, and a new PIN to complete the reset. | Authenticates an account or restores access. Missing or invalid sign-in data prevents sign-in; no PIN reset is completed without the required valid recovery data. |
| Profile update | Required: first name, last name, phone, and email. Optional: nickname, which the app says is shown in group chat. A profile photo is a separate optional upload if chosen. | Maintains account contact and display details. Missing or invalid required fields prevent saving the profile; omitting the nickname or not uploading a photo does not prevent a profile-details update. **[CONFIRM photo processing, storage, provider, and retention details.]** |
| Contact form | Required: name, email, subject, and message. No optional field is shown. | Responds to a support or contact request. The route sends the message to `09elim3@gmail.com` through configurable SMTP; missing or invalid fields are rejected, and an unavailable mail service can prevent delivery. **[CONFIRM mailbox monitoring, SMTP provider and location, access, and message retention.]** |
| Loan application and review | Required for a new application: amount, repayment term (the form preselects one month; available terms are 1, 2, 3, or 6 months), and exactly two distinct active guarantors. Required to request one human review: a reason. The officer review form requires an outcome, confirmation that the member’s explanation was considered and that the officer has no conflict, information considered, and written reasons. | Assesses and records an application using the Chama’s saved rules and existing membership, contribution, balance, outstanding-loan, and guarantor records; a review records a post-decision human finding. Missing/invalid fields, no configured policy, or too few eligible guarantors prevents the application; a missing review reason prevents the review request. The current review record does not change the recorded loan status or authorize funding. |
| Cash contribution, repayment, or fine entry | Required: selected Member, amount, date, type, and note. Optional: receipt reference. A loan must be selected when the type is loan repayment; the method is fixed as cash. | Records an amount attributed to a Member. Missing required fields prevent the entry. This is an in-app record and does not itself transfer or verify money. |
| Attendance, chat, penalties, dividends, and elections | Attendance requires a meeting date and records present/absent status for active Members; chat requires message text; penalties require a month; dividend calculation requires cycle start/end dates and admin expenses; an election proposal requires an office, date, and 2–20 active Member candidates, while voting requires a candidate choice and a runoff requires a date. | Records meeting, message, penalty, dividend, or election activity. Missing required fields prevent that action; for dividends, a calculation is only a preview and a separate commit is needed before entries are added. **[CONFIRM any additional required/optional fields and omission behavior in all remaining production screens and routes.]** |

The rows above are a working inventory, not a verified exhaustive production data map. **[CONFIRM and document the remaining personal-data inputs, optional fields, purposes, and omission consequences, including officer changes, record corrections, push-notification subscriptions, exports, payment-related routes, flexible record fields, logs, and any production-only forms.]** For information entered about another person, **[CONFIRM who gives that person the required notice before or when their data is collected and how this is evidenced.]** Also complete the unresolved contacts, recipients, locations, security measures, lawful bases, and retention criteria in the sections below before publication.

## 5. Why data is used and the legal basis

The controller must identify a lawful basis for each purpose before using personal data. The list below explains possible purposes, not a conclusion that a particular basis applies. The controller must document the actual basis and tell people what it is. Consent is only one possible basis and must not be used as a substitute for deciding whether another basis applies.

| Purpose | Data used | Basis and responsible party to confirm |
|---|---|---|
| Create, authenticate, and maintain accounts | Account details, phone/email, role, PIN verification, session and recovery data | **[Operator: identify controller/processor role and legal basis. Explain if an account cannot be created without a particular field.]** |
| Maintain a Chama’s membership and administration | Membership, role, invitation, leadership, settings, attendance, messages | **[Chama/controller: record its lawful basis and member notice. Operator: document instructions if acting as processor.]** |
| Record and review group financial activity | Contributions, transactions, loans, repayments, penalties, dividends, ledgers, and audit history | **[Chama/controller: identify the basis, group rule, and any law requiring records. Do not assume all Chamas have the same legal form.]** |
| Estimate and explain loan costs, assess eligibility, and handle human review | Requested amount and term; Chama-specific monthly rate; estimated interest, total payable, installments and due dates; recorded membership duration and share-capital contributions; Chama-recorded balance; existing principal; configured amount tier; selected guarantors and available share capital; saved rate and schedule; policy version; decision, criteria, reasons, and review records | **[The relevant Chama/controller must identify the lawful basis, explain the estimate and rule-based decision and likely effects, verify the source records and group rules, and document the Operator’s role. Assess Data Protection Act section 35, General Regulations 22 and 49, and any credit-provider rules that apply to the actual entity and lending model.]** |
| Keep the service secure and investigate misuse | Authentication, access/session events, role changes, and security/audit data actually collected | **[Identify the controller, specific security purpose, lawful basis, access restrictions, and retention period.]** |
| Send account, activation, or recovery communications | Contact information and the minimum information needed for the requested message | **[Confirm which email/SMS channels work, which provider receives data, and the basis. Do not list SMS unless it is actually sent.]** |
| Respond to a contact or support request | Contact details and the contents of the request | **[Confirm the support controller, purpose, provider, and retention period.]** |
| Meet legal duties or establish, exercise, or defend a legal claim | Only information relevant to the duty or claim | **[Identify the particular duty or claim and the legal basis. Retain only for the applicable period.]** |
| Process a future payment or subscription | Payment account/reference and related status only if a live feature is introduced | Not active according to information supplied for this draft. Reassess the legal basis, recipient, CBK/payment classification, and notice before launch. |
| Record policy choices | User/account, separate Terms and Privacy Notice fingerprints, timestamps, source, and account/Chama context | For new accounts, the server records Terms acceptance and a separate Privacy Notice acknowledgment. The acknowledgment is not consent to unrelated processing. Existing accounts are not gated at sign-in, and updated-policy re-acknowledgment is not implemented. Set access and retention for these records before publication. |

Do not use group financial information for advertising, unrelated marketing, credit scoring, sale, or an unrelated commercial purpose unless that activity is actually introduced, lawfully assessed, clearly disclosed, and supported by the required choices or other basis. **Confirm whether analytics, marketing, tracking pixels, automated ranking, or model training are present before making a “we do not” statement in the public policy.**

## 6. Who can see data and when it is shared

### 6.1 Within a Chama

A Member can see their own loan decisions and review records. Under the reviewed server permissions, Chairperson, Secretary, and Treasurer accounts can see the Chama’s loan records; the Chairperson can change the loan rules. New requests are decided automatically, without a Chairperson or Treasurer vote. A non-conflicted officer can act only after a borrower asks for human review. Verify these permissions against production before publication.

A group officer must not share a Member’s record with people who have no legitimate group role or lawful need. Members should remember that a message or financial entry may be visible to other authorized people in the same Chama. Do not place a PIN, recovery code, identity document, or unnecessary sensitive detail in a shared record.

### 6.2 Operator and support access

The Operator and authorized support personnel may access personal data only to the extent needed for a documented purpose, such as maintaining the service, responding to support, securing an account, or meeting a legal duty. Before publication, specify which personnel can access live data, how access is approved and logged, and whether support can view production financial records.

### 6.3 Service providers

A provider may receive or access information to host, maintain, secure, communicate through, or support the service. The reviewed code supports PostgreSQL for application data, Redis for sessions in configurations that enable it, and configurable SMTP for email. These are software components, not the names or locations of the actual hosting and email companies.

**Before publication, list each real provider and relevant subprocessor, the type of data it receives, its role, country of storage/access, contract safeguards, retention, and deletion/return process.** Do not say “trusted providers” without identifying or describing them meaningfully.

### 6.4 Legal and safety disclosures

A controller may disclose information where the law requires it or where it receives a valid and properly scoped court or regulator order. The controller should check the request, disclose only what is required, preserve a record of the disclosure, and notify affected people where law permits and it is appropriate to do so.

If disclosure is needed to protect a person from an immediate serious threat, the controller must assess necessity, proportionality, and the legal basis before sharing. Do not promise absolute confidentiality against lawful process.

### 6.5 Sale and advertising

**Confirm before publication:** whether the Operator sells, rents, licenses, or shares personal data for advertising or another party’s independent commercial use. The current code review did not establish every production data flow. Do not publish a “we never sell your data” statement until the Operator has checked its contracts, analytics, hosting, and advertising configuration.

## 7. Storage, service providers, and transfers

The application data model includes PostgreSQL tables for users, memberships, contributions, loans, attendance, transactions, ledger entries, loan repayments, attendance registers, audit history, messages, invitations, dividends, penalties, and payment callback records. The schema also includes flexible JSON record fields. The exact information stored in those fields must be mapped from production data before this list is final.

The reviewed server supports a PostgreSQL database connection and Redis-based session storage in specified deployments. This does not identify the actual cloud provider, database region, Redis region, backup location, or where administrators and support personnel can access data.

**Complete before publication:**

- production database and session-store vendors and product names;
- primary, replica, backup, log, and recovery locations and countries;
- email and any other communication provider, including the data each receives;
- support, monitoring, crash-reporting, analytics, and security vendors;
- all countries from which a vendor or staff member can access personal data;
- the controller’s legal basis and safeguards for any transfer outside Kenya; and
- how the controller records and reviews those safeguards.

If a transfer outside Kenya occurs, the controller must meet the Data Protection Act and applicable ODPC guidance. Do not claim that data remains in Kenya or that a specific transfer safeguard applies until the relevant provider contract and actual configuration have been checked.

For more information, see the ODPC’s [Cross-border Data Transfers Guidance](https://www.odpc.go.ke/wp-content/uploads/2026/09/ODPC-%E2%80%93-Guidance-Notes-for-Cross-border-Data-Transfers.pdf) and the [Data Protection Act, 2019](https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31).

## 8. Retention, closure, and deletion

Personal data must not be kept in identifiable form for longer than the purpose requires, unless a legal obligation or another lawful ground justifies longer retention. A group financial record may need to remain available after a person leaves the Chama, but the controller must document why, limit access, and consider restriction or de-identification where appropriate.

The reviewed source did not provide a complete, public retention schedule for each record class. The table below is deliberately incomplete. Replace every bracket with an approved period or objective event-based criterion before publication. The schedule must include live data, exports, email copies, audit records, and backups.

| Record class | Proposed period or criterion | End-of-period action | Responsible party |
|---|---|---|---|
| Account and contact details | **[Set period after account closure or last activity; identify legal basis for any extension.]** | **[Delete, anonymise, or retain only fields required for a documented purpose.]** | **[Operator / Chama]** |
| PIN hash, session and recovery state | **[Set period; specify expiry for each reset/OTP/invitation challenge.]** | **[Expire and remove; revoke relevant sessions or tokens.]** | **[Operator]** |
| Membership, invitations, and role history | **[Set period after membership ends; distinguish open invitations from used/revoked invitations.]** | **[Remove contact data when no longer needed; retain necessary membership history under a defined ground.]** | **[Chama / Operator]** |
| Contributions, transactions, loan and repayment records | **[Specify period by record type and applicable group/legal requirement.]** | **[Retain, restrict, export, anonymise, or delete as legally permitted; document exceptions.]** | **[Chama/controller]** |
| Ledger and correction/audit history | **[Set period and explain why a correction history must remain.]** | **[Restrict access or de-identify where possible; document any non-deletion rule.]** | **[Chama / Operator]** |
| Messages and attendance | **[Set period and account for group rules and disputes.]** | **[Delete, anonymise, or restrict.]** | **[Chama/controller]** |
| Support and contact messages | **[Set period after case closure, subject to a legal claim.]** | **[Delete or de-identify; retain a minimal dispute record if justified.]** | **[Operator]** |
| Security, server, and access logs | **[Set period by log type and incident-response need.]** | **[Delete or aggregate; preserve a scoped copy only for a documented investigation.]** | **[Operator/provider]** |
| Payment callback/receipt data, if actually collected | **[Set period based on actual payment feature and legal role.]** | **[Delete or restrict when no longer required.]** | **[Operator / payment controller]** |
| Backups and disaster-recovery copies | **[Specify rotation and maximum expiry.]** | **[Expire automatically; document how a deleted record ages out of backup.]** | **[Operator/provider]** |

Closing or deactivating an account does not automatically mean that every record linked to it can be deleted. A controller must assess each request, state the applicable reason for retaining or restricting information, and avoid keeping unrelated profile/contact data merely because a financial record remains.

## 9. Your rights and how to make a request

Under Kenya’s Data Protection Act, a person may have the right to be informed, access their personal data, object to processing, request correction of false or misleading data, request deletion where the legal conditions are met, restrict processing in specified circumstances, receive data in a portable format where applicable, and not be subject to a qualifying solely automated decision. A person may also withdraw consent where consent is the basis, without affecting processing that lawfully occurred before withdrawal.

These rights are subject to conditions and exceptions. A request cannot be used to obtain another person’s private information. Erasure is not absolute, and a controller may need to retain or restrict a financial or audit record where the law permits or requires it. The controller must explain its decision and the available complaint route if it refuses a request.

### 9.1 How to submit a request

Send a request to **[09elim3@gmail.com](mailto:09elim3@gmail.com)**, the service support contact supplied for this App. Confirm that the mailbox is monitored, that the responsible controller can verify requests safely, and that requests are routed to the Chama where the Chama controls the relevant records. There is no in-App privacy-request route confirmed for this draft.

Include:

1. your name and a safe way to contact you;
2. the Chama and account involved, if relevant;
3. which right you want to exercise;
4. enough information to identify the data or decision; and
5. whether you are contacting the Chama, the Operator, or both.

Do not include your PIN, recovery code, or another person’s unrelated information. The controller may ask for proportionate proof of identity where needed to protect the data. It should not collect more identification than necessary. If the request concerns group records controlled by a Chama, the Operator should forward it to the responsible Chama/controller and assist where it acts as processor.

### 9.2 Response periods

The Data Protection (General) Regulations, 2021 set different periods and refusal procedures (regulations 7–12):

- **Access (regulation 9):** comply within 7 days, subject to the applicable legal conditions and protection of other people’s information.
- **Rectification (regulation 10):** correct inaccurate, outdated, incomplete, or misleading personal data within 14 days where correction is necessary. If the request is declined, give written reasons within 7 days.
- **Erasure (regulation 12):** respond within 14 days. Erasure is available only on the statutory grounds and does not apply where a listed exception requires or permits continued processing, including a legal obligation, public task, qualifying archiving/research, or a legal claim. A response is not an unconditional promise to delete every group, financial, or audit record.
- **Portability (regulation 11):** port within 30 days, subject to the regulation’s conditions and any prescribed fee that lawfully applies; a fee must be reasonable and not exceed the actual cost. If declined, give written reasons within 7 days. Regulation 11 contains no general extension clause, so this draft does not promise an extension unless a separate applicable authority is identified.
- **Restriction (regulation 7) and objection (regulation 8):** generally act within 14 days, subject to their statutory grounds and exceptions. The objection right is absolute for direct marketing; where another objection is declined, explain the reason and the right to complain to the Data Commissioner.

These periods do not remove the need to verify the requester and protect another person’s rights, or to explain the applicable legal ground when a request cannot be granted. Regulation 11 itself provides no general portability extension; any different period needs a separately identified current legal authority.

### 9.3 Complaints

You may complain to Kenya’s [Office of the Data Protection Commissioner (ODPC)](https://www.odpc.go.ke/). The ODPC explains its [complaints-handling and enforcement process](https://www.odpc.go.ke/). Contacting the Operator or Chama first does not take away a right to complain to the ODPC.

## 10. Accuracy, corrections, and disputed group records

A Chama officer or Member may enter information about another Member. The responsible controller must provide the required notice and a way to raise a correction request. The Chama should compare a disputed contribution, loan, repayment, attendance, message, or approval with its source records and decide whether the group record is inaccurate.

To report an error, use **[verified in-App correction route]** or contact **[Chama privacy/record contact]**. Identify the record and the correction sought. Do not send PINs or unrelated personal information. The Operator’s role is to handle the request according to its controller/processor responsibilities. It must not decide the merits of a Chama’s internal financial dispute unless it has separately accepted that role.

Where a financial record is contested, the controller should consider marking or restricting it while it is checked, correcting inaccurate personal data, and preserving a proportionate history of who changed what and when. The controller should not silently overwrite a record if doing so would mislead a person or destroy history needed for a lawful purpose. A right to correct personal information does not automatically authorize a Member to rewrite the Chama’s accounting records.

**Before publication, specify:** the real correction route, who reviews it, expected response time, how contested entries are marked, who can see the correction history, and how a Member may escalate disagreement with the Chama’s decision.

## 11. Security and data breaches

The Operator and each Chama must use technical and organisational safeguards appropriate to their actual role, data, and risk. The reviewed backend derives PIN hashes using `scrypt`, uses server-managed sessions, and applies role-based access rules. The deployment supports a PostgreSQL data store and Redis sessions in production configurations. These observations do not prove that every production control is correctly configured or that all tenant-isolation, access, backup, or vendor controls are effective.

Before publication, the Operator must verify and describe the controls actually in use, including:

- who can access production and how that access is approved, limited, and reviewed;
- authentication, PIN-change, session expiry, and account-recovery protections;
- tenant and role authorization and testing of access boundaries;
- encryption in transit and at rest, if enabled, and the relevant scope;
- database, backup, and restore protection;
- logging and review of sensitive administrative and financial actions;
- vendor security and subprocessor oversight;
- vulnerability reporting and remediation; and
- incident triage, containment, investigation, notification, and support for affected people.

Do not claim encryption, certification, a completed breach-response plan, or a security standard unless supported by current evidence. No security measure can guarantee that a system will never be compromised.

If a personal-data breach occurs, the responsible controller must assess the risk and make any notification required by the Data Protection Act. Where the Act’s threshold is met, the controller must notify the ODPC within the statutory period, generally within 72 hours after becoming aware of the breach, and notify affected people where required. A processor must notify its controller without delay and within the statutory period, generally within 48 hours where reasonably practicable. The controller must keep the required breach record and document its decision even where notification is not required. Confirm the current statutory text and any relevant ODPC guidance before publication.

For the legal requirements, read the [Data Protection Act](https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31), the [Data Protection (General) Regulations](https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-12-31), and the ODPC’s [Data Protection Policy Guidance](https://www.odpc.go.ke/wp-content/uploads/2026/04/Guidance-Note-on-Data-Protection-Policy.pdf).

## 12. Children’s data

**The App is not ready to process children’s personal data.** Do not use it to collect or record a child’s personal data—including in accounts, membership, loan or guarantor records, or other group records—until an age-verification and parent/guardian-consent mechanism is designed and implemented, safeguards to protect and advance the child’s rights and best interests are in place, and the assessment is complete with any DPIA required under section 31 completed before processing starts.

Section 33 of the [Data Protection Act, 2019](https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31) prohibits processing a child’s personal data unless a parent or guardian has consented and the processing protects and advances the child’s rights and best interests; it also requires appropriate age-verification and consent mechanisms. The mechanism must be determined with regard to the statutory factors, including available technology, the volume and likely proportion of children’s data, and the possibility of harm. Section 31 of the Act requires a DPIA before processing likely to result in high risk to people’s rights and freedoms.

**[UNRESOLVED: confirm the actual age-verification and consent approach, responsible parties, and whether children may use the App.]** This draft does not invent a verification method or claim that minors can safely use the App.

## 13. Cookies and session technologies

The App uses a session cookie to keep a signed-in account authenticated. The reviewed server configures an HTTP-only, strict same-site session cookie and sets the Secure attribute in production or when explicitly forced. Its exact lifetime depends on the configured idle-session period. Verify the live deployment, cookie lifetime, proxy settings, and any other cookies or browser storage before publication.

The session cookie is used for authentication and service security, not as a statement that no other tracking exists. **Confirm whether analytics, advertising, or third-party tracking scripts are present.** Add a separate cookie notice or consent control if the law and actual technologies require one. Do not state that the App has no analytics or tracking unless the deployed site has been checked.

## 14. Automated decisions and profiling

The reviewed application makes an immediate, rule-based automated decision on a new loan application when that Chama has configured loan rules. It records the application as approved or not approved automatically. Because this can affect a person’s access to a group loan, the controller should treat it as potentially significant and must not assume that a legal exception to automated-decision rights applies. No external credit-bureau score is an input in the reviewed code; production data flows and contracts still need to be checked.

### 14.1 What the decision uses

The Chairperson configures each Chama’s thresholds; the App supplies no universal numeric eligibility values. The first configured amount tier that covers the requested principal sets that tier’s minimum active-membership period and minimum recorded share-capital contributions. The App also checks whether the amount is within both (a) the configured percentage of the Chama’s recorded balance and (b) the configured percentage of the borrower’s recorded share-capital contributions after subtracting existing principal exposure. The request must include two distinct active guarantors, and their combined unpledged share capital must cover the amount. If no rules exist, the App does not record an application. If every check passes it records an automatic approval; otherwise it records a rejection and the reason. The policy version and decision inputs are logged, and the borrower and authorized officers can see the explanation and recorded inputs.

The calculation uses information recorded in the App, including membership-start dates, contribution and loan records, the group balance, and guarantor records. The controller must check those records for accuracy, explain the thresholds and likely consequences in advance, and protect the information from use for unrelated purposes. A recorded balance or contribution is not independent proof that money was received or remains available.

Before submission, the member can request a server-generated estimate for the amount and term. It uses the Chama’s current monthly rate and the reducing-balance model and returns estimated interest, total payable, and installment amounts and due dates. An estimate does not submit an application, reserve funds, or confirm an off-App transfer. If the application is approved, the loan record stores the rate and schedule used for that decision. The App does not record or perform the actual disbursement, so the controller and actual lender must separately confirm the amount and date advanced and must not treat the projected schedule alone as proof that a loan was funded.

### 14.2 Requesting human review

The App automatically assesses and records the initial loan decision under the Chama’s configured rules; no Chairperson, Secretary, or Treasurer pre-approves an application. After that decision, the borrower may request human reconsideration and provide an explanation. A non-conflicted Chairperson, Secretary, or Treasurer who is neither the borrower nor a guarantor must consider the explanation and relevant information, then record a reasoned **upheld** or **not upheld** finding and written reasons. The audit record must identify the reviewer and record the evidence or information considered, the reviewer’s reasoning, written reasons, and outcome.

This is a post-decision review, not officer pre-approval. In the current App, the human-review finding does not itself change the loan status, authorize or reverse funding, or alter accounting records. The App sets no fixed response deadline and does not guarantee immediate review. **[Before real lending, the Chama/controller must decide and communicate any practical response target and escalation route for an unavailable or conflicted reviewer; no response target is currently built into the App.]**

### 14.3 Kenyan safeguards and assessment

Section 35 of the [Data Protection Act, 2019](https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31) provides rights relating to qualifying solely automated decisions, including notice and a request for reconsideration or a new decision that is not solely automated, subject to the section’s conditions and exceptions. Regulation 22 of the [Data Protection (General) Regulations, 2021](https://new.kenyalaw.org/akn/ke/act/ln/2021/263) addresses notice, meaningful information about logic, significance and likely consequences, fairness, error and bias safeguards, and human intervention. Regulation 49 lists certain significant automated or algorithmic decisions among high-risk processing for which a DPIA is required. The responsible controller must assess whether this workflow meets that test and complete any required DPIA before it is used for real members.

The App does not move or disburse loan funds. A Chama or other actual lender must identify its legal form, lawful basis, authority to lend, applicable rules, and any required financial disclosures. The CBK Non-Deposit Taking Credit Providers Regulations, 2026 may apply to some providers and exclude specified entities; applicability cannot be decided from a recordkeeping app alone. See the [Kenyan legal research notes](kenyan-legal-research-notes.md) and obtain Kenyan legal advice before publication or real lending. This description is not a finding that the Operator, Chama, or workflow is compliant.

## 15. Policy updates and notice

This policy must display a version number and effective date. When the purpose, legal basis, data categories, recipients, transfer, or retention practice changes, the controller must update the notice and provide any notice required by law before or when the change takes effect.

For new accounts, the App records the accepted Terms version and, separately, acknowledgment of the Privacy Notice version, together with timestamps, source, and account/Chama context. The acknowledgment shows that the notice was presented and acknowledged; it is not consent to all processing or optional uses. The application audit record is not tamper-evident. Existing accounts are not gated at sign-in, and acknowledgment of material notice updates is not implemented.

See the [Terms and Conditions draft](terms-and-conditions-draft.md) for the separate service agreement. The public Terms and Privacy pages are linked from the landing-page footer and remain marked as working drafts; current new-account choices do not make either draft final or amount to blanket privacy consent.

## 16. Contact and complaints

For a privacy request or complaint, contact **[09elim3@gmail.com](mailto:09elim3@gmail.com)**, the service support email supplied for this App. Before publication, confirm the mailbox owner, monitoring, secure handling, and process for forwarding requests to the relevant Chama/controller. Do not email a PIN, recovery code, or another person’s unnecessary personal information.

**Operator:** [registered legal name, legal form, and address]  
**Privacy contact:** [monitored email and secure request route]  
**Chama/controller contact:** [how a Member identifies the correct Chama contact]  
**Data Protection Officer:** [name and contact if required or appointed]  
**Security incident contact:** [monitored address and reporting process]

You may contact the [Office of the Data Protection Commissioner](https://www.odpc.go.ke/) and use its published complaints process. This policy does not prevent you from exercising a legal right or seeking advice from a lawyer or other independent adviser.

## 17. More information and official sources

These links provide more detail from Kenyan authorities and legislation. They do not replace this notice or decide which legal rule applies to a particular Chama or processing activity.

- [Constitution of Kenya, 2010, Article 31 (right to privacy)](https://kenyalaw.org/akn/ke/act/2010/constitution)
- [Constitution of Kenya, 2010, Article 31 (right to privacy)](https://kenyalaw.org/akn/ke/act/2010/constitution)
- [Constitution of Kenya, 2010, Article 31 (right to privacy)](https://kenyalaw.org/akn/ke/act/2010/constitution)
- [Constitution of Kenya, 2010, Article 31 (right to privacy)](https://kenyalaw.org/akn/ke/act/2010/constitution)
- [Constitution of Kenya, 2010, Article 31 (right to privacy)](https://kenyalaw.org/akn/ke/act/2010/constitution)
- [Kenya Data Protection Act, 2019](https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31)
- [Data Protection (General) Regulations, 2021](https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-12-31)
- [Data Protection (Registration of Data Controllers and Data Processors) Regulations, 2021](https://kenyalaw.org/akn/ke/act/ln/2021/265/eng@2022-12-31)
- [Data Protection (Complaints Handling Procedure and Enforcement) Regulations, 2021](https://kenyalaw.org/akn/ke/act/ln/2021/264/eng@2022-12-31)
- [ODPC: Data Protection Policy Guidance (2026)](https://www.odpc.go.ke/wp-content/uploads/2026/04/Guidance-Note-on-Data-Protection-Policy.pdf)
- [ODPC: Cross-border Data Transfers Guidance (2026)](https://www.odpc.go.ke/wp-content/uploads/2026/09/ODPC-%E2%80%93-Guidance-Notes-for-Cross-border-Data-Transfers.pdf)
- [ODPC website and complaints information](https://www.odpc.go.ke/)
- [Consumer Protection Act, 2012](https://kenyalaw.org/akn/ke/act/2012/46/eng@2022-12-31)
- [National Payment System Act, 2011](https://kenyalaw.org/akn/ke/act/2011/39/eng@2025-11-04), relevant only if actual payment activity or payment-data processing is in scope
- [CBK Non-Deposit Taking Credit Providers Regulations, 2026](https://kenyalaw.org/akn/ke/act/ln/2026/191/eng@2026-09-29), relevant only if the Operator or another party conducts in-scope credit business
- [Kenyan legal research notes for these drafts](kenyan-legal-research-notes.md)

## Publication checklist: do not leave unresolved

Before publishing this policy, the Operator must:

1. Insert its registered legal identity, address, and monitored privacy contacts.
2. Decide and document controller/processor roles for each processing purpose and execute required written agreements.
3. Reconcile every listed data category with production tables, flexible JSON fields, support tools, log configuration, exports, and backups.
4. Identify each vendor, subprocessor, purpose, data received, storage/access country, safeguards, and deletion/return duties.
5. Document a lawful basis and necessity for each purpose, the required fields, and whether a field is mandatory.
6. Approve specific retention periods or objective criteria for all live, audit, support, security, and backup records.
7. Verify account, member, officer, support, vendor, and legal-authority access controls.
8. Verify the actual cookie inventory, session lifetime, email configuration, payment integrations, and any analytics or tracking.
9. Decide whether children’s information may be processed and implement the required safeguards or an exclusion process.
10. Provide a practical rights-request, identity-check, correction, restriction, complaint, and breach-response process.
11. Verify every Chama’s membership-start dates and loan-policy values, check input accuracy, and test that borrowers receive meaningful decision reasons and can obtain non-conflicted human review.
12. Complete and document any required DPIA and establish an operational review response target and escalation route before automated lending decisions are used for real members.
13. Verify ODPC registration or exemption status, transfer assessments, controller-processor documentation, and the actual credit-provider classification.
14. Recheck current laws, regulations, and court decisions on the publication date and obtain Kenyan counsel’s review.

A detailed policy is useful only if it matches how the service actually works. A statement that is specific but false can create more risk than an honest, clearly bounded statement.
