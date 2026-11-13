import { useEffect, useRef, useState } from "react";
import { submitContact } from "../contactActions.mjs";
import PwaInstallButton from "../components/PwaInstallButton.jsx";

const navItems = [
  ["#features", "Features", "landingNavFeatures"],
  ["#how-it-works", "How it works", "landingNavHowItWorks"],
  ["#pricing", "Pricing", "landingNavPricing"],
  ["#security", "Security", "landingNavSecurity"],
  ["#faq", "FAQ", "landingNavFaq"],
  ["#contact", "Contact", "landingNavContact"],
];

const features = [
  ["Clear contribution records", "Record contributions and keep each member’s balance visible alongside the group’s shared records."],
  ["Savings and loan records", "Keep contribution schedules, loan requests, repayments, and outstanding balances organized together."],
  ["Digital Governance", "Support group decisions with meeting attendance, officer roles, loan approvals, and recorded rules."],
  ["Security & Transparency", "PIN-protected, role-scoped access and an application audit log support review. The log is not tamper-evident, so keep source receipts and backups.", "landingAuditCopy"],
  ["A clearer month-end close", "Bring recorded cash contributions, repayments, open loan balances, and items needing attention into one read-only monthly view. Compare it with receipts and statements yourself; the app does not verify settlement or move funds.", "landingMonthCloseTitle", "landingMonthCloseCopy"],
  ["Group chat, in context", "Active chama members can discuss within their group. Messages refresh through live updates with polling recovery when the connection drops; this is not a WhatsApp or SMS broadcast.", "landingChatTitle", "landingChatCopy"],
];

const steps = [
  ["Register Profile", "Provide your name, phone number, and establish a private 6–12 digit security PIN."],
  ["Invite Members", "Send direct invitation codes for members, officers, and role-based access approvals."],
  ["Track Records", "Record contributions, payments, meetings, and loan decisions with a shared audit trail."],
  ["Review & Report", "Monitor balances, review committee decisions, and prepare exports when you need a snapshot."],
];

const faqs = [
  ["What is Jirani Chama?", "A modern financial management platform designed for Kenyan table-banking and savings groups to keep contributions, loans, and decisions in one secure space."],
  ["How do I get my group started?", "Create your profile, invite members with one-time codes, and use scheduled secret-ballot elections for post-setup officer seats.", "faqGettingStartedQuestion", "faqGettingStartedAnswer"],
  ["Can we track individual contributions and balances?", "Members and officers can review recorded contributions, balances, loans, and repayments. The app records what the group entered; cash is received or paid outside it.", "faqFinancialQuestion", "faqFinancialAnswer"],
  ["Are our group's money and data secure?", "Access is role-scoped and key actions are recorded in an application audit log. The log is not tamper-evident; compare records with receipts and keep backups.", "faqSecurityQuestion", "faqSecurityAnswer"],
  ["How are monthly contributions split between welfare and share capital?", "The Chairperson sets the monthly welfare amount during setup. A contribution first settles outstanding penalties, then covers the member's welfare amount once per month; any remainder goes to share capital.", "faqContributionSplitQuestion", "faqContributionSplitAnswer"],
  ["How does the platform handle loan approvals and repayments?", "Each Chama sets its own thresholds. The app immediately checks active-membership period, recorded share-capital contributions, the amount tier, the requested amount against the Chama balance and the member’s existing loan exposure, and two guarantors’ available share capital. An eligible request is automatically approved without a Chairperson or Treasurer vote; authorized officers can inspect loan records, and the borrower may request a human review. Members can see the reducing-balance repayment estimate before submitting. The app records repayments but does not transfer or disburse funds.", "faqLoanQuestion", "faqLoanAnswer"],
  ["How are late-payment penalties assessed?", "A late-dated contribution can create the configured late penalty when the Treasurer records it. Separately, the Chairperson or Secretary must run the monthly assessment for eligible members who have not met the welfare threshold. That assessment is manual, not automatic.", "faqPenaltyQuestion", "faqPenaltyAnswer"],
  ["What does the month-end close review show?", "It summarizes recorded cash contributions and repayments, tracked open loan balances, and items officers may need to follow up, such as requests left open under the previous loan workflow or missing references. New loan applications are decided immediately under each Chama’s configured rules. It is read-only and does not reconcile bank or M-PESA statements or move money.", "faqMonthCloseQuestion", "faqMonthCloseAnswer"],
  ["Can our group chat inside the app?", "Yes. Active accounts can use the chama's in-app group chat. It refreshes through the event stream with polling and reconnection support. WhatsApp/SMS broadcasts and chat by email are not included.", "faqChatQuestion", "faqChatAnswer"],
  ["Can we correct a contribution date after recording it?", "Only the Chairperson or Treasurer can correct the date of a confirmed cash contribution, and a non-empty reason is required. The new date must be valid, not future-dated, stay in the original month, and preserve whether the contribution was on time or late. Amount, member, and other transaction fields are unchanged. An audit event records the actor, time, old and new dates, and reason; the audit store is not tamper-evident.", "faqCorrectionQuestion", "faqCorrectionAnswer"],
  ["Does Jirani Chama receive, verify, or move our money?", "No. It records cash already received or paid outside the app. It does not collect or disburse funds, and bank/M-PESA settlement matching is not enabled.", "faqMoneyQuestion", "faqMoneyAnswer"],
  ["Which plan fits our group?", "Basic supports up to 10 members. Growth Chama supports up to 30 members. Enterprise / Investment is for groups above 30 members and is arranged with sales. Member limits are enforced by the server when members are invited or activated."],
  ["How does the annual discount work?", "Basic is KSh 2,880 per year instead of KSh 3,600, saving KSh 720. Growth Chama is KSh 5,760 per year instead of KSh 7,200, saving KSh 1,440. Both annual options are 20% off the equivalent monthly total."],
  ["When does payment confirm our subscription?", "A subscription becomes active only after the server verifies a real provider transaction for the expected KES amount and the group’s reference. Clicking a plan or reporting that you paid never activates access. Online payment collection is not enabled yet."],
  ["What happens when a subscription expires?", "Your financial history remains available to view and export. New financial records, member invitations, loan decisions, and other subscription-gated actions are blocked for unpaid or expired groups. Online payments are not enabled yet; contact us about pricing and renewal."],
];

const plans = [
  { tier: "Basic", cap: "Up to 10 members", monthlyAmount: "KSh 300", monthlyPrice: "KSh 300/month", annual: "KSh 2,880/year", monthlyTotal: "KSh 300", annualTotal: "KSh 2,880", annualSavings: "Save KSh 720 · KSh 240/month equivalent", annualCopy: "Annual: KSh 2,880/year — save KSh 720 (KSh 240/month equivalent)." },
  { tier: "Growth Chama", cap: "Up to 30 members", monthlyAmount: "KSh 600", monthlyPrice: "KSh 600/month", annual: "KSh 5,760/year", monthlyTotal: "KSh 600", annualTotal: "KSh 5,760", annualSavings: "Save KSh 1,440 · KSh 480/month equivalent", annualCopy: "Annual: KSh 5,760/year — save KSh 1,440 (KSh 480/month equivalent)." },
];

const securityPoints = [
  ["Role-scoped access.", "Officers and members can see only the parts of the chama they are meant to manage."],
  ["Decisions with clear roles.", "Loan decisions use thresholds configured for each Chama; authorized officers can inspect records, and borrowers can request a human review. After setup, officer seats follow a scheduled secret-ballot election.", "landingDecisionsTitle", "landingDecisionsCopy"],
  ["Audit history.", "PIN-protected, role-scoped access and an application audit log support review. The log is not tamper-evident, so keep source receipts and backups.", undefined, "landingAuditCopy"],
];

function translate(value) {
  return window.jiraniI18n?.translateText(value) || value;
}

function FeatureIcon({ index }) {
  const paths = [
    <><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>,
    <><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2M19 8a3 3 0 0 1 0 6M22 21v-2a5 5 0 0 0-3-4.58" /></>,
    <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
    <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M9 3h6v4H9zM8 12h8M8 16h8" /></>,
    <><path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3.4-.7L4 20l1.7-4.5a7.5 7.5 0 1 1 15.3-4zM8 11h8M8 14h5" /></>,
  ];
  return <div className="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[index]}</svg></div>;
}

export default function LandingPage() {
  const rootRef = useRef(null);
  const pricingDialogRef = useRef(null);
  const pricingTitleRef = useRef(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactState, setContactState] = useState("");
  const [contactMessage, setContactMessage] = useState("");

  useEffect(() => {
    const priorClass = document.body.className;
    document.body.className = "landing-mode";
    const applyTranslations = () => window.jiraniI18n?.apply(rootRef.current || document.documentElement);
    applyTranslations();
    window.addEventListener("languagechange", applyTranslations);
    return () => {
      window.removeEventListener("languagechange", applyTranslations);
      document.body.className = priorClass;
    };
  }, []);

  useEffect(() => {
    window.jiraniI18n?.apply(rootRef.current || document.documentElement);
  }, [mobileNavOpen, selectedPlan, contactBusy, contactMessage]);

  useEffect(() => {
    if (!selectedPlan || !pricingDialogRef.current || pricingDialogRef.current.open) return;
    pricingDialogRef.current.showModal();
    pricingTitleRef.current?.focus({ preventScroll: true });
  }, [selectedPlan]);

  async function handleContactSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setContactBusy(true);
    setContactState("");
    setContactMessage("");
    try {
      const response = await submitContact(Object.fromEntries(new FormData(form).entries()));
      if (!response.ok) {
        if (response.status === 429) setContactMessage("Too many messages were sent. Please try again later.");
        else if (response.status === 400) setContactMessage("Please review the required fields and try again.");
        else if (response.status >= 500) setContactMessage("Email delivery is temporarily unavailable. Please try again later or email us directly.");
        else setContactMessage("We couldn’t send your message just now. Please try again or email us directly.");
        setContactState("error");
        return;
      }
      form.reset();
      setContactMessage("Your message has been sent. Thanks for contacting us.");
      setContactState("success");
    } catch {
      setContactMessage("We couldn’t send your message just now. Please try again or email us directly.");
      setContactState("error");
    } finally {
      setContactBusy(false);
    }
  }

  function closePricingDialog() {
    pricingDialogRef.current?.close();
    setSelectedPlan(null);
  }

  return (
    <div ref={rootRef}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><img src="/brand-mark.svg" alt="" /></span>
          <span>Jirani Chama <small>GROUP SAVINGS</small></span>
          <nav className="topbar-nav" aria-label="Landing Page Navigation">
            <a href="#features" className="topbar-nav-link">Features</a><a href="#how-it-works" className="topbar-nav-link">How It Works</a><a href="#pricing" className="topbar-nav-link">Pricing</a><a href="#security" className="topbar-nav-link">Security</a><a href="#faq" className="topbar-nav-link">FAQ</a><a href="#contact" className="topbar-nav-link" data-i18n="getInTouchNav">Get in touch</a>
          </nav>
          <label className="language-control landing-language-control" htmlFor="landing-language-switch">
            <span className="screen-reader-only" data-i18n="language">Language</span>
            <select id="landing-language-switch" aria-label="Language" data-i18n-aria-label="language" defaultValue="en">
              <option value="en" data-i18n="englishOption">English</option>
              <option value="sw" data-i18n="swahili">Kiswahili</option>
            </select>
          </label>
          <button id="landing-menu-toggle" className="mini-btn landing-menu-toggle" type="button" aria-label={mobileNavOpen ? "Close landing navigation" : "Open landing navigation"} data-i18n-aria-label={mobileNavOpen ? "landingNavClose" : "landingNavOpen"} aria-expanded={mobileNavOpen} aria-controls="landing-mobile-nav" onClick={() => setMobileNavOpen(open => !open)}><span className="ham-bar" aria-hidden="true" /><span className="ham-bar" aria-hidden="true" /><span className="ham-bar" aria-hidden="true" /></button>
          <nav id="landing-mobile-nav" className="landing-mobile-nav" aria-label="Landing page navigation" data-i18n-aria-label="landingNavLabel" hidden={!mobileNavOpen} onClick={() => setMobileNavOpen(false)}>
            {navItems.map(([href, label, key]) => <a key={href} href={href} data-i18n={key}>{label}</a>)}
          </nav>
        </div>
      </header>
      <section className="login-overlay" id="login" aria-label="Sign in to Jirani Chama" data-i18n-aria-label="signInLabel">
        <div className="login-content">
          <div className="login-brand">
            <div className="login-logo-wrap"><img src="/brand-lockup.svg" alt="Jirani Chama — group savings, together" width="440" height="112" /></div>
            <h1><span data-i18n="landingHeroLead">Run contributions,</span> <span className="hero-accent" data-i18n="landingHeroHighlight">loan approvals, and records</span> <span data-i18n="landingHeroTail">in one accountable place.</span></h1>
            <p className="login-intro" data-i18n="landingHeroSubtitle">Give your chama a clear shared record of what was contributed, approved, and decided.</p>
          </div>
          <div id="landing-view" className="login-card">
            <h2 data-i18n="welcomePortal">Welcome to Jirani Chama</h2>
            <p data-i18n="manageGroup">Manage contributions, loans, and group decisions in one trusted place.</p>
            <div className="landing-actions">
              <a className="button-primary" id="landing-register" href="/register.html" data-i18n="registerNewChama">Register a New Chama</a>
              <a className="button-primary button-secondary" id="landing-login" href="/member-login.html" data-i18n="memberLogin">Member Login</a>
              <a className="button-primary button-outline" id="landing-invite" href="/member-login.html?activation=1">Enter Invite Code</a>
              <PwaInstallButton />
            </div>
          </div>
          <div className="landing-sections-container">
            <section id="features" className="landing-section">
              <div className="section-inner">
                <header className="section-header"><span className="section-eyebrow">Capabilities</span><h2 className="section-heading">What Your Chama Can Do</h2><p className="section-subheading">Modern financial management designed for Kenyan table-banking and savings groups.</p></header>
                <div className="features-grid">
                  {features.map(([title, copy, titleKey, copyKey], index) => <article className="feature-card" key={title}><FeatureIcon index={index} /><h3 data-i18n={titleKey}>{title}</h3><p data-i18n={copyKey}>{copy}</p></article>)}
                </div>
              </div>
            </section>
            <section id="how-it-works" className="landing-section">
              <div className="section-inner"><header className="section-header"><span className="section-eyebrow">Getting Started</span><h2 className="section-heading">How It Works</h2><p className="section-subheading">Get your group operational in four easy steps.</p></header>
                <ol className="steps-list">{steps.map(([title, copy], index) => <li className="step-card" key={title}><span className="step-badge" aria-hidden="true">{index + 1}</span><div className="step-body"><h3>{title}</h3><p>{copy}</p></div></li>)}</ol>
              </div>
            </section>
            <section id="security" className="landing-section">
              <div className="section-inner"><header className="section-header"><span className="section-eyebrow">Security</span><h2 className="section-heading">Built for Trust and Accountability</h2><p className="section-subheading">The platform keeps sensitive treasury and member data visible only where it is needed.</p></header>
                <ul className="security-list">{securityPoints.map(([title, copy, titleKey, copyKey]) => <li className="security-card" key={title}><div className="security-icon" aria-hidden="true">◇</div><div className="security-text"><strong data-i18n={titleKey}>{title}</strong> <span data-i18n={copyKey}>{copy}</span></div></li>)}</ul>
              </div>
            </section>
            <section id="pricing" className="landing-section pricing-section" aria-labelledby="pricing-title">
              <div className="section-inner"><header className="section-header pricing-header"><span className="section-eyebrow">Pricing</span><h2 id="pricing-title" className="section-heading">Simple pricing for every chama</h2><p className="section-subheading">Choose the billing schedule that works best for your group.</p></header>
                <div className="pricing-grid">
                  {plans.map(plan => <article className={`pricing-card${plan.tier === "Growth Chama" ? " pricing-card-featured" : ""}`} key={plan.tier} aria-labelledby={`${plan.tier === "Basic" ? "basic" : "growth"}-plan-title`}>
                    {plan.tier === "Growth Chama" && <p className="pricing-badge">Growing groups</p>}
                    <h3 id={`${plan.tier === "Basic" ? "basic" : "growth"}-plan-title`}>{plan.tier}</h3><p className="pricing-cap">{plan.cap}</p>
                    <p className="pricing-amount">{plan.monthlyAmount}<span>/month</span></p><p className="pricing-copy">{plan.tier === "Basic" ? "Flexible month-to-month access for your chama." : "More room for a larger chama to manage its records together."}</p><p className="pricing-saving">{plan.annualCopy}</p>
                    <div className="pricing-plan-actions">
                      <button className="button-primary pricing-plan-button" type="button" data-pricing-tier={plan.tier} data-member-cap={plan.cap} data-pricing-billing="Monthly" data-pricing-price={plan.monthlyPrice} data-pricing-total={plan.monthlyTotal} data-pricing-savings="No annual discount" aria-haspopup="dialog" aria-controls="pricing-modal" onClick={() => setSelectedPlan({ ...plan, billing: "Monthly", total: plan.monthlyTotal, savings: "No annual discount" })}>Choose monthly</button>
                      <button className="button-primary button-outline pricing-plan-button" type="button" data-pricing-tier={plan.tier} data-member-cap={plan.cap} data-pricing-billing="Annual" data-pricing-price={plan.annual} data-pricing-total={plan.annualTotal} data-pricing-savings={plan.annualSavings} aria-haspopup="dialog" aria-controls="pricing-modal" onClick={() => setSelectedPlan({ ...plan, billing: "Annual", total: plan.annualTotal, savings: plan.annualSavings })}>Choose annual · Save 20%</button>
                    </div>
                  </article>)}
                  <article className="pricing-card" aria-labelledby="enterprise-plan-title"><h3 id="enterprise-plan-title">Enterprise / Investment</h3><p className="pricing-cap">Custom member caps for groups above 30 members</p><p className="pricing-amount pricing-amount-custom">Custom pricing<span>Contact us</span></p><p className="pricing-copy">Tailored for scale and the added administration of contribution tracking and loan approvals.</p><button className="button-primary pricing-plan-button" type="button" data-pricing-tier="Enterprise / Investment" data-member-cap="Custom member cap for groups above 30 members" data-pricing-billing="Custom" data-pricing-price="Custom pricing — Contact sales" data-pricing-total="Agreed with sales" data-pricing-savings="Tailored plan" aria-haspopup="dialog" aria-controls="pricing-modal" onClick={() => setSelectedPlan({ tier: "Enterprise / Investment", cap: "Custom member cap for groups above 30 members", billing: "Custom", total: "Agreed with sales", savings: "Tailored plan" })}>Contact us for pricing</button></article>
                </div>
              </div>
            </section>
            <section id="faq">
              <div className="faq-container"><h2>Frequently Asked Questions</h2><div className="faq-list">
                {faqs.map(([question, answer, questionKey, answerKey]) => <details key={question}><summary data-i18n={questionKey}>{question}</summary><div className="faq-answer"><p data-i18n={answerKey}>{answer}</p></div></details>)}
              </div></div>
            </section>
            <section id="contact" className="contact-section" aria-labelledby="get-in-touch">
              <div className="contact-shell">
                <aside className="contact-intro-panel"><div><p className="contact-kicker" data-i18n="contactSectionLabel">CONTACT</p><h2 id="get-in-touch" data-i18n="getInTouchTitle">Get in touch</h2><p className="contact-description" data-i18n="contactDescription">Tell us how we can help. Your message goes directly to our team.</p></div><div className="contact-direct"><p className="contact-direct-label" data-i18n="contactDirectLabel">Prefer email?</p><a className="contact-email" href="mailto:09elim3@gmail.com">09elim3@gmail.com</a><p className="contact-direct-copy" data-i18n="contactDirectCopy">You can also email our team directly.</p></div></aside>
                <div className="contact-content-panel"><div className="contact-form-heading"><h3 id="contact-form-title" data-i18n="contactFormTitle">Send us a message</h3><p data-i18n="contactFormCopy">Fill in the form and we’ll get your message to the right person.</p></div>
                  <form id="contact-form" className="contact-form" method="post" action="/api/contact" aria-labelledby="contact-form-title" aria-busy={contactBusy} onSubmit={handleContactSubmit}>
                    <div className="contact-form-fields">
                      <label className="contact-field" htmlFor="contact-name"><span data-i18n="contactNameLabel">Your name</span><input id="contact-name" name="name" type="text" autoComplete="name" maxLength={100} required /></label>
                      <label className="contact-field" htmlFor="contact-email"><span data-i18n="contactEmailLabel">Email address</span><input id="contact-email" name="email" type="email" autoComplete="email" maxLength={254} required /></label>
                      <label className="contact-field contact-field--full" htmlFor="contact-subject"><span data-i18n="contactSubjectLabel">Subject</span><input id="contact-subject" name="subject" type="text" maxLength={120} required /></label>
                      <label className="contact-field contact-field--full" htmlFor="contact-message"><span data-i18n="contactMessageLabel">Message</span><textarea id="contact-message" name="message" rows={5} minLength={10} maxLength={3000} required /></label>
                    </div>
                    <div className="contact-form-actions"><button id="contact-submit" className="contact-submit" type="submit" disabled={contactBusy}><span data-i18n={contactBusy ? undefined : "contactSubmitLabel"}>{contactBusy ? translate("Sending…") : "Send message"}</span><span aria-hidden="true">→</span></button><p className="contact-privacy-note" data-i18n="contactPrivacyNote">Your message is sent privately to our team.</p></div>
                    <p id="contact-feedback" className="contact-feedback" role="status" aria-live="polite" data-state={contactState || undefined} hidden={!contactMessage}>{contactMessage}</p>
                  </form>
                  <nav className="contact-route-links" aria-label="Other ways to get in touch" data-i18n-aria-label="contactMoreOptions"><a className="contact-route-link" href="/member-login.html"><span data-i18n="contactMemberRoute">Already a member? Sign in</span><span aria-hidden="true">→</span></a><a className="contact-route-link" href="/register.html"><span data-i18n="contactCreateRoute">Starting a chama? Create one</span><span aria-hidden="true">→</span></a></nav>
                </div>
              </div>
            </section>
          </div>
        </div>
        <footer className="site-footer"><p>Built for Kenyan savings groups.</p><p>© 2026 Jirani Chama. All rights reserved.</p><nav className="site-footer-links" aria-label="Footer links"><a href="/privacy.html">Privacy</a><span aria-hidden="true">·</span><a href="/terms.html">Terms</a></nav></footer>
      </section>
      <dialog id="pricing-modal" ref={pricingDialogRef} aria-labelledby="pricing-modal-title" aria-describedby="pricing-modal-selection pricing-modal-copy" onClose={() => setSelectedPlan(null)}>
        <div className="pricing-modal-content"><h2 id="pricing-modal-title" ref={pricingTitleRef} tabIndex={-1}>Review your plan</h2>
          <dl id="pricing-modal-selection" className="pricing-modal-details"><div><dt>Tier</dt><dd>{selectedPlan?.tier || ""}</dd></div><div><dt>Member cap</dt><dd>{selectedPlan?.cap || ""}</dd></div><div><dt>Billing</dt><dd>{selectedPlan?.billing || ""}</dd></div><div><dt>Total</dt><dd>{selectedPlan?.total || ""}</dd></div><div><dt>Annual saving</dt><dd>{selectedPlan?.savings || ""}</dd></div></dl>
          <p id="pricing-modal-copy">Online subscription payments are temporarily paused. Prices remain available for review, but selecting a plan will not start checkout, request payment, change subscription status, or affect existing access. Contact us for updates.</p>
          <div className="dialog-actions"><button id="pricing-modal-cancel" className="mini-btn" type="button" onClick={closePricingDialog}>Not now</button><a id="pricing-contact" className="button-primary" href="#contact" onClick={closePricingDialog}>Contact us about this plan</a></div>
        </div>
      </dialog>
    </div>
  );
}
