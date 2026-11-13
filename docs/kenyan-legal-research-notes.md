# Kenyan legal research notes for Jirani Chama policies

**Research checked:** 13 November 2026. This is a drafting aid, not legal advice, a compliance audit, or a statement that the app complies with every applicable law. Confirm the current law and case status again immediately before publication.

## Product facts used

The product context supplied for this review is that Jirani Chama stores chama/member accounts and records such as contributions, loans, attendance, messages, and activity history. The reviewed local code makes immediate rule-based loan eligibility decisions using Chairperson-configured Chama thresholds; members may request one post-decision human review, and authorized officers can inspect records but do not vote or pre-approve new applications. The review form records the member’s explanation, information considered, a non-conflict confirmation, written reasons, and an “upheld/not upheld” outcome, but the current route does not change the recorded loan status or authorize funding. No response deadline is configured. No numeric loan thresholds were supplied, so no universal values were added. The app does not disburse loans or move members’ money. Live payment processing and subscription billing remain disabled. Local code behavior does not prove that a feature is enabled in production; verify deployment, contracts, operational review handling, and data flows before public promises or real lending.

## Main findings for drafting

### Data protection

The Data Protection Act, 2019 applies to personal data in electronic records. Member names and contacts, contribution and loan records, approvals, attendance, messages, and identifiable activity history are personal data. The correct controller/processor role must be assessed separately for each purpose. A chama may decide how its group records are used while the operator processes them on instructions; the operator may control separate activities such as its own account administration or security logs. Contract labels alone do not determine the legal role.

Section 29 of the Act requires notice before collection, insofar as practicable, of the collection and purpose, section 26 rights, third-party recipients and safeguards, controller/processor contacts and other possible recipients, security measures, whether data is collected under a law and whether provision is voluntary or mandatory, and consequences of non-provision. The policy draft maps required/optional fields and form-level omission consequences in the current forms/routes that were reviewed. It also leaves precise placeholders for unreviewed production paths and for the notice-delivery process where a Chama or officer enters another person’s data. “Required” by the app is not the same as required by statute. [Kenya Law, Data Protection Act, 2019, s. 29](https://new.kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31/source)

The Privacy Policy must describe the real data collected, its purposes and legal bases, the responsible parties and contacts, recipients and transfers, whether requested data is required, relevant rights, retention criteria, and security measures. A written controller-processor arrangement and subprocessor controls are required where that relationship exists. The app needs a real retention schedule, rights-request route, breach escalation process, and a high-risk-processing assessment. Do not claim that users can erase every ledger or audit entry unconditionally.

Terms acceptance is not blanket privacy consent. Where consent is the lawful basis, it must be specific, informed, freely given, and withdrawable. Other lawful bases may apply, but the controller must identify and document the correct one for each purpose. Do not treat a checkbox accepting contract terms as consent to unrelated analytics, marketing, or data sharing.

The Data Protection (General) Regulations, 2021 set distinct procedures in regulations 7–12: restriction (regulation 7) and objection (regulation 8) are generally handled within 14 days; access (regulation 9) within 7 days; rectification (regulation 10) within 14 days where necessary, with written reasons within 7 days if refused; portability (regulation 11) within 30 days, with written refusal reasons within 7 days and any fee limited to a prescribed, reasonable amount not exceeding actual cost; and erasure (regulation 12) requires a response within 14 days, not unconditional deletion, and is subject to statutory grounds and exceptions. **Portability discrepancy:** regulation 11 contains no general extension clause. Although the task request referred to a limited extension where applicable, do not promise an extension unless a separate applicable authority is identified; the editable policy uses 30 days without a generic extension. The exact right and its exceptions still depend on the request and circumstances. [Kenya Law, Data Protection (General) Regulations, 2021, regs. 7–12](https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-12-31/source)

Section 33 of the Act requires parent/guardian consent and processing that protects and advances the child’s rights and best interests, and appropriate age-verification and consent mechanisms. Regulation 49(1)(e) expressly treats processing children’s data as high-risk; regulation 49(2) requires a DPIA before that processing. Section 31 requires prior assessment for high-risk processing; consult the Commissioner before processing if the DPIA indicates high risk, and submit the report 60 days before processing. The product choice supplied is minors with parent/guardian, but the reviewed app has no age verification, guardian identity/authority check, child-consent flow, or child-specific safeguards. This is a release blocker, not a safe-use claim. The scope of minor use and verification method remain [CONFIRM] items. [Kenya Law, Data Protection Act, 2019, ss. 31 and 33](https://new.kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31/source); [General Regulations, reg. 49](https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-12-31/source)

Registration is a separate question from substantive compliance. The small-entity exemption in the Registration Regulations requires both the revenue/turnover and employee thresholds and does not apply to listed purposes, including provision of financial services. The research cannot decide whether a recordkeeping-only software provider falls within that category. **[CONFIRM the actual ODPC registration status and certificate details, or the documented exemption analysis.]** A submitted or pending application is not proof of completed registration. Do not state that the Operator is registered or exempt without verification.

### Consumer protection and electronic acceptance

The Consumer Protection Act prohibits false or misleading representations and limits certain unfair terms. Its paid internet-agreement provisions are conditional: section 17(4) ties them to a prescribed payment threshold. The current product facts say live subscription billing is disabled, but the research did not establish whether any indirect payment or other consideration exists or verify the current prescribed threshold. Do not claim the paid internet-agreement rules either apply or do not apply without checking those facts and current subsidiary legislation.

Kenyan law recognizes electronic records and contracts formed through electronic messages. That does not prove that a particular checkbox satisfies every signature requirement. The reviewed app now records separate Terms acceptance and Privacy Notice acknowledgment, with policy fingerprints and timestamps, for new Chairperson setup and invited-account activation. Server integration tests cover missing-choice rejection and successful versioned audit records, but could not be executed in this environment because local HTTP connections returned `EACCES`; rerun them where loopback is permitted. The application audit history is not tamper-evident, and the notice acknowledgment is not blanket consent.

### Chama, cooperative, credit, and payment boundaries

Rules for registered cooperative societies, SACCOs, societies, and informal groups are not interchangeable. Cooperative inspection, accounting, and audit provisions generally attach to registered cooperative societies. A qualifying association may have separate registration obligations under the Societies Act. Confirm the legal status and bylaws of each customer group before representing that a specific recordkeeping statute applies.

The supplied research reports that the High Court declared the Community Groups Registration Act unconstitutional, with the operation of the declaration suspended for six months through 10 February 2027 to allow corrective action. This is time-sensitive. Verify whether corrective legislation, an appeal, a stay, or another order changed the position before publication.

The Central Bank of Kenya (Non-Deposit Taking Credit Providers) Regulations, 2026 commenced on 29 September 2026. They govern the actor actually carrying on in-scope credit business, subject to exclusions. Recording a group’s loan does not by itself establish that the app operator is a lender. Reassess if the operator or group originates, arranges, prices, funds, approves, services, or collects credit as a business.

The National Payment System Act’s definition of a payment service provider includes payment functions and certain persons who process or store data for payment providers or users of payment services. The absence of fund movement is relevant, but actual payment-data flows, contracts, integrations, or agency activity still need review. Do not describe the app as M-Pesa-enabled, a payment processor, or categorically exempt on the current facts. If live payment features are added, obtain a fresh legal classification before launch.

### Cybercrime and record claims

Kenya’s cybercrime law contains offences and targeted investigative or preservation processes. It does not create a general duty for every hosted app to monitor all user activity. Avoid promises of absolute confidentiality against valid legal orders and avoid broad claims of monitoring. Electronic records are not automatically conclusive or admissible merely because the app stores them; evidentiary requirements are fact-specific.

The research identified 2026 judgments affecting specified cybercrime provisions. Verify the current appellate/stay status before relying on those decisions or describing prohibited content in legal terms. Do not draft as if a court-invalidated provision remains in force.

## Verified official source links

- [Data Protection Act, 2019 (Cap. 411C), Kenya Law](https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31)
- [Data Protection (General) Regulations, 2021, Kenya Law](https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-12-31)
- [Data Protection (Registration of Data Controllers and Data Processors) Regulations, 2021, Kenya Law](https://kenyalaw.org/akn/ke/act/ln/2021/265/eng@2022-12-31)
- [Data Protection (Complaints Handling Procedure and Enforcement) Regulations, 2021, Kenya Law](https://kenyalaw.org/akn/ke/act/ln/2021/264/eng@2022-12-31)
- [ODPC Guidance Note on Data Protection Policy (2026)](https://www.odpc.go.ke/wp-content/uploads/2026/04/Guidance-Note-on-Data-Protection-Policy.pdf)
- [ODPC Guidance Notes for Cross-border Data Transfers (2026)](https://www.odpc.go.ke/wp-content/uploads/2026/09/ODPC-%E2%80%93-Guidance-Notes-for-Cross-border-Data-Transfers.pdf)
- [Consumer Protection Act, 2012 (Cap. 501), Kenya Law](https://kenyalaw.org/akn/ke/act/2012/46/eng@2022-12-31)
- [Constitution of Kenya, 2010, Kenya Law](https://kenyalaw.org/akn/ke/act/2010/constitution)
- [Kenya Information and Communications Act, Kenya Law](https://kenyalaw.org/akn/ke/act/1998/2/eng@2022-12-31)
- [Central Bank of Kenya (Non-Deposit Taking Credit Providers) Regulations, 2026, Legal Notice 191 of 2026](https://kenyalaw.org/akn/ke/act/ln/2026/191/eng@2026-09-29)
- [National Payment System Act, 2011, Kenya Law](https://kenyalaw.org/akn/ke/act/2011/39/eng@2025-11-04)
- [National Payment System Regulations, 2014, Central Bank of Kenya](https://www.centralbank.go.ke/images/docs/legislation/NPSRegulations2014.pdf)
- [Co-operative Societies Act, Kenya Law](https://kenyalaw.org/akn/ke/act/1997/12/eng@2023-12-11)
- [Societies Act, Kenya Law](https://kenyalaw.org/akn/ke/act/1968/4/eng@2022-12-31)
- [Community Groups Registration Act, 2022, Kenya Law](https://kenyalaw.org/akn/ke/act/2022/30/eng@2022-12-31)
- [Mathare Social Justice Centre & another v Bore, [2026] KEHC 13419 (KLR)](https://kenyalaw.org/akn/ke/judgment/kehc/2026/13419/eng@2026-09-10)
- [Computer Misuse and Cybercrimes Act, Kenya Law](https://kenyalaw.org/akn/ke/act/2018/5/eng@2025-11-04)
- [Law Society of Kenya & 8 others v Attorney General, [2026] KEHC 9453 (KLR)](https://kenyalaw.org/akn/ke/judgment/kehc/2026/9453/eng@2026-07-02)
- [Bloggers Association of Kenya (BAKE) v Attorney General, [2026] KECA 430 (KLR)](https://kenyalaw.org/akn/ke/judgment/keca/2026/430/eng@2026-03-06)
- [Evidence Act, Kenya Law](https://kenyalaw.org/akn/ke/act/1963/46)
- [Office of the Data Protection Commissioner](https://www.odpc.go.ke/)
- [Central Bank of Kenya, National Payments System](https://www.centralbank.go.ke/national-payments-system/)

## Automated loan-decision findings checked 13 November 2026

- **Data Protection Act, 2019, section 35:** a data subject has a right not to be subject to a solely automated decision that has legal effects or significantly affects them, subject to the Act's stated exceptions. Where such a decision is made, the controller or processor must notify the person as soon as reasonably practicable. The person may request reconsideration or a new decision that is not solely automated; the request must be considered, relevant information taken into account, and the person told the steps and outcome within a reasonable period. The current app permits one borrower-requested review; the officer form records the explanation, information considered, non-conflict confirmation, reasons and an “upheld/not upheld” outcome, but the route does not change the recorded loan status or authorize funds. No configured response deadline or guaranteed reviewer alert exists. Before real lending, assess whether this process satisfies section 35 where it applies; do not describe it as status-changing reconsideration or add an invented deadline. [Kenya Law, Data Protection Act, section 35](https://kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31/source)
- **Data Protection (General) Regulations, 2021, regulation 22:** requires notice that automated individual decision-making is used, meaningful information about the logic, explanation of significance and likely consequences, transparency and fairness, measures to prevent/correct errors and reduce bias, and a way for a person to obtain human intervention and express their point of view. [Kenya Law, regulation 22](https://kenyalaw.org/akn/ke/act/ln/2021/263)
- **Regulation 49:** automated decisions with legal or similar significant effects using profiling or algorithmic means are among high-risk processing operations for which a DPIA is required before processing. The controller must assess whether this loan workflow meets that test and complete the assessment before enabling it for real members. [Kenya Law, regulation 49](https://kenyalaw.org/akn/ke/act/ln/2021/263)
- **CBK Non-Deposit Taking Credit Providers Regulations, 2026, Legal Notice 191, regulation 3:** applies to non-deposit-taking credit business not regulated under another written law and excludes, among others, co-operative societies registered under the Co-operative Societies Act and licensed SACCO societies. Whether a Chama, platform operator, or other party is in scope depends on the actual legal entity and lending model; recording a group loan does not alone settle the question. Regulation 54 sets loan-agreement disclosures for providers within scope. [Kenya Law, Legal Notice 191 of 2026](https://kenyalaw.org/akn/ke/act/ln/2026/191/eng@2026-09-29)

These extracts are drafting guidance, not a finding that the Chama, Operator, or automated workflow is compliant. Confirm lawful basis, controller/processor roles, DPIA, human-review operation, the group's legal form and lending model, and counsel's advice before real lending or publication.

## Required factual confirmations before publication

1. Operator’s registered legal name, legal form, address, service contact, and privacy-request contact.
2. Whether the displayed contact email is monitored for legal/privacy requests and how identity is verified for requests.
3. Controller/processor roles by processing purpose, the chama’s role, and written data-processing/subprocessor agreements.
4. Exact production data fields, sources, access rules, support access, and whether minors may be recorded.
5. Lawful basis for each purpose and the operator’s ODPC registration or exemption analysis.
6. Hosting, backups, logs, support tools, email providers, vendor list, countries of storage/access, and international-transfer safeguards.
7. Retention periods or criteria for account data, financial records, messages, audit/security logs, and backups.
8. Verified security controls, breach-response process, DPIA status, and rights-request operating procedure.
9. Whether the service is completely free and whether any direct or indirect fees are charged or planned.
10. Whether any production feature or contract handles payment instructions/data or originates, arranges, funds, approves, services, or collects loans; the relevant legal entity and group form; and the actual CBK credit-provider classification.
11. Whether the production loan policy, membership-start dates, criteria inputs, reason display, and borrower human-review route match the reviewed code; who monitors requests, the response target, escalation route, and how conflicts are handled.
12. Current legal status of the Community Groups Registration Act judgment and other time-sensitive appellate matters.
13. Current acceptance scope: new Chama registration and invited-member activation require separate Terms acceptance and Privacy Notice acknowledgment. Existing-user sign-in and re-acceptance after a material policy update remain unimplemented; decide and implement any required future migration before publication.
14. Whether loan interest, total payable, repayment dates, fees, guarantor obligations, and default consequences are disclosed and agreed before any external disbursement.
