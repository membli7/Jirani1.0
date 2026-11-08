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
      contributionsNav: "Contributions",
      membersPanelCopy: "The active roster and invitation history are shown separately.",
      activeMembersTitle: "Active members",
      activeMembersCopy: "Current accounts in the chama roster.",
      memberHistoryTitle: "Invitation & account history",
      memberHistoryCopy: "Review invitations, activations, expiry, revocation, and inactive accounts.",
      noActiveMembers: "No active members.",
      noMemberHistory: "No invitation or account history yet.",
      memberNameColumn: "Name",
      memberPhoneColumn: "Phone",
      memberRoleColumn: "Role",
      memberStatusColumn: "Status",
      memberActionsColumn: "Actions",
      transactionActions: "Actions",
      correctDate: "Correct date",
      correctContributionDate: "Correct contribution date",
      dateCorrectionRules: "Only Chairpersons and Treasurers can correct a recorded cash contribution. Provide a non-empty reason. The new date must stay in the original month and preserve whether the contribution was on time or late; the change is recorded in the audit history.",
      correctedDate: "Corrected date",
      correctionReason: "Reason for correction",
      saveCorrection: "Save correction",
      contributionDateCorrected: "Contribution date corrected; the audit log was updated.",
      monthCloseNav: "Monthly close",
      monthCloseTitle: "Month-end review",
      monthClosePanelLabel: "Monthly close review",
      monthCloseIntro: "Review cash entries and open items recorded in this chama. This is a read-only ledger review; it doesn't reconcile with bank or M-PESA statements or move money.",
      monthCloseMonth: "Review month",
      monthCloseLoad: "Build review",
      monthCloseContributions: "Cash contributions recorded",
      monthCloseContributionCount: "contributions",
      monthCloseWelfare: "Welfare",
      monthCloseShareCapital: "Share capital",
      monthCloseRepayments: "Cash loan repayments recorded",
      monthCloseRepaymentCount: "repayments",
      monthCloseOpenLoans: "Open loan balance tracked (not disbursed)",
      monthCloseItemsTitle: "Items to review",
      monthCloseNoContribution: "Active members with no contribution entry",
      monthClosePendingLoans: "Loan requests awaiting decisions",
      monthCloseUnpaidPenalties: "Outstanding unpaid penalties",
      monthCloseIncompleteReferences: "Cash entries missing a reference or recorder",
      monthCloseEntriesTitle: "Cash ledger entries for this month",
      monthCloseNoItems: "None recorded.",
      monthCloseNoEntries: "No cash contribution or repayment entries for this month.",
      monthCloseMissingContributionNote: "A missing entry does not prove money is owed; records may be kept elsewhere.",
      monthCloseReference: "Reference",
      monthCloseRecordedBy: "Recorded by",
      monthCloseLatest100: "Showing the latest 100 entries; totals include all matching records.",
      monthCloseLoading: "Loading review…",
      monthCloseFailed: "The monthly review could not load. Try again.",
      monthCloseSelectMonth: "Choose a current or past month.",
      monthCloseReady: "Review ready for the selected month. No records were changed.",
      monthCloseNoTransferNote: "These are recorded balances only; the app does not move money.",
      landingMonthCloseTitle: "A clearer month-end close",
      landingMonthCloseCopy: "Bring recorded cash contributions, repayments, open loan balances, and items needing attention into one read-only monthly view. Compare it with receipts and statements yourself; the app does not verify settlement or move funds.",
      landingChatTitle: "Group chat, in context",
      landingChatCopy: "Active chama members can discuss within their group. Messages refresh through live updates with polling recovery when the connection drops; this is not a WhatsApp or SMS broadcast.",
      landingDecisionsTitle: "Decisions with clear roles.",
      landingDecisionsCopy: "Loans need three distinct role decisions. After setup, officer seats follow a scheduled secret-ballot election.",
      landingAuditCopy: "PIN-protected, role-scoped access and an application audit log support review. The log is not tamper-evident, so keep source receipts and backups.",
      faqGettingStartedQuestion: "How do I get my group started?",
      faqFinancialQuestion: "Can we track individual contributions and balances?",
      faqSecurityQuestion: "Are our group's money and data secure?",
      faqContributionSplitQuestion: "How are monthly contributions split between welfare and share capital?",
      faqLoanQuestion: "How does the platform handle loan approvals and repayments?",
      faqPenaltyQuestion: "How are late-payment penalties assessed?",
      faqGettingStartedAnswer: "Create your profile, invite members with one-time codes, and use scheduled secret-ballot elections for post-setup officer seats.",
      faqFinancialAnswer: "Members and officers can review recorded contributions, balances, loans, and repayments. The app records what the group entered; cash is received or paid outside it.",
      faqSecurityAnswer: "Access is role-scoped and key actions are recorded in an application audit log. The log is not tamper-evident; compare records with receipts and keep backups.",
      faqContributionSplitAnswer: "The Chairperson sets the monthly welfare amount during setup. A contribution first settles outstanding penalties, then covers the member's welfare amount once per month; any remainder goes to share capital.",
      faqLoanAnswer: "A loan needs three distinct role decisions, and borrowers cannot decide their own request. When the borrower is Chairperson or Treasurer, the Secretary fills that approval seat. Supported terms are 1, 2, 3, or 6 months; repayments clear interest before principal. The app records the obligation and cash repayment but does not disburse funds.",
      faqPenaltyAnswer: "A late-dated contribution can create the configured late penalty when the Treasurer records it. Separately, the Chairperson or Secretary must run the monthly assessment for eligible members who have not met the welfare threshold. That assessment is manual, not automatic.",
      faqMonthCloseQuestion: "What does the month-end close review show?",
      faqMonthCloseAnswer: "It summarizes recorded cash contributions and repayments, tracked open loan balances, and items officers may need to review, such as pending loan requests or missing references. It is read-only and does not reconcile bank or M-PESA statements or move money.",
      faqChatQuestion: "Can our group chat inside the app?",
      faqChatAnswer: "Yes. Active accounts can use the chama's in-app group chat. It refreshes through the event stream with polling and reconnection support. WhatsApp/SMS broadcasts and chat by email are not included.",
      faqCorrectionQuestion: "Can we correct a contribution date after recording it?",
      faqCorrectionAnswer: "Only the Chairperson or Treasurer can correct the date of a confirmed cash contribution, and a non-empty reason is required. The new date must be valid, not future-dated, stay in the original month, and preserve whether the contribution was on time or late. Amount, member, and other transaction fields are unchanged. An audit event records the actor, time, old and new dates, and reason; the audit store is not tamper-evident.",
      faqMoneyQuestion: "Does Jirani Chama receive, verify, or move our money?",
      faqMoneyAnswer: "No. It records cash already received or paid outside the app. It does not collect or disburse funds, and bank/M-PESA settlement matching is not enabled.",
      activeStatus: "Active",
      inactiveStatus: "Inactive",
      pendingActivationStatus: "Awaiting activation",
      activatedStatus: "Activated",
      expiredStatus: "Expired",
      revokedStatus: "Revoked",
      unknownStatus: "Unknown",
      loanRequestUnavailable: "New loan requests are unavailable while the group subscription is unpaid or expired.",
      contactPlanRenewal: "Contact us about a plan or renewal",
      roleRevocationSecurityException: "For account security, chairpersons can still revoke an officer role.",
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
      contributionsNav: "Michango",
      membersPanelCopy: "Orodha ya sasa ya wanachama na historia ya mialiko zimeonyeshwa tofauti.",
      activeMembersTitle: "Wanachama hai",
      activeMembersCopy: "Akaunti hai zilizopo kwenye chama.",
      memberHistoryTitle: "Historia ya mialiko na akaunti",
      memberHistoryCopy: "Kagua mialiko, uanzishaji, muda ulioisha, ubatilishaji na akaunti zisizo hai.",
      noActiveMembers: "Hakuna wanachama hai.",
      noMemberHistory: "Bado hakuna historia ya mialiko au akaunti.",
      memberNameColumn: "Jina",
      memberPhoneColumn: "Simu",
      memberRoleColumn: "Jukumu",
      memberStatusColumn: "Hali",
      memberActionsColumn: "Vitendo",
      transactionActions: "Vitendo",
      correctDate: "Sahihisha tarehe",
      correctContributionDate: "Sahihisha tarehe ya mchango",
      dateCorrectionRules: "Mwenyekiti au Mweka Hazina pekee ndiye anayeweza kusahihisha tarehe ya mchango wa pesa taslimu uliorekodiwa. Weka sababu isiyo tupu. Tarehe mpya lazima ibaki ndani ya mwezi wa awali na ihifadhi hali ya kulipwa kwa wakati au kuchelewa; mabadiliko yatarekodiwa kwenye historia ya ukaguzi.",
      correctedDate: "Tarehe iliyosahihishwa",
      correctionReason: "Sababu ya kusahihisha",
      saveCorrection: "Hifadhi marekebisho",
      contributionDateCorrected: "Tarehe ya mchango imesahihishwa; kumbukumbu ya ukaguzi imesasishwa.",
      monthCloseNav: "Hitimisho la mwezi",
      monthCloseTitle: "Mapitio ya mwisho wa mwezi",
      monthClosePanelLabel: "Mapitio ya kufunga mwezi",
      monthCloseIntro: "Kagua rekodi za pesa taslimu na mambo yaliyo wazi yaliyorekodiwa katika chama hiki. Huu ni ukaguzi wa daftari wa kusoma tu; haupatanishi na taarifa za benki au M-PESA wala kuhamisha pesa.",
      monthCloseMonth: "Mwezi wa kukagua",
      monthCloseLoad: "Tengeneza mapitio",
      monthCloseContributions: "Michango ya pesa taslimu iliyorekodiwa",
      monthCloseContributionCount: "michango",
      monthCloseWelfare: "Ustawi",
      monthCloseShareCapital: "Mtaji wa hisa",
      monthCloseRepayments: "Marejesho ya mkopo ya pesa taslimu yaliyorekodiwa",
      monthCloseRepaymentCount: "marejesho",
      monthCloseOpenLoans: "Salio la mikopo iliyo wazi linalofuatiliwa (halijatolewa)",
      monthCloseItemsTitle: "Mambo ya kukagua",
      monthCloseNoContribution: "Wanachama hai wasio na rekodi ya mchango",
      monthClosePendingLoans: "Maombi ya mkopo yanayosubiri maamuzi",
      monthCloseUnpaidPenalties: "Faini ambazo hazijalipwa",
      monthCloseIncompleteReferences: "Rekodi za pesa taslimu zisizo na kumbukumbu au mwandishi",
      monthCloseEntriesTitle: "Rekodi za daftari la pesa taslimu za mwezi huu",
      monthCloseNoItems: "Hakuna zilizorekodiwa.",
      monthCloseNoEntries: "Hakuna michango ya pesa taslimu au marejesho ya mkopo yaliyorekodiwa mwezi huu.",
      monthCloseMissingContributionNote: "Kutokuwepo kwa rekodi hakuthibitishi kuwa pesa zinadaiwa; rekodi zinaweza kuwekwa kwingine.",
      monthCloseReference: "Kumbukumbu",
      monthCloseRecordedBy: "Imerikodiwa na",
      monthCloseLatest100: "Inaonyesha rekodi 100 za hivi karibuni; jumla zinajumuisha rekodi zote zinazolingana.",
      monthCloseLoading: "Inapakia mapitio…",
      monthCloseFailed: "Mapitio ya mwezi hayakupakia. Jaribu tena.",
      monthCloseSelectMonth: "Chagua mwezi wa sasa au uliopita.",
      monthCloseReady: "Mapitio yako tayari kwa mwezi uliochaguliwa. Hakuna rekodi zilizobadilishwa.",
      monthCloseNoTransferNote: "Haya ni masalio yaliyorekodiwa tu; programu haihamishi pesa.",
      landingMonthCloseTitle: "Hitimisho la mwezi lililo wazi zaidi",
      landingMonthCloseCopy: "Leta michango ya pesa taslimu, marejesho, salio la mikopo iliyo wazi na mambo yanayohitaji uangalizi kwenye mapitio moja ya kusoma tu ya mwezi. Linganisha na risiti na taarifa zako mwenyewe; programu haithibitishi malipo wala kuhamisha pesa.",
      landingChatTitle: "Gumzo la kikundi mahali pake",
      landingChatCopy: "Wanachama hai wa chama wanaweza kujadiliana ndani ya kikundi chao. Ujumbe husasishwa kwa matukio ya moja kwa moja na huchunguzwa tena kwa kura za mara kwa mara muunganisho unapokatika; huu si utumaji wa matangazo kwa WhatsApp au SMS.",
      landingDecisionsTitle: "Maamuzi yenye majukumu wazi.",
      landingDecisionsCopy: "Mkopo unahitaji maamuzi matatu tofauti ya majukumu. Baada ya usanidi, nafasi za maafisa hupigiwa kura ya siri kwa tarehe iliyopangwa.",
      landingAuditCopy: "Ufikiaji uliolindwa kwa PIN na kuwekwa kulingana na majukumu pamoja na kumbukumbu ya ukaguzi ya programu husaidia ukaguzi. Kumbukumbu hiyo haizuii kubadilishwa; hifadhi risiti za awali na nakala rudufu.",
      faqGettingStartedQuestion: "Nitaanzishaje kikundi changu?",
      faqFinancialQuestion: "Je, tunaweza kufuatilia michango na salio la kila mwanachama?",
      faqSecurityQuestion: "Je, pesa na data za chama chetu ziko salama?",
      faqContributionSplitQuestion: "Michango ya kila mwezi hugawanywaje kati ya ustawi na mtaji wa hisa?",
      faqLoanQuestion: "Jukwaa hushughulikiaje maamuzi na marejesho ya mikopo?",
      faqPenaltyQuestion: "Faini za malipo ya kuchelewa hutathminiwaje?",
      faqGettingStartedAnswer: "Unda wasifu wako, alika wanachama kwa misimbo ya matumizi ya mara moja, na utumie uchaguzi wa siri uliopangwa kwa nafasi za maafisa baada ya usanidi.",
      faqFinancialAnswer: "Wanachama na maafisa wanaweza kukagua michango, salio, mikopo na marejesho yaliyorekodiwa. Programu huweka rekodi zilizoingizwa na chama; pesa taslimu hupokelewa au kulipwa nje ya programu.",
      faqSecurityAnswer: "Ufikiaji hutegemea jukumu na vitendo muhimu huwekwa kwenye kumbukumbu ya ukaguzi ya programu. Kumbukumbu hii haizuii kubadilishwa; linganisha rekodi na risiti na uhifadhi nakala rudufu.",
      faqContributionSplitAnswer: "Mwenyekiti huweka kiasi cha ustawi cha mwezi wakati wa usanidi. Mchango kwanza hulipa faini ambazo hazijalipwa, kisha kiasi cha ustawi cha mwanachama mara moja kwa mwezi; salio huenda kwenye mtaji wa hisa.",
      faqLoanAnswer: "Mkopo unahitaji maamuzi matatu tofauti ya majukumu, na mkopaji hawezi kuamua ombi lake mwenyewe. Mkopaji akiwa Mwenyekiti au Mweka Hazina, Katibu hujaza nafasi hiyo ya uamuzi. Muda unaoruhusiwa ni miezi 1, 2, 3 au 6; marejesho hulipa riba kabla ya mtaji. Programu hurekodi deni na marejesho ya pesa taslimu lakini haitoi pesa.",
      faqPenaltyAnswer: "Mweka Hazina anaporekodi mchango uliowekwa tarehe baada ya mwisho, faini ya kuchelewa iliyosanidiwa inaweza kurekodiwa. Tofauti na hilo, Mwenyekiti au Katibu lazima aendeshe tathmini ya kila mwezi kwa wanachama wanaostahili ambao hawajafikisha kiwango cha ustawi. Tathmini hiyo hufanywa kwa mkono, si moja kwa moja.",
      faqMonthCloseQuestion: "Mapitio ya mwisho wa mwezi yanaonyesha nini?",
      faqMonthCloseAnswer: "Hufupisha michango na marejesho ya pesa taslimu yaliyorekodiwa, salio la mikopo iliyo wazi linalofuatiliwa na mambo ambayo maafisa wanaweza kukagua, kama maombi ya mkopo yanayosubiri au kumbukumbu zinazokosekana. Ni ya kusoma tu; hailinganishi taarifa za benki au M-PESA wala kuhamisha pesa.",
      faqChatQuestion: "Je, kikundi chetu kinaweza kuzungumza ndani ya programu?",
      faqChatAnswer: "Ndiyo. Akaunti hai zinaweza kutumia gumzo la chama ndani ya programu. Husasishwa kupitia mtiririko wa matukio na lina usaidizi wa kura za mara kwa mara na kuunganisha tena. Matangazo ya WhatsApp/SMS na gumzo kwa barua pepe hayajajumuishwa.",
      faqCorrectionQuestion: "Je, tunaweza kusahihisha tarehe ya mchango baada ya kuirekodi?",
      faqCorrectionAnswer: "Mwenyekiti au Mweka Hazina pekee ndiye anayeweza kusahihisha tarehe ya mchango wa pesa taslimu uliothibitishwa, na sababu isiyo tupu inahitajika. Tarehe mpya lazima iwe halali, isiwe ya baadaye, ibaki ndani ya mwezi wa awali na ihifadhi hali ya kulipwa kwa wakati au kuchelewa. Kiasi, mwanachama na sehemu nyingine za muamala hazibadilishwi. Tukio la ukaguzi hurekodi mtendaji, muda, tarehe za zamani na mpya, na sababu; kumbukumbu ya ukaguzi haizuii kubadilishwa.",
      faqMoneyQuestion: "Je, Jirani Chama hupokea, kuthibitisha au kuhamisha pesa zetu?",
      faqMoneyAnswer: "Hapana. Hurekodi pesa taslimu zilizopokelewa au kulipwa nje ya programu. Haina huduma ya kukusanya au kutoa pesa, na ulinganishaji wa malipo ya benki/M-PESA haujawashwa.",
      activeStatus: "Hai",
      inactiveStatus: "Haifanyi kazi",
      pendingActivationStatus: "Inasubiri uanzishaji",
      activatedStatus: "Imeanzishwa",
      expiredStatus: "Muda umeisha",
      revokedStatus: "Imebatilishwa",
      unknownStatus: "Haijulikani",
      loanRequestUnavailable: "Ombi jipya la mkopo haliwezi kutumwa wakati usajili wa kikundi haujalipwa au muda wake umeisha.",
      contactPlanRenewal: "Wasiliana nasi kuhusu mpango au kuongeza muda",
      roleRevocationSecurityException: "Kwa usalama wa akaunti, mwenyekiti bado anaweza kubatilisha jukumu la afisa.",
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

    // New chama registration
    "Register a new chama | Jirani Chama": "Sajili chama kipya | Jirani Chama",
    "GROUP SAVINGS": "AKIBA ZA KIKUNDI",
    "Start a new chama": "Anzisha chama kipya",
    "Register your group and create the chairperson account. You will be signed in when setup is complete.": "Sajili kikundi chako na ufungue akaunti ya mwenyekiti. Utaingia kwenye akaunti baada ya usanidi kukamilika.",
    "This instance is already set up": "Mfumo huu tayari umesanidiwa",
    "To create a separate chama, open this app on a separate instance connected to an empty database. This instance’s existing records will remain unchanged.": "Ili kuunda chama tofauti, fungua programu hii kwenye mfumo mwingine uliounganishwa na hifadhidata tupu. Rekodi zilizopo kwenye mfumo huu hazitabadilika.",
    "Sign in to this instance": "Ingia kwenye mfumo huu",
    "Chama and chairperson details": "Maelezo ya chama na mwenyekiti",
    "All fields are required. Your PIN must have 6 to 12 digits.": "Sehemu zote zinahitajika. PIN yako lazima iwe na tarakimu 6 hadi 12.",
    "Chama name": "Jina la chama",
    "Chairperson full name": "Jina kamili la mwenyekiti",
    "Email address": "Anwani ya barua pepe",
    "Financial rules": "Kanuni za fedha",
    "These defaults can be changed for this chama. They are enforced by the server.": "Mipangilio hii ya awali inaweza kubadilishwa kwa chama hiki. Inatekelezwa na seva.",
    "Monthly contribution due by day": "Tarehe ya mwisho ya mchango wa kila mwezi",
    "Monthly welfare contribution (KES)": "Mchango wa kila mwezi wa ustawi (KES)",
    "Late contribution penalty (KES)": "Faini ya kuchelewa kuchangia (KES)",
    "Monthly loan interest (%)": "Riba ya mkopo ya kila mwezi (%)",
    "Create PIN": "Tengeneza PIN",
    "Register chama": "Sajili chama",
    "Back to home": "Rudi mwanzo",
    "Chama registered": "Chama kimesajiliwa",
    "Your chairperson account is ready. Continue to your chama dashboard.": "Akaunti yako ya mwenyekiti iko tayari. Endelea kwenye dashibodi ya chama chako.",
    "Open dashboard": "Fungua dashibodi",

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
    "Election scheduled.": "Uchaguzi umepangwa.",
    "Runoff scheduled.": "Raundi ya marudio imepangwa.",
    "Your secret vote has been recorded.": "Kura yako ya siri imerekodiwa.",
    "Decision recorded.": "Uamuzi umerekodiwa.",
    "Officer assignment confirmed.": "Uteuzi wa afisa umethibitishwa.",
    "Enter a reason of at least 5 characters.": "Weka sababu yenye angalau herufi 5.",
    "You do not have permission to view the audit log.": "Huna ruhusa ya kuona kumbukumbu za ukaguzi.",
    "The audit log could not load. Try again.": "Kumbukumbu za ukaguzi hazikupakia. Jaribu tena.",
    "Your financial details could not load. Try refreshing the page.": "Maelezo yako ya fedha hayakupakia. Jaribu kupakia ukurasa upya.",
    "Group financial totals could not load. Try refreshing the page.": "Jumla za fedha za kikundi hazikupakia. Jaribu kupakia ukurasa upya.",
    "Contributions": "Michango",
    "Loan repayments": "Marejesho ya mikopo",
    "Your monthly financial trends (KES)": "Mwenendo wa fedha zako kwa mwezi (KES)",
    "Group monthly financial trends (KES)": "Mwenendo wa fedha za kikundi kwa mwezi (KES)",
    "The Chairperson or Secretary schedules candidates and a date. Eligible chama accounts can cast one secret vote on that date only, from midnight to 11:59 p.m. Nairobi time. The highest vote count wins and takes office when voting closes; a tie requires a scheduled runoff.": "Mwenyekiti au Katibu hupanga wagombea na tarehe. Akaunti zinazostahiki hupiga kura moja ya siri katika tarehe hiyo pekee, kuanzia saa sita usiku hadi saa 11:59 jioni kwa saa za Nairobi. Aliye na kura nyingi zaidi hushinda na kuanza kazi kura zinapofungwa; sare huhitaji raundi ya marudio iliyopangwa.",
    "Schedule an election": "Panga uchaguzi",
    "Election date": "Tarehe ya uchaguzi",
    "Schedule election": "Panga uchaguzi",
    "Voting opens": "Upigaji kura utafunguliwa",
    "Voting is available from midnight to 11:59 p.m. Nairobi time on that date.": "Upigaji kura unapatikana kuanzia saa sita usiku hadi saa 11:59 jioni kwa saa za Nairobi katika tarehe hiyo.",
    "Schedule runoff": "Panga raundi ya marudio",
    "Runoff date": "Tarehe ya raundi ya marudio",
    "Scheduled": "Imepangwa",
    "Voting open": "Upigaji kura umefunguliwa",
    "Closed · awaiting verification": "Imefungwa · inasubiri uthibitishaji",
    "Verified · role change scheduled": "Imethibitishwa · mabadiliko ya wadhifa yamepangwa",
    "Tie verified · runoff open": "Sare imethibitishwa · raundi ya marudio imefunguliwa",
    "No winner": "Hakuna mshindi",
    "Tie · runoff date needed": "Sare · tarehe ya raundi ya marudio inahitajika",
    "Role updated": "Wadhifa umesasishwa",
    "Election cancelled": "Uchaguzi umeghairiwa",
    "Proposal declined": "Pendekezo limekataliwa",
    "Ballots become available on the election date.": "Kura zitapatikana siku ya uchaguzi.",
    "Month": "Mwezi",
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
    getInTouchNav: ["Get in touch", "Wasiliana nasi"], contactSectionLabel: ["CONTACT", "WASILIANA"],
    getInTouchTitle: ["Get in touch", "Wasiliana nasi"],
    contactOptionsCopy: ["Choose the route that best fits your needs.", "Chagua njia inayokufaa."],
    memberOrOfficer: ["MEMBER OR OFFICER", "MWANACHAMA AU KIONGOZI"],
    contactYourOfficers: ["Contact your group officers", "Wasiliana na viongozi wa kikundi chako"],
    memberContactCopy: ["Sign in and send a message to your chairperson or secretary in your group chat.", "Ingia na umtumie mwenyekiti au katibu ujumbe kupitia gumzo la kikundi chako."],
    signInToYourGroup: ["Sign in to your group", "Ingia kwenye kikundi chako"],
    newGroupLabel: ["START A NEW GROUP", "ANZISHA KIKUNDI KIPYA"],
    startYourChama: ["Start your chama", "Anzisha chama chako"],
    startChamaCopy: ["Create your group, invite members, and manage shared records in one place.", "Unda kikundi chako, waalike wanachama, na usimamie rekodi pamoja sehemu moja."],
    createChama: ["Create a chama", "Fungua chama"],
    contactDescription: ["Tell us how we can help. Your message goes directly to our team.", "Tuambie jinsi tunavyoweza kukusaidia. Ujumbe wako utatumwa moja kwa moja kwa timu yetu."],
    contactDirectLabel: ["Prefer email?", "Unapendelea barua pepe?"],
    contactDirectCopy: ["You can also email our team directly.", "Unaweza pia kuitumia timu yetu barua pepe moja kwa moja."],
    contactFormTitle: ["Send us a message", "Tutumie ujumbe"],
    contactFormCopy: ["Fill in the form and we’ll get your message to the right person.", "Jaza fomu nasi tutahakikisha ujumbe wako unamfikia mtu anayefaa."],
    contactNameLabel: ["Your name", "Jina lako"],
    contactEmailLabel: ["Email address", "Anwani ya barua pepe"],
    contactSubjectLabel: ["Subject", "Mada"],
    contactMessageLabel: ["Message", "Ujumbe"],
    contactSubmitLabel: ["Send message", "Tuma ujumbe"],
    contactPrivacyNote: ["Your message is sent privately to our team.", "Ujumbe wako utatumwa kwa faragha kwa timu yetu."],
    contactMoreOptions: ["Other ways to get in touch", "Njia nyingine za kuwasiliana nasi"],
    contactMemberRoute: ["Already a member? Sign in", "Tayari ni mwanachama? Ingia"],
    contactCreateRoute: ["Starting a chama? Create one", "Unaanzisha chama? Unda hapa"],
    contactSending: ["Sending…", "Inatuma…"],
    contactSendSuccess: ["Your message has been sent. Thanks for contacting us.", "Ujumbe wako umetumwa. Asante kwa kuwasiliana nasi."],
    contactSendError: ["We couldn’t send your message just now. Please try again or email us directly.", "Hatukuweza kutuma ujumbe wako kwa sasa. Jaribu tena au tutumie barua pepe moja kwa moja."],
    contactUnavailable: ["Email delivery is temporarily unavailable. Please try again later or email us directly.", "Huduma ya barua pepe haipatikani kwa sasa. Jaribu tena baadaye au tutumie barua pepe moja kwa moja."],
    contactRateLimited: ["Too many messages were sent. Please try again later.", "Ujumbe mwingi umetumwa. Tafadhali jaribu tena baadaye."],
    contactInvalid: ["Please review the required fields and try again.", "Kagua sehemu zinazohitajika kisha ujaribu tena."],
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
    receiptReference: ["Receipt reference", "Nambari ya kumbukumbu ya risiti"], cashDateLimit: ["Dates must be real calendar dates and cannot be in the future.", "Tarehe lazima ziwe tarehe halisi za kalenda na haziwezi kuwa za siku zijazo."],
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
    newChamaRegistration: ["New chama registration", "Usajili wa chama kipya"],
    financialViews: ["Financial views", "Mionekano ya fedha"], memberAttendance: ["Member attendance", "Mahudhurio ya wanachama"],
    sectionsLabel: ["Sections", "Sehemu"], signInLabel: ["Sign in to Jirani Chama", "Ingia kwenye Jirani Chama"],
    transactionPages: ["Transaction pages", "Kurasa za miamala"], activationCodeLabel: ["One-time activation code", "Msimbo wa kuwezesha wa matumizi ya mara moja"],
    correctDate: ["Correct date", "Sahihisha tarehe"], correctContributionDate: ["Correct contribution date", "Sahihisha tarehe ya mchango"],
    dateCorrectionRules: ["Only Chairpersons and Treasurers can correct a recorded cash contribution. Provide a non-empty reason. The new date must stay in the original month and preserve whether the contribution was on time or late; the change is recorded in the audit history.", "Mwenyekiti au Mweka Hazina pekee ndiye anayeweza kusahihisha tarehe ya mchango wa pesa taslimu uliorekodiwa. Weka sababu isiyo tupu. Tarehe mpya lazima ibaki ndani ya mwezi wa awali na ihifadhi hali ya kulipwa kwa wakati au kuchelewa; mabadiliko yatarekodiwa kwenye historia ya ukaguzi."],
    correctedDate: ["Corrected date", "Tarehe iliyosahihishwa"], correctionReason: ["Reason for correction", "Sababu ya kusahihisha"], saveCorrection: ["Save correction", "Hifadhi marekebisho"],
    "Contribution date corrected and recorded in the audit log.": ["Contribution date corrected and recorded in the audit log.", "Tarehe ya mchango imesahihishwa na kurekodiwa kwenye kumbukumbu ya ukaguzi."],
    "Enter a real non-future date and a non-empty reason of up to 500 characters.": ["Enter a real non-future date and a non-empty reason of up to 500 characters.", "Weka tarehe halisi isiyo ya baadaye na sababu isiyo tupu yenye hadi herufi 500."],
    "Only confirmed cash contribution dates with a valid original month can be corrected.": ["Only confirmed cash contribution dates with a valid original month can be corrected.", "Tarehe za michango ya pesa taslimu iliyothibitishwa na mwezi halali wa awali pekee ndizo zinaweza kusahihishwa."],
    "The corrected date must differ from the recorded date.": ["The corrected date must differ from the recorded date.", "Tarehe iliyosahihishwa lazima itofautiane na tarehe iliyorekodiwa."],
    "A date correction must remain within the original contribution month.": ["A date correction must remain within the original contribution month.", "Marekebisho ya tarehe lazima yabaki ndani ya mwezi wa awali wa mchango."],
    "A date correction cannot change whether the contribution was on time or late.": ["A date correction cannot change whether the contribution was on time or late.", "Marekebisho ya tarehe hayawezi kubadilisha kama mchango ulilipwa kwa wakati au kwa kuchelewa."],
    "Contribution not found.": ["Contribution not found.", "Mchango haujapatikana."],
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
    landingHeroLead: ["Run contributions,", "Simamia michango,"],
    landingHeroHighlight: ["loan approvals, and records", "idhini za mikopo na kumbukumbu"],
    landingHeroTail: ["in one accountable place.", "katika sehemu moja yenye uwazi na uwajibikaji."],
    landingHeroSubtitle: ["Give your chama a clear shared record of what was contributed, approved, and decided.", "Wape wanachama wa chama chako kumbukumbu ya pamoja ya michango, maamuzi ya mikopo na maamuzi mengine."],
    landingNavMenu: ["Menu", "Menyu"], landingNavOpen: ["Open landing navigation", "Fungua menyu ya ukurasa wa mwanzo"],
    landingNavClose: ["Close landing navigation", "Funga menyu ya ukurasa wa mwanzo"], landingNavLabel: ["Landing page navigation", "Menyu ya ukurasa wa mwanzo"],
    landingNavFeatures: ["Features", "Vipengele"], landingNavHowItWorks: ["How it works", "Jinsi inavyofanya kazi"],
    landingNavPricing: ["Pricing", "Bei"], landingNavSecurity: ["Security", "Usalama"], landingNavFaq: ["FAQ", "Maswali ya mara kwa mara"],
    landingNavContact: ["Contact", "Wasiliana nasi"],
    groupSavings: ["group savings", "ya kikundi"],
    simulatedInboxTitle: ["Simulated payment inbox (local test only)", "Kikasha cha malipo ya kuigiza (jaribio la ndani pekee)"],
    simulatedInboxCopy: ["Use fake TEST-* values only. This does not connect to M-Pesa or any payment provider. Saving a simulation never changes a balance.", "Tumia thamani bandia zinazoanza na TEST- pekee. Hii haiunganishwi na M-Pesa wala mtoa huduma yeyote wa malipo. Kuhifadhi jaribio hakubadilishi salio."],
    simulatedTransactionId: ["Test transaction ID", "Kitambulisho cha muamala wa jaribio"],
    fakePhoneIdentifier: ["Fake phone identifier", "Kitambulisho bandia cha simu"],
    simulatedAmount: ["Amount (KES)", "Kiasi (KES)"],
    simulatedReference: ["Reference", "Kumbukumbu"],
    simulatedTimestamp: ["Payment timestamp", "Tarehe na saa ya malipo"],
    createSimulation: ["Add unverified test payment", "Ongeza malipo ya jaribio ambayo hayajathibitishwa"],
    receivedAt: ["Received", "Imepokelewa"], rawTestPayload: ["Test payload", "Data ghafi ya jaribio"],
    unverified: ["Unverified", "Haijathibitishwa"],
    noSimulatedPayments: ["No simulated payments yet.", "Bado hakuna malipo ya kuigiza."],
    simulationSaved: ["Simulated payment saved as Unverified; no balance was changed.", "Malipo ya kuigiza yamehifadhiwa bila kuthibitishwa; hakuna salio lililobadilika."],
    simulationDuplicate: ["That simulated transaction ID is already in the inbox.", "Kitambulisho hicho cha muamala wa jaribio tayari kiko kwenye kikasha."],
    simulationIdentifiersOnly: ["Use TEST-prefixed transaction IDs and fake phone identifiers only.", "Tumia vitambulisho vya miamala na simu bandia vinavyoanza na TEST- pekee."],
    simulationInputInvalid: ["Enter a positive amount up to KES 10,000,000, a reference up to 80 characters, and a valid timestamp.", "Weka kiasi chanya kisichozidi KES 10,000,000, kumbukumbu isiyozidi herufi 80 na tarehe na saa halali."]
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
