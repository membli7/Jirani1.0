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
      setupChecklistTitle: "Set up your chama",
      setupChecklistCopy: "Complete these steps when you are ready. You can skip any step.",
      setupInviteSecretary: "Invite the Secretary",
      setupInviteTreasurer: "Invite the Treasurer",
      setupAddMembers: "Add ordinary Members",
      setupReviewOverview: "Review the Overview",
      setupChecklistShow: "Show setup checklist",
      setupChecklistDismiss: "Dismiss",
      setupChecklistSkip: "Skip",
      setupChecklistUndoSkip: "Undo skip",
      setupChecklistComplete: "Complete",
      setupChecklistSkipped: "Skipped",
      setupChecklistNeeded: "Not yet complete",
      setupChecklistOpen: "Open",
      setupChecklistReview: "Review Overview",
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
      setupChecklistTitle: "Sanidi chama chako",
      setupChecklistCopy: "Kamilisha hatua hizi ukiwa tayari. Unaweza kuruka hatua yoyote.",
      setupInviteSecretary: "Alika Katibu",
      setupInviteTreasurer: "Alika Mweka Hazina",
      setupAddMembers: "Ongeza wanachama wa kawaida",
      setupReviewOverview: "Kagua muhtasari",
      setupChecklistShow: "Onyesha orodha ya usanidi",
      setupChecklistDismiss: "Funga",
      setupChecklistSkip: "Ruka",
      setupChecklistUndoSkip: "Acha kuruka",
      setupChecklistComplete: "Imekamilika",
      setupChecklistSkipped: "Imepuuzwa",
      setupChecklistNeeded: "Bado haijakamilika",
      setupChecklistOpen: "Fungua",
      setupChecklistReview: "Kagua muhtasari",
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
    "The activation code is sent by SMS when configured; otherwise share it privately.": "Msimbo wa kuwezesha hutumwa kwa SMS huduma hiyo ikisanidiwa; la sivyo, ushiriki kwa faragha.",
    "During initial setup, the Chairperson can invite a Secretary and Treasurer together. After setup, officers are selected through secret-ballot elections.": "Wakati wa usanidi wa awali, Mwenyekiti anaweza kumwalika Katibu na Mweka Hazina pamoja. Baada ya usanidi, maafisa huchaguliwa kwa kura za siri.",
    "After setup, officers are selected through secret-ballot elections.": "Baada ya usanidi, maafisa huchaguliwa kwa kura za siri.",
    "The Chairperson or Secretary can invite Members directly.": "Mwenyekiti au Katibu anaweza kuwaalika wanachama moja kwa moja.",
    "Kenyan phone": "Simu ya Kenya",
    "Requested role": "Jukumu lililoombwa",
    "Create invitation": "Tengeneza mwaliko",
    "Officer assignments": "Uteuzi wa maafisa",
    "After setup, the Secretary proposes officer candidates. Eligible group accounts vote by secret ballot; the Chairperson opens and closes voting and verifies the result. Verified changes take effect after 24 hours.": "Baada ya usanidi, Katibu hupendekeza wagombea wa afisa. Akaunti zinazostahili za kikundi hupiga kura ya siri; Mwenyekiti hufungua na kufunga upigaji kura na kuthibitisha matokeo. Mabadiliko yaliyothibitishwa huanza kutumika baada ya saa 24.",
    "This records cash already received; it does not transfer money.": "Hii hurekodi pesa taslimu zilizopokelewa tayari; haihamishi pesa.",
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
    "No meeting attendance recorded yet.": "Bado hakuna mahudhurio ya mkutano yaliyorekodiwa.",
    "Pending": "Inasubiri",
    "Approved": "Imeidhinishwa",
    "Rejected": "Imekataliwa",
    "Repaid": "Imelipwa",
    "Closed": "Imefungwa",
    "Present": "Yupo",
    "Absent": "Hayupo",
    "present": "waliohudhuria",
    "absent": "wasiohudhuria",
    "members": "wanachama",
    "View profile": "Tazama wasifu",
    "Your contact details and profile photo.": "Maelezo yako ya mawasiliano na picha ya wasifu.",
    "Current profile photo": "Picha ya sasa ya wasifu",
    "Select your chama, then sign in again.": "Chagua chama chako, kisha uingie tena.",
    "Cannot reach the server. Check that it is running, then try again.": "Haiwezi kufikia seva. Hakikisha inaendelea kufanya kazi, kisha ujaribu tena.",
    "Account activated. Please sign in.": "Akaunti imewashwa. Tafadhali ingia.",
    "Switch chama": "Badilisha chama",
    "Choose a chama": "Chagua chama",
    "Sign in again to choose a chama linked to your phone number.": "Ingia tena ili uchague chama kilichounganishwa na nambari yako ya simu.",
    "Choose your chama": "Chagua chama chako",
    "Select a chama": "Chagua chama",
    "This chama is already registered. Sign in with the phone number and PIN used for its Chairperson account.": "Chama hiki tayari kimesajiliwa. Ingia ukitumia nambari ya simu na PIN ya akaunti ya Mwenyekiti.",
    "This chama is already registered. Please sign in with its Chairperson account.": "Chama hiki tayari kimesajiliwa. Tafadhali ingia ukitumia akaunti ya Mwenyekiti.",
    "Could not register the chama. Please try again.": "Imeshindikana kusajili chama. Tafadhali jaribu tena.",
    "Could not check whether this instance is ready for setup.": "Imeshindikana kuthibitisha kama mfumo huu uko tayari kusanidiwa.",
    "Only your confirmed entries are shown.": "Maingizo yako yaliyothibitishwa pekee ndiyo yanaonyeshwa.",
    "All confirmed group entries.": "Maingizo yote yaliyothibitishwa ya kikundi.",
    "Your requests and eligible independent approvals.": "Maombi yako na maamuzi huru ya kuidhinisha unayostahili kufanya.",
    "Three roles review each request; the Secretary fills a Chairperson or Treasurer borrower’s approval seat.": "Majukumu matatu hukagua kila ombi; Katibu huchukua nafasi ya Mwenyekiti au Mweka Hazina anapokuwa mkopaji.",
    "Decision not yet recorded": "Uamuzi bado haujarekodiwa",
    "Reason (required)": "Sababu (inahitajika)",
    "No active members to record.": "Hakuna wanachama hai wa kurekodi.",
    "Save changes": "Hifadhi mabadiliko",
    "Your attendance is not listed in this register.": "Mahudhurio yako hayajaorodheshwa kwenye daftari hili.",
    "No attendance details recorded.": "Hakuna maelezo ya mahudhurio yaliyorekodiwa.",
    "No attendance register for this date.": "Hakuna daftari la mahudhurio la tarehe hii.",
    "No attendance changes.": "Hakuna mabadiliko ya mahudhurio.",
    "Open register": "Fungua daftari",
    "No audit entries match this filter.": "Hakuna kumbukumbu za ukaguzi zinazolingana na kichujio hiki.",
    "Select a loan": "Chagua mkopo",
    "Select a guarantor": "Chagua mdhamini",
    "Save register": "Hifadhi daftari",
    "Dividend preview ready. Nothing has been paid out yet.": "Muhtasari wa gawio uko tayari. Bado hakuna malipo yaliyotolewa.",
    "Dividends added to share capital.": "Gawio limeongezwa kwenye mtaji wa hisa.",
    "You were signed out after 15 minutes of inactivity.": "Umetolewa kwenye akaunti baada ya dakika 15 bila shughuli.",
    "Signed out.": "Umetoka kwenye akaunti.",
    "PIN changed successfully.": "PIN imebadilishwa kwa mafanikio.",
    "Cash payment recorded.": "Malipo ya pesa taslimu yamerekodiwa.",
    "Loan request submitted.": "Ombi la mkopo limetumwa.",
    "Activation code copied. Share it privately.": "Msimbo wa kuwezesha umenakiliwa. Mshirikishe kwa faragha.",
    "Copy failed. Select the activation code and copy it manually.": "Kunakili kumeshindikana. Chagua msimbo wa kuwezesha na unakili mwenyewe.",
    "Enter a reason of 5-500 characters.": "Weka sababu yenye herufi 5–500.",
    "Invitation revoked and recorded in history.": "Mwaliko umebatilishwa na kurekodiwa kwenye historia.",
    "Role revoked and recorded in history.": "Wadhifa umebatilishwa na kurekodiwa kwenye historia.",
    "Officer assignment proposed.": "Uteuzi wa afisa umependekezwa.",
    "Choose at least two active Members as candidates.": "Chagua angalau wanachama hai wawili kama wagombea.",
    "Election proposal sent to the Chairperson.": "Pendekezo la uchaguzi limetumwa kwa Mwenyekiti.",
    "Your secret vote has been recorded.": "Kura yako ya siri imerekodiwa.",
    "Decision recorded.": "Uamuzi umerekodiwa.",
    "Officer assignment confirmed.": "Uteuzi wa afisa umethibitishwa.",
    "Enter a reason of at least 5 characters.": "Weka sababu yenye angalau herufi 5.",
    "You do not have permission to view the audit log.": "Huna ruhusa ya kuona kumbukumbu za ukaguzi.",
    "The audit log could not load. Try again.": "Kumbukumbu za ukaguzi hazikupakia. Jaribu tena.",
    "Your financial details could not load. Try refreshing the page.": "Maelezo yako ya fedha hayakupakia. Jaribu kupakia ukurasa upya.",
    "Group financial totals could not load. Try refreshing the page.": "Jumla za fedha za kikundi hazikupakia. Jaribu kupakia ukurasa upya.",
    "Decision reason": "Sababu ya uamuzi",
    "Awaiting": "Inasubiri",
    "Activated": "Imewezeshwa",
    "Invitation expired": "Muda wa mwaliko umeisha",
    "Awaiting activation": "Inasubiri kuwezeshwa",
    "Revoked by Chairperson": "Umebatilishwa na Mwenyekiti",
    "Invitation revoked": "Mwaliko umebatilishwa",
    "Copy": "Nakili"
  };

  const keyedTranslations = {
    youTab: ["You", "Wewe"], groupTab: ["Group", "Kikundi"], englishOption: ["English", "Kiingereza"],
    yourFinances: ["Your finances", "Fedha zako"], yourFinancesCopy: ["Only your own records are shown here.", "Rekodi zako pekee ndizo zinazoonyeshwa hapa."],
    yourContributions: ["Your contributions", "Michango yako"], note: ["Note", "Maelezo"], yourFines: ["Your fines", "Faini zako"], reason: ["Reason", "Sababu"],
    amountDue: ["Amount due", "Kiasi kinachodaiwa"], yourLoanBalances: ["Your loan balances", "Salio la mikopo yako"], balanceDue: ["Balance due", "Salio linalodaiwa"],
    yourArrears: ["Your arrears", "Madeni yako"], arrearsIncludedCopy: ["Based on recorded outstanding loan balances and assessed unpaid fines.", "Hesabu hii inategemea salio la mikopo na faini zisizolipwa zilizorekodiwa."],
    dueItem: ["Due item", "Kipengee kinachodaiwa"], groupFinances: ["Group finances", "Fedha za kikundi"], groupFinancesCopy: ["Group totals are shown without individual member records.", "Jumla za kikundi zinaonyeshwa bila kuonyesha rekodi za mwanachama mmoja mmoja."],
    balanceHistory: ["Chama balance by month", "Salio la chama kwa mwezi"], contributionHistory: ["Monthly contributions", "Michango ya kila mwezi"],
    loanApprovalHistory: ["Loan amounts approved each month", "Kiasi cha mikopo iliyoidhinishwa kila mwezi"], groupLoanBalances: ["Group loan balance", "Salio la mikopo ya kikundi"],
    shareCapitalToDate: ["Share capital (all time)", "Mtaji wa hisa (jumla)"], investmentHistory: ["Share capital by month", "Mtaji wa hisa kwa mwezi"],
    penaltiesToDate: ["Penalties recorded (all time)", "Faini zilizorekodiwa (jumla)"], fineHistory: ["Penalties by month", "Faini kwa mwezi"],
    expensesToDate: ["Expenses (all time)", "Matumizi (jumla)"], expenseHistory: ["Expenses by month", "Matumizi kwa mwezi"], groupArrears: ["Group arrears", "Madeni ya kikundi"],
    previousPage: ["Previous", "Iliyotangulia"], nextPage: ["Next", "Inayofuata"], cashFlow: ["Cash flow", "Mtiririko wa fedha"], cashIn: ["Cash in", "Fedha zinazoingia"], cashOut: ["Cash out", "Fedha zinazotoka"],
    receiptReference: ["Receipt reference", "Nambari ya kumbukumbu ya risiti"], cashDateLimit: ["Dates can be backdated up to 30 days.", "Tarehe inaweza kurudishwa nyuma kwa hadi siku 30."],
    otherIncome: ["Other Income", "Mapato mengine"], cashOutType: ["Cash-out type", "Aina ya fedha zilizotoka"], finance: ["Finance", "Fedha"], expenses: ["Expenses", "Matumizi"],
    loan: ["Loan", "Mkopo"], other: ["Other", "Nyingine"], otherType: ["Other type", "Aina nyingine"], approvedLoan: ["Approved loan", "Mkopo ulioidhinishwa"],
    initialOfficialsTitle: ["Invite both officials", "Alika maafisa wote wawili"], initialOfficialsDescription: ["Enter one person for each office. If SMS is not configured, share each activation code privately.", "Weka mtu mmoja kwa kila wadhifa. Ikiwa huduma ya SMS haijasanidiwa, mshirikishe kila mtu msimbo wake wa kuwezesha kwa faragha."],
    inviteEmail: ["Email address", "Anwani ya barua pepe"], inviteBothOfficials: ["Invite both officials", "Alika maafisa wote wawili"], copyCode: ["Copy code", "Nakili msimbo"],
    cashFlowTableTitle: ["Recent cash flows", "Mtiririko wa fedha wa hivi karibuni"], flow: ["Flow", "Mwelekeo"], time: ["Time", "Muda"], recordedBy: ["Recorded by", "Imerekodiwa na"],
    penaltyExplanation: ["After the configured deadline, active members who have not met the chama's configured welfare contribution may be charged the configured penalty.", "Baada ya tarehe ya mwisho iliyowekwa, wanachama hai ambao hawajafikisha mchango wa ustawi uliowekwa na chama wanaweza kutozwa faini iliyowekwa."],
    dividendExplanation: ["Preview each member's pro-rata share of a cycle's interest and penalties, after admin expenses. Nothing is paid out until you commit.", "Kagua mgao sawia wa kila mwanachama kutoka riba na faini za kipindi, baada ya kutoa gharama za utawala. Hakuna malipo yatakayotolewa hadi uthibitishe."],
    cycleStart: ["Cycle start", "Mwanzo wa kipindi"], cycleEnd: ["Cycle end", "Mwisho wa kipindi"], adminExpensesKes: ["Admin expenses (KES)", "Gharama za utawala (KES)"],
    logoTitle: ["Jirani Chama logo", "Nembo ya Jirani Chama"], logoDescription: ["Four linked rings in indigo, terracotta, sage and gold around a sand-coloured treasury coin, with the wordmark JIRANI CHAMA and the tagline \"Shilling by shilling, neighbour by neighbour\".", "Pete nne zilizounganishwa za rangi ya indigo, udongo, kijani hafifu na dhahabu zimezunguka sarafu ya hazina ya rangi ya mchanga. Kando yake kuna jina JIRANI CHAMA na kauli mbiu \"Shilingi kwa shilingi, jirani kwa jirani\"."],
    welcomePortal: ["Welcome to Jirani Chama", "Karibu Jirani Chama"], manageGroup: ["Manage contributions, loans, and group decisions in one trusted place.", "Simamia michango, mikopo na maamuzi ya kikundi mahali pamoja pa kuaminika."],
    registerNewChama: ["Register a New Chama", "Sajili chama kipya"], memberLogin: ["Member Login", "Kuingia kwa mwanachama"], confirmCashEntry: ["Confirm cash entry", "Thibitisha rekodi ya pesa taslimu"],
    financialViews: ["Financial views", "Mionekano ya fedha"], memberAttendance: ["Member attendance", "Mahudhurio ya wanachama"],
    sectionsLabel: ["Sections", "Sehemu"], signInLabel: ["Sign in to Jirani Chama", "Ingia kwenye Jirani Chama"],
    transactionPages: ["Transaction pages", "Kurasa za miamala"], activationCodeLabel: ["One-time activation code", "Msimbo wa kuwezesha wa matumizi ya mara moja"],
    cashNotePlaceholder: ["e.g. Cash received at the weekly meeting", "mf. Pesa taslimu iliyopokelewa kwenye mkutano wa wiki"],
    editProfileTitle: ["Edit profile", "Hariri wasifu"], backDashboard: ["← Back to dashboard", "← Rudi kwenye dashibodi"],
    profileIntro: ["Update your contact details and upload one photo. Jirani Chama creates the browser, iPhone, Android, and large fallback icon sizes for you.", "Sasisha maelezo yako ya mawasiliano na upakie picha moja. Jirani Chama itakuandalia ukubwa wa ikoni za kivinjari, iPhone, Android na kifaa kikubwa."],
    profileDetails: ["Profile details", "Maelezo ya wasifu"], firstName: ["First name", "Jina la kwanza"], lastName: ["Last name", "Jina la mwisho"],
    nickname: ["Nickname", "Jina la utani"], optionalShownChat: ["(optional; shown in group chat)", "(si lazima; huonekana kwenye gumzo la kikundi)"],
    phoneNumber: ["Phone number", "Nambari ya simu"], email: ["Email", "Barua pepe"], changeDetails: ["Change details", "Badilisha maelezo"],
    saveDetails: ["Save details", "Hifadhi maelezo"], currentPhotoPreview: ["Current profile photo preview", "Onyesho la awali la picha ya wasifu"],
    chooseProfilePhoto: ["Choose a profile photo", "Chagua picha ya wasifu"], profileAcceptedTypes: ["Choose a PNG, JPEG, WebP, GIF, SVG, or icon image. It will be converted to PNG icons in your browser before upload.", "Chagua picha ya PNG, JPEG, WebP, GIF, SVG au ikoni. Itabadilishwa kuwa ikoni za PNG kwenye kivinjari chako kabla ya kupakiwa."],
    profilePreparing: ["Preparing profile icons…", "Inaandaa ikoni za wasifu…"], profileSaved: ["Profile photo saved.", "Picha ya wasifu imehifadhiwa."],
    profileDetailsSaved: ["Profile details saved.", "Maelezo ya wasifu yamehifadhiwa."], profileDetailsSaving: ["Saving profile details…", "Inahifadhi maelezo ya wasifu…"],
    uploadingProfileIcons: ["Uploading profile icons…", "Inapakia ikoni za wasifu…"], viewProfile: ["View profile", "Tazama wasifu"],
    profileContactSummary: ["Your contact details and profile photo.", "Maelezo yako ya mawasiliano na picha ya wasifu."],
    profilePhotoCurrent: ["Current profile photo", "Picha ya sasa ya wasifu"],
    date: ["Date", "Tarehe"], amountKes: ["Amount (KES)", "Kiasi (KES)"], status: ["Status", "Hali"], month: ["Month", "Mwezi"],
    memberLabel: ["Member", "Mwanachama"], monthlyContribution: ["Monthly Contribution", "Mchango wa kila mwezi"],
    repayment: ["Loan Repayment", "Malipo ya mkopo"], fine: ["Fine", "Faini"], inviteName: ["Name", "Jina"],
    invitePhone: ["Kenyan phone", "Simu ya Kenya"], type: ["Type", "Aina"], actions: ["Actions", "Vitendo"],
    landingHeading: ["Simple, trusted ", "Akiba rahisi na ya kuaminika "], landingSubtitle: ["Keep contributions, loans, and group decisions together in one secure place.", "Simamia michango, mikopo na maamuzi ya kikundi pamoja mahali salama."],
    groupSavings: ["group savings", "ya kikundi"]
  };
  for (const [key, [english, swahili]] of Object.entries(keyedTranslations)) {
    if (!dictionary.en[key]) dictionary.en[key] = english;
    if (!dictionary.sw[key]) dictionary.sw[key] = swahili;
  }

  // Reverse mapping for Swahili -> English
  const swToEn = {};
  for (const [enKey, swVal] of Object.entries(textPairs)) {
    swToEn[swVal] = enKey;
  }
  for (const [key, [english, swahili]] of Object.entries(keyedTranslations)) {
    swToEn[swahili] = english;
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

  function apply(root = document.documentElement) {
    const l = getLang();
    document.documentElement.lang = l;
    const select = document.querySelector("#language-switch");
    if (select) select.value = l;

    root.querySelectorAll("[data-i18n]").forEach(element => {
      const textNode = [...element.childNodes].find(node => node.nodeType === 3 && node.nodeValue.trim());
      const value = dictionary[l]?.[element.dataset.i18n] || (l === "sw" && textNode ? textPairs[textNode.nodeValue.trim()] : undefined);
      if (l === "sw" && !value) return;
      if (textNode) {
        if (textNode._i18nKeyOriginal === undefined) textNode._i18nKeyOriginal = textNode.nodeValue;
        const original = textNode._i18nKeyOriginal;
        if (l === "sw") textNode.nodeValue = original.replace(original.trim(), value);
        else textNode.nodeValue = original;
      } else if (!element.childNodes.length) {
        if (element._i18nKeyOriginal === undefined) element._i18nKeyOriginal = element.textContent;
        element.textContent = l === "sw" ? value : element._i18nKeyOriginal;
      }
    });
    root.querySelectorAll("[data-i18n-placeholder], [data-i18n-aria-label]").forEach(element => {
      for (const attribute of ["placeholder", "aria-label"]) {
        const key = element.getAttribute(`data-i18n-${attribute}`);
        if (!key) continue;
        const originalKey = `i18nOriginal${attribute.replace(/(^|-)([a-z])/g, (_, _dash, char) => char.toUpperCase())}`;
        if (element.dataset[originalKey] === undefined) element.dataset[originalKey] = element.getAttribute(attribute) || "";
        const value = l === "sw" ? dictionary.sw[key] : element.dataset[originalKey];
        if (value) element.setAttribute(attribute, value);
      }
    });

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
      if (parent.closest("[data-i18n]")) return;

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

  function translateText(value) {
    const text = String(value ?? "");
    if (getLang() === "sw") {
      if (textPairs[text]) return textPairs[text];
      for (const [key, [english, swahili]] of Object.entries(keyedTranslations)) {
        if (english === text) return swahili;
      }
      return text;
    }
    return swToEn[text] || text;
  }

  window.jiraniI18n = {
    t,
    roleName,
    translateText,
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
