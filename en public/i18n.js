"use strict";
(function () {
  const dictionary = {
    en: {
      language: "Language",
      english: "English",
      swahili: "Kiswahili",
      signOut: "Sign out",
      tryAgain: "Try again",
      loading: "Loading…",
      ready: "Server ready",
      offline: "Offline",
      live: "Live updates",
      reconnecting: "Reconnecting…",
      polling: "Polling for updates",
      forbidden: "You do not have permission to perform that action.",
      retryError: "The dashboard could not load. Try again.",
      transactions: "Transactions",
      members: "Members",
      loans: "Loans",
      payment: "Record a cash payment",
      balance: "Chama balance",
      contributions: "This month’s contributions",
      outstanding: "Outstanding loans",
      requestLoan: "Request a loan",
      invite: "Invite a member",
      leadership: "Officer assignments",
      confirmCash: "Confirm cash payment",
      cancel: "Cancel",
      confirmPayment: "Confirm payment",
      chairperson: "Chairperson",
      secretary: "Secretary",
      treasurer: "Treasurer",
      member: "Member",
      welcome: "Welcome",
      dashboard: "dashboard"
    },
    sw: {
      language: "Lugha",
      english: "Kiingereza",
      swahili: "Kiswahili",
      signOut: "Ondoka",
      tryAgain: "Jaribu tena",
      loading: "Inapakia…",
      ready: "Seva iko tayari",
      offline: "Nje ya mtandao",
      live: "Masasisho ya moja kwa moja",
      reconnecting: "Inaunganisha tena…",
      polling: "Inatafuta masasisho",
      forbidden: "Huna ruhusa ya kufanya kitendo hiki.",
      retryError: "Dashibodi haikupakia. Jaribu tena.",
      transactions: "Miamala",
      members: "Wanachama",
      loans: "Mikopo",
      payment: "Rekodi malipo ya pesa taslimu",
      balance: "Salio la chama",
      contributions: "Michango ya mwezi huu",
      outstanding: "Mikopo ambayo haijalipwa",
      requestLoan: "Omba mkopo",
      invite: "Alika mwanachama",
      leadership: "Uteuzi wa maafisa",
      confirmCash: "Thibitisha malipo ya pesa taslimu",
      cancel: "Ghairi",
      confirmPayment: "Thibitisha malipo",
      chairperson: "Mwenyekiti",
      secretary: "Katibu",
      treasurer: "Mweka Hazina",
      member: "Mwanachama",
      welcome: "Karibu",
      dashboard: "dashibodi"
    }
  };

  const textPairs = {
    // Brand & header
    "GROUP TREASURY": "HAZINA YA KIKUNDI",
    "Your role controls what you can see and do.": "Jukumu lako linaamua unachoweza kuona na kufanya.",
    "Sign out": "Ondoka",
    "Try again": "Jaribu tena",
    "Language": "Lugha",

    // Navigation links
    "Ledger": "Daftari",
    "Loans": "Mikopo",
    "Request loan": "Omba mkopo",
    "Record payment": "Rekodi malipo",
    "Members": "Wanachama",
    "Invite": "Alika",
    "Attendance": "Mahudhurio",
    "Officers": "Maafisa",
    "Penalties": "Faini",
    "Dividends": "Gawio",
    "Audit log": "Kumbukumbu ya ukaguzi",
    "Group chat": "Gumzo la kikundi",

    // Summary cards
    "Chama balance": "Salio la chama",
    "This month’s contributions": "Michango ya mwezi huu",
    "Outstanding loans": "Mikopo ambayo haijalipwa",

    // Sections & forms
    "Three-role review": "Ukaguzi wa majukumu matatu",
    "Loan requests": "Maombi ya mkopo",
    "A loan needs three role decisions; borrowers cannot decide their own requests. If the borrower is Chairperson or Treasurer, the Secretary fills that approval seat. This app records the decision; it does not transfer loan funds.": "Mkopo unahitaji maamuzi ya majukumu matatu; wakopaji hawawezi kujiamulia maombi yao. Ikiwa mkopaji ni Mwenyekiti au Mweka Hazina, Katibu huchukua nafasi hiyo ya kuidhinisha. Programu hii hurekodi uamuzi; haihamishi pesa.",
    "Transactions": "Miamala",
    "Export transactions & attendance CSV": "Hamisha miamala na mahudhurio (CSV)",
    "Only your confirmed entries are shown.": "Maingizo yako yaliyothibitishwa pekee ndiyo yanaonyeshwa.",
    "All confirmed group entries.": "Maingizo yote yaliyothibitishwa ya kikundi.",
    "Member and invitation history": "Historia ya wanachama na mialiko",
    "Record a cash payment": "Rekodi malipo ya pesa taslimu",
    "Record cash entries in the ledger. No money is transferred by this app.": "Rekodi malipo ya pesa taslimu kwenye daftari. Programu hii haihamishi pesa.",
    "Member": "Mwanachama",
    "Amount (KES)": "Kiasi (KES)",
    "Reference number": "Nambari ya kumbukumbu",
    "Date received": "Tarehe ya kupokea",
    "Monthly Contribution": "Mchango wa kila mwezi",
    "Loan Repayment": "Malipo ya mkopo",
    "Fine": "Faini",
    "Cash note": "Maelezo ya pesa taslimu",
    "Record cash payment": "Rekodi malipo ya pesa taslimu",
    "Request a loan": "Omba mkopo",
    "For your own account": "Kwa akaunti yako",
    "Repayment period": "Muda wa kulipa",
    "1 month": "Mwezi 1",
    "2 months": "Miezi 2",
    "3 months": "Miezi 3",
    "6 months": "Miezi 6",
    "Guarantor 1": "Mdhamini 1",
    "Guarantor 2": "Mdhamini 2",
    "Submit request": "Tuma ombi",
    "Invite a member": "Alika mwanachama",
    "The activation code is sent by SMS when configured; otherwise share it privately. The Chairperson proposes officer assignments for confirmation.": "Msimbo wa kuwezesha hutumwa kwa SMS huduma hiyo ikisanidiwa; la sivyo, ushiriki kwa faragha. Mwenyekiti hupendekeza uteuzi wa maafisa ili uthibitishwe.",
    "Kenyan phone": "Simu ya Kenya",
    "Requested role": "Jukumu lililoombwa",
    "Create invitation": "Tengeneza mwaliko",
    "Officer assignments": "Uteuzi wa maafisa",
    "The Chairperson proposes an assignment; a different officer confirms it. The first assignment can be approved by the Chairperson to set up the group.": "Mwenyekiti anapendekeza uteuzi; afisa mwingine anathibitisha. Uteuzi wa kwanza unaweza kuidhinishwa na Mwenyekiti kuanzisha kikundi.",
    "Office": "Wadhifa",
    "Incoming official": "Afisa anayeingia",
    "Effective date": "Tarehe ya kuanza",
    "Propose assignment": "Pendekeza uteuzi",
    "Payments, loan decisions, and officer changes, newest first. Entries are added when a change happens. The app has no way to edit or delete them. Showing the latest 50.": "Malipo, maamuzi ya mkopo, na mabadiliko ya maafisa, mapya kwanza. Hakuna njia ya kubadilisha au kufuta. Inaonyesha 50 za hivi karibuni.",
    "Monthly penalties": "Faini za kila mwezi",
    "Month": "Mwezi",
    "Assess monthly penalties": "Kadiria faini za mwezi",
    "Calculate": "Kokotoa",
    "Commit dividends to share capital": "Weka gawio kwenye hisa za mtaji",
    "Group chat": "Gumzo la kikundi",
    "Visible to all active members. Messages cannot be edited or deleted. Showing the latest 100.": "Inaonekana kwa wanachama wote wanaofanya kazi. Ujumbe hauwezi kubadilishwa au kufutwa. Inaonyesha 100 za hivi karibuni.",
    "Message": "Ujumbe",
    "Send": "Tuma",

    // Attendance
    "Meetings · attendance register": "Mikutano · Daftari ya mahudhurio",
    "Choose a meeting date to record attendance or review meeting history.": "Chagua tarehe ya mkutano kurekodi mahudhurio au kutazama historia.",
    "Meeting date": "Tarehe ya mkutano",
    "Mark all present": "Weka wote waliohudhuria",
    "Mark all absent": "Weka wote ambao hawakuhudhuria",
    "Save register": "Hifadhi daftari",
    "Meeting history": "Historia ya mikutano",
    "Edit history": "Historia ya marekebisho",
    "View-only for non-Secretary": "Kusoma tu kwa asiye Katibu",

    // Table headers & columns
    "Date": "Tarehe",
    "Amount": "Kiasi",
    "Method": "Njia",
    "Type": "Aina",
    "Name": "Jina",
    "Phone": "Simu",
    "Role": "Jukumu",
    "Status": "Hali",
    "Actions": "Vitendo",
    "When": "Wakati",
    "Who": "Nani",
    "What happened": "Kilichotokea",
    "Decision": "Uamuzi",
    "Share capital": "Hisa za mtaji",
    "Dividend": "Gawio",

    // Login & auth portal
    "Simple, trusted group savings.": "Akiba ya kikundi iliyo rahisi na ya kuaminika.",
    "Keep contributions, loans, and group decisions together in one secure place.": "Weka michango, mikopo, na maamuzi ya kikundi pamoja mahali pamoja salama.",
    "Welcome back": "Karibu tena",
    "Sign in with your Kenyan mobile number and PIN.": "Ingia kwa kutumia nambari yako ya simu ya Kenya na PIN.",
    "Phone number": "Nambari ya simu",
    "PIN": "PIN",
    "Sign in": "Ingia",
    "Activate invitation": "Washa mwaliko",
    "Your chama’s records are available to you after sign-in.": "Kumbukumbu za chama chako zinapatikana kwako baada ya kuingia.",
    "Create your chama account": "Fungua akaunti ya chama chako",
    "You’ll be the first chairperson. Use your own details and choose a private PIN.": "Utakuwa mwenyekiti wa kwanza. Tumia maelezo yako na uchague PIN ya siri.",
    "Your name": "Jina lako",
    "Kenyan phone number": "Nambari ya simu ya Kenya",
    "Choose a 6–12 digit PIN": "Chagua PIN ya tarakimu 6–12",
    "Create chairperson account": "Fungua akaunti ya mwenyekiti",
    "This setup is available only while the chama has no accounts or records.": "Usanidi huu unapatikana tu wakati chama hakina akaunti au kumbukumbu.",
    "Activate account": "Washa akaunti",
    "Activation code": "Msimbo wa kuwezesha",
    "Activate": "Washa",
    "Back to sign in": "Rudi kuingia",
    "Change your PIN": "Badilisha PIN yako",
    "Choose a private 6–12 digit PIN before using the dashboard.": "Chagua PIN ya siri ya tarakimu 6–12 kabla ya kutumia dashibodi.",
    "Current PIN": "PIN ya sasa",
    "New PIN": "PIN mpya",
    "Save PIN": "Hifadhi PIN",

    // Confirmation dialogs
    "Confirm cash payment": "Thibitisha malipo ya pesa taslimu",
    "Cancel": "Ghairi",
    "Confirm payment": "Thibitisha malipo",
    "Update attendance register?": "Sasisha daftari la mahudhurio?",
    "This meeting already has a register. Saving will replace its attendance and record the changes.": "Mkutano huu tayari una daftari. Kuhifadhi kutabadilisha mahudhurio na kurekodi mabadiliko.",
    "Continue": "Endelea",

    // Empty states
    "No transactions available.": "Hakuna miamala inayopatikana.",
    "No members available.": "Hakuna wanachama wanaopatikana.",
    "No loans available.": "Hakuna mikopo inayopatikana.",
    "No messages yet.": "Bado hakuna jumbe.",
    "No audit entries yet.": "Bado hakuna kumbukumbu za ukaguzi.",
    "No officer assignments recorded.": "Hakuna uteuzi wa maafisa uliorekodiwa.",
    "No meeting attendance recorded yet.": "Bado hakuna mahudhurio ya mkutano yaliyorekodiwa."
  };

  // Reverse mapping for Swahili -> English
  const swToEn = {};
  for (const [enKey, swVal] of Object.entries(textPairs)) {
    swToEn[swVal] = enKey;
  }

  let language = localStorage.getItem("jirani-language") || "en";

  function getLang() {
    return language === "sw" ? "sw" : "en";
  }

  function t(key) {
    const l = getLang();
    return (dictionary[l] || dictionary.en)[key] || dictionary.en[key] || key;
  }

  function roleName(role) {
    if (!role) return "";
    const lower = role.toLowerCase();
    const l = getLang();
    if (dictionary[l] && dictionary[l][lower]) {
      return dictionary[l][lower];
    }
    return role[0].toUpperCase() + role.slice(1);
  }

  function apply(root = document.body) {
    const l = getLang();
    document.documentElement.lang = l;
    const select = document.querySelector("#language-switch");
    if (select) select.value = l;

    // Apply specific key-based node texts
    const map = {
      "#logout": "signOut",
      "#retry": "tryAgain",
      "#cash-confirm-title": "confirmCash",
      "#cash-confirm-form [value=cancel]": "cancel",
      "#cash-confirm-form [value=confirm]": "confirmPayment"
    };
    for (const [selector, key] of Object.entries(map)) {
      const node = document.querySelector(selector);
      if (node) node.textContent = t(key);
    }

    // Traverse text nodes and replace based on the dictionary
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "SELECT"].includes(parent.tagName)) return;

      if (!node._i18nOriginal) {
        node._i18nOriginal = node.nodeValue.trim();
      }
      const raw = node.nodeValue;
      const trimmed = raw.trim();
      if (!trimmed) return;

      if (l === "sw") {
        if (textPairs[trimmed]) {
          node.nodeValue = raw.replace(trimmed, textPairs[trimmed]);
        }
      } else {
        if (swToEn[trimmed]) {
          node.nodeValue = raw.replace(trimmed, swToEn[trimmed]);
        } else if (node._i18nOriginal && textPairs[node._i18nOriginal] === trimmed) {
          node.nodeValue = raw.replace(trimmed, node._i18nOriginal);
        }
      }
    });

    // Also update submit button texts or inputs with values
    document.querySelectorAll("input[type=button], input[type=submit]").forEach(input => {
      const val = input.value.trim();
      if (l === "sw" && textPairs[val]) input.value = textPairs[val];
      else if (l === "en" && swToEn[val]) input.value = swToEn[val];
    });
  }

  function setLanguage(next) {
    language = next === "sw" ? "sw" : "en";
    localStorage.setItem("jirani-language", language);
    apply();
    window.dispatchEvent(new CustomEvent("languagechange", { detail: { language } }));
  }

  window.jiraniI18n = {
    t,
    roleName,
    getLanguage: getLang,
    apply,
    setLanguage
  };

  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelector("#language-switch")?.addEventListener("change", event => {
      setLanguage(event.target.value);
    });
  });
})();
