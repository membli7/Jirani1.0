# Jirani Chama: Product and Technical Design Specification

| | |
|---|---|
| **Version** | 3.1 (validated draft for product-owner and counsel review) |
| **Date** | 2026-10-19 |
| **Supersedes** | design.md v3.0 (contains unverified and incorrect legal statements; see Section 3) |
| **Currency / timezone** | KES / Africa/Nairobi |

**Labels used in this document**

- **[Law]**: stated in primary law or regulation. Section or regulation number given.
- **[Product decision]**: a choice the product owner has made. It is not a legal requirement or a market fact.
- **[Open]**: must be decided, or confirmed by a Kenyan lawyer, before real member money is handled.



## 1. Purpose and Scope

Jirani Chama is a record-keeping and governance application for a Kenyan savings group (chama). It records contributions, penalties, loans, welfare claims, attendance, meetings, share-outs and approvals in one ledger that members can read.

**[Product decision]** Jirani does not hold, move, or disburse money. Money moves outside the application through M-Pesa, a bank, or cash. The application must never state that a transfer occurred unless a configured provider confirms it.

**[Open]** Whether the records-only model is enough to keep Jirani outside the Banking Act and the SACCO Societies Act when the chama lends member money. See Section 5.

**Out of scope for v1:** automated disbursement, deposit-taking, investment tracking, guaranteed SMS or WhatsApp delivery, SASRA reporting, in-app polling, and trusted-device sign-in.

---

## 2. Verified Legal Requirements

The table lists only requirements read in primary text. Quotes are short. Check exact wording against the official PDF before legal use, because the fetch tool summarised the text.

### 2.1 Registration of the chama

| Requirement | Source | Label |
|---|---|---|
| A "society" is any club, company, partnership or association of **ten or more persons**. | Societies Act (Cap. 108), s.2 | [Law] |
| An unregistered society is an "unlawful society", unless it applies within **28 days** of formation (protected until the decision is notified). | Cap. 108, s.4(1), s.9 | [Law] |
| Application (Form A) is signed by **three officers** and includes two copies of the constitution and the prescribed fee. | Societies Rules, LN 62/1968, rule 2 | [Law] |
| The constitution must cover 16 listed matters, including officers and terms, general meetings, custody and use of funds, inspection of books, audit, amendment and dissolution. | Cap. 108, s.19(1) and Schedule | [Law] |
| The Schedule says funds may not be distributed to members (item 11, as read). **[Open]** How this applies to a share-out model. | Cap. 108, Schedule item 11 | [Law] / [Open] |
| Annual return due **31 March** for the previous year, signed by three officers. Fee for 1–25 members: **KSh 500**; 26–100: KSh 700; 101–1,000: KSh 1,000; over 1,000: KSh 2,000. | Cap. 108, s.30(1); Rules, rule 13; LN 259/2021 | [Law] |
| Unregistered groups have no legal personality. Courts have held they cannot sue or be sued in their own name. | *Senti Kumi CSHG v Kenya Maritime Authority*, Petition 2/2019; *Nkoora v Kuyuoni* [2025] KEHC 17752, para 14 | [Law] (case law) |
| Whether an unregistered group can hold bank accounts or contract. | Not found in primary law | **Gap** |
| Co-operative route: minimum ten individual members; body corporate on registration; annual audit and return. | Co-operative Societies Act (Cap. 490), s.5(a), s.12, s.25 | [Law] |
| Cooperatives Bill 2024 may change the registration route (Senate version sets minimum 20 persons for a primary co-operative). Assent not confirmed. | Bill 7 of 2024 (as reported) | **[Open]** |

### 2.2 Deposit-taking and lending

| Requirement | Source | Label |
|---|---|---|
| No person may carry on banking business in Kenya without a licence. | Banking Act (Cap. 488), s.3(1)(a) | [Law] |
| "Banking business" includes accepting money from **members of the public** on deposit repayable on demand or after notice, and lending that money at the depositor's risk. | Cap. 488, s.2(1) | [Law] |
| Only exemption found for co-operatives: a society registered under Cap. 490. An unregistered chama cannot rely on it. | Cap. 488, s.54(1)(c) | [Law] |
| Deposit-taking SACCO business requires registration under Cap. 490 **and** a SASRA licence, regardless of size. | Sacco Societies Act, s.23(1) | [Law] |
| Non-deposit-taking SACCOs with **non-withdrawable** member deposits of KSh 100 million or more are regulated. Digital or non-resident mobilisation triggers separate authorisation. | Sacco Societies (Non-Deposit Taking Business) Regulations, LN 82/2020, reg. 4 (hosted copy, not checked against Gazette) | [Law] |
| SASRA capital and liquidity for deposit-taking SACCOs: core capital **at least KSh 10 million** (reg. 9(a)); core capital **at least 10% of total assets** (9(b)); institutional capital **at least 8% of total assets** (9(c)); core capital **at least 8% of total deposits** (9(d)); liquidity **15%** of savings deposits and short-term liabilities (13(2)). | Sacco Societies (Deposit-taking Sacco Business) Regulations, LN 95/2010, revised 2022 | [Law] |
| Whether member contributions count as "deposits", and whether a closed group's members are "members of the public". | Not decided by any text read | **[Open]** (lawyer) |

### 2.3 Data protection

| Requirement | Source | Label |
|---|---|---|
| A controller or processor must register with the ODPC unless exempt. | Data Protection Act 2019, s.18(1) | [Law] |
| Exemption requires **both** annual turnover (or budget, for non-profits) **below KSh 5 million** **and** **fewer than ten** employees. The exemption does not apply to processing for purposes in the Third Schedule, which includes "provision of financial services" as read. | Registration Regulations, LN 265/2021, reg. 13(2), 13(1), 13(4) | [Law] |
| The ODPC guidance note says "more than 10 employees", which conflicts with the regulation. The regulation governs. | ODPC guidance note, s.3.1 | **Conflict** |
| Registration validity 24 months; fees KSh 4,000 to 40,000 per guidance note. | LN 265/2021, reg. 9, 11(1); guidance note | [Law] / unverified fee |
| Principles include lawfulness, fairness, transparency, purpose limitation, minimisation, accuracy and storage limitation. | DPA s.25 | [Law] |
| Consent must be an express, unequivocal, free, specific and informed indication. Before consent is sought, the controller must state its identity and purpose. | DPA s.2; LN 263/2021 (General Regulations), reg. 4(1) | [Law] |
| Transfer outside Kenya requires **proof of appropriate safeguards** given to the Commissioner, or a listed necessity ground. Sensitive data also needs consent. (Not "approval", as v3.0 stated.) | DPA s.48, s.49(1) | [Law] |
| Data subject access request must be answered **within seven days** and free of charge. This is in the regulations, not the Act. The Act sets no number of days for access. | LN 263/2021, reg. 9(4), 9(6) | [Law] |
| Personal data breach must be notified to the Commissioner within **72 hours**. | DPA s.43(1)(a) | [Law] |
| A Data Protection Officer **may** be appointed, and must be considered in three cases. Not mandatory for a small group on the text read. | DPA s.24(1) (extraction; wording to confirm) | [Law] (confirm) |
| Commencement date of the registration regulations: 14 January 2022 (Kenya Law) vs 14 July 2022 (guidance). Not reconciled. | LN 265/2021, reg. 1(2); guidance | **Conflict** |

---

## 3. Corrections to design.md v3.0

These statements in v3.0 are wrong or unsupported. They are removed or corrected here.

| v3.0 statement | Finding | Correction in v3.1 |
|---|---|---|
| SASRA liquidity is 10% of assets. | Liquidity is 15% of savings deposits and short-term liabilities (LN 95/2010, reg. 13(2)). | Corrected in Section 2.2. |
| Member-savings-only SACCOs are not subject to the minimum capital rule. | No text supports this. Section 23 requires a licence for any deposit-taking business. The non-deposit-taking regime covers non-withdrawable deposits of KSh 100 million and above. | Removed. The question is now an open legal item (Section 5). |
| SASRA Forms 1–3 removed because chamas are outside SASRA. | Depends on the answer to the open question above. | Kept out of v1, but not justified by the claim in v3.0. |
| Data exemption requires turnover **or** under ten employees. | Both conditions apply (reg. 13(2)). | Corrected. |
| The 7-day access period is in the Act. | It is in LN 263/2021, reg. 9(4). | Corrected. |
| Cross-border transfer requires "approval". | Requires proof of safeguards, or a listed necessity ground (s.48). | Corrected. |
| Chamas are "registered under the Societies Act". | Three routes exist: Cap. 108, Cap. 490, or a company limited by guarantee. Unregistered chamas have no legal personality. | Corrected in Section 2.1. |
| Constitutions "typically cover" a list of matters, and example constitutions list fines. | The Cap. 108 Schedule lists its own matters. No real chama constitution was read, so the claim about practice is unverified. | Removed as fact. |
| "Confirmed market expectation" for multi-signatory approval; competitor descriptions. | These come from vendor or marketing pages. | Removed as evidence. Product features may still be stated as product decisions. |
| Penalty amount, loan multiple, guarantor count, interest rate, welfare categories, share-out basis are "common practice". | The constitution survey found **zero** real constitutions. | Re-labelled as product decisions (Section 4). Not presented as practice. |
| Vice Chairperson and trusted devices. | Not validated. | Kept as deferred items, as before. |

---

## 4. Product Decisions (not validated as practice)

These are choices for the group and the product owner. They are not facts about how chamas operate. Each must be confirmed by the group's own constitution before use.

| Parameter | v3.1 default | Basis |
|---|---|---|
| Officers in the app | Chairperson, Secretary, Treasurer | [Law] that three officers sign Registrar filings. The app's officer model is a product decision. |
| Monthly contribution | Set per member | Product decision |
| Late-contribution penalty | KSh 200 after the 5th of the month, once per month, assessed explicitly | Product decision |
| Welfare fee | KSh 500, once per member per calendar month, separate from the contribution | Product decision |
| Loan ceiling | 3 × share capital, less outstanding principal | Product decision |
| Loan terms | 1, 2, 3 or 6 months | Product decision |
| Guarantors | Exactly two, active, not the borrower | Product decision |
| Loan interest | 5% per month; flat or reducing, shown before acceptance | Product decision |
| Loan approval | Chairperson, Secretary, Treasurer, plus a designated Member not conflicted | Owner's notes; the Member seat's selection rule is **[Open]** |
| Share-out basis | Proportional to time-weighted share capital, or equal split | Product decision |
| Share-out authority | Treasurer previews; Chairperson commits | Product decision (separation of duties) |
| Invitation expiry | 24 hours | Owner's decision (overrides 48 hours in earlier drafts) |
| PIN | 6–12 digits | Owner's decision |
| Login throttling | 5 failures per phone and 5 per IP, 15-minute lockout | Owner's decision |

**Professional practice:** Do not present any of these as "what chamas do". The app should let each group set its own values in its constitution, with a version history. Penalty and loan values should not be hard-coded.

---

## 5. Open Legal Questions for a Kenyan Lawyer

Answer each before real member money is recorded or lent.

1. **Banking Act:** does a chama that accepts repayable-on-demand contributions and lends them to members carry on banking business under ss.2(1) and 3(1)(a)? Are contributions "deposits" under s.16(2)? Is a closed group's membership "members of the public"?
2. **Data protection:** does member-only lending fall within "financial services" in the Third Schedule, which would remove the registration exemption? Which turnover or budget figure applies to an unregistered group?
3. **Registration route:** which route should a chama use, and does the Cooperatives Bill change the answer? What is the effect of Cap. 108 Schedule item 11 on a share-out?
4. **Platform exposure:** does the app's role expose the operator to Cap. 108, s.5 ("assists in the management of an unlawful society") if a chama is unregistered?
5. **Operating questions:** can an unregistered group open a bank or M-Pesa account and enter contracts?
6. **SASRA:** do current SASRA guidelines differ from LN 95/2010? (Not yet read.)
7. **Data protection scope:** does a foreign-hosted cloud or SMS provider count as a "transfer"? What is the retention period for financial records?

---

## 6. System Design

Engineering requirements carried forward from v3.0 are unchanged in principle. They are not legal claims.

### 6.1 Tenant and access control
- Every query is scoped to the user's active chama and membership. A foreign identifier returns "not found."
- PostgreSQL row-level security is defense in depth. The runtime role must not bypass RLS.
- Every route has an explicit capability policy. A route inventory test fails the build if one is missing.
- Server-sent events authenticate the user and filter events by chama and recipient.

### 6.2 Sessions and sign-in
- Phone numbers normalised to `254XXXXXXXXX`.
- Sessions in `httpOnly`, `Secure`, `SameSite` cookies; regenerated on login; 30-minute idle timeout.
- CSRF protection and strict Origin checks on state-changing requests.
- Throttling state shared through Redis in production.
- A user may belong to several chamas, with roles stored per chama membership.

### 6.3 Money model
- Double-entry postings with a database constraint that each entry balances to zero.
- Amounts stored as integers in cents. No floating point.
- Immutable postings; corrections by reversal.
- Pending cash-outs shown separately from approved ones.
- Share-outs: preview is read-only; commit verifies a stored snapshot and is idempotent.

### 6.4 Data protection controls
- Privacy notice and consent recorded at setup and activation.
- Access and correction requests tracked against the seven-day regulatory period.
- Breach procedure with 72-hour notification to the Commissioner.
- Hosting and sub-processor choices recorded with their transfer basis.
- Data minimisation: no national ID numbers in v1.

### 6.5 Architecture
- Node.js with Express; PostgreSQL in production; Redis for sessions, rate limits and event fan-out (never the source of truth).
- Targeted transactions with row locks or a `lock_version` column. No whole-state snapshot writes.
- Events published after commit through an outbox.
- Audit entries written in the same transaction, hash-chained.
- Multi-instance deployment blocked until the write path and concurrency tests are in place.

---

## 7. Pre-Pilot Gates

The pilot must not start until each gate is closed.

| Gate | Requirement | Owner |
|---|---|---|
| G-1 | Lawyer's written answers to Section 5 questions 1–3 | Counsel |
| G-2 | Registration route decided; registration status recorded for the pilot chama | Group and counsel |
| G-3 | ODPC registration determined (registered, or exempt with the reason recorded) | Counsel |
| G-4 | Privacy notice drafted and approved | Operator |
| G-5 | Chama constitution adopted, including every parameter in Section 4 | Group |
| G-6 | Security items from the 2026-10-13 audit (SEC-01, SEC-02, SEC-03) verified fixed by tests | Engineering |
| G-7 | Hosting topology and trust-proxy setting documented (O-9) | Engineering |

---

## 8. Sources

Primary law (read via Kenya Law or official PDFs, accessed October 2026):

- Societies Act (Cap. 108), rev. 31 Dec 2022: https://new.kenyalaw.org (Cap. 108)
- Societies Rules, LN 62/1968; LN 259/2021 fee schedule: statelaw.go.ke
- Co-operative Societies Act (Cap. 490), rev. 31 Dec 2022: https://new.kenyalaw.org (Cap. 490)
- Banking Act (Cap. 488), eng@2024-12-27: https://new.kenyalaw.org/akn/ke/act/1989/9/eng@2024-12-27/source
- Sacco Societies Act 2008, eng@2025-06-20: https://new.kenyalaw.org
- Sacco Societies (Deposit-taking Sacco Business) Regulations, LN 95/2010, rev. 2022
- Sacco Societies (Non-Deposit Taking Business) Regulations, LN 82/2020: hosted copy, not checked against Gazette
- Data Protection Act 2019 (No. 24 of 2019): https://www.odpc.go.ke/wp-content/uploads/2024/02/TheDataProtectionAct__No24of2019.pdf
- Data Protection (Registration) Regulations, LN 265/2021; General Regulations, LN 263/2021: Kenya Law and ODPC
- Case law: *Senti Kumi CSHG v Kenya Maritime Authority*, Petition 2/2019 (ELC Mombasa); *Nkoora v Kuyuoni* [2025] KEHC 17752 (KLR)

Secondary sources (context only; not used for any legal or practice claim): vendor and marketing pages; news articles on SASRA and registration.

---

**Note:** This specification is a product and engineering document. It is not legal advice. Every item marked [Open] or in Section 5 must be confirmed by a qualified Kenyan lawyer before real member funds are handled.