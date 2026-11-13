import { useEffect, useState } from "react";

const HELP_GUIDE_COPY = {
  en: {
    title: "Help & Guide",
    intro: "Use these short guides to complete common tasks. Open a topic below; the options in your dashboard depend on your role.",
    quickTitle: "Start here",
    quickSteps: [
      "Choose English or Kiswahili from the Language menu.",
      "Sign in with your phone number and PIN, use a saved passkey, or activate your invitation first.",
      "Open the dashboard menu and choose the task you need. If you cannot see an option, your role may not have access to it.",
    ],
    topicsTitle: "Browse topics",
    topicsLabel: "Help topics",
    backToTopics: "Back to help topics",
    stepsLabel: "Steps",
    importantLabel: "Important",
    roles: [
      {
        title: "Member",
        items: [
          "Review your own contributions, transactions, loans and attendance.",
          "Apply for a loan, use Group chat and cast a secret ballot when eligible.",
        ],
      },
      {
        title: "Chairperson",
        items: [
          "Manage group setup, loan rules and officer or election decisions.",
          "View the audit log and manage dividend calculations with the Treasurer.",
        ],
      },
      {
        title: "Secretary",
        items: [
          "Invite regular members, record meeting attendance and schedule elections.",
          "Assess monthly penalties when the configured rules apply.",
        ],
      },
      {
        title: "Treasurer",
        items: [
          "Record cash that the group has already received, including loan repayments.",
          "Review financial records, correct eligible contribution dates and manage dividend calculations.",
        ],
      },
    ],
    topics: [
      {
        id: "help-account",
        title: "Register, activate or sign in",
        intro: "Choose the instructions that match your account.",
        steps: [
          "To start a group, choose Register a New Chama on the public home page. Enter the required group and Chairperson details, review the displayed financial rules, and review the Terms and Conditions and Privacy Notice before submitting. The rules shown during setup can be changed for the group. If an operator bootstrap code is requested, get it from the person who manages this installation.",
          "If you were invited, open Member Login, choose Activate invitation, and enter your phone number and one-time activation code. Choose a numeric PIN with 6–12 digits and complete the Terms and Privacy acknowledgements.",
          "Sign in with your Kenyan phone number and PIN, or use Sign in with a passkey if you have already added one. If your phone number is linked to more than one chama, choose the group shown on screen and sign in again.",
          "To reset a forgotten PIN, choose Forgot PIN?, enter the email address saved on your account, and request a reset code. Use the six-digit code to set a new 6–12 digit PIN.",
        ],
        note: "An invitation code is sent by SMS when that service is configured; otherwise the inviting officer must share the displayed code privately. Do not post your activation code or PIN in Group chat.",
      },
      {
        id: "help-navigation",
        title: "Find your way around the dashboard",
        intro: "The dashboard menu is grouped by task. On a phone, open the navigation menu first if the links are not visible.",
        steps: [
          "Dashboard shows your overview. Where available, use You and Group to switch between your own financial view and the group view.",
          "Contributions opens the relevant contribution summary; Ledger lists confirmed transactions and offers a CSV export. Members see only their own transaction records.",
          "Loans opens Request loan and Loan records. Members shows the roster, Attendance shows meeting registers, and Group chat is shared with active members.",
          "Admin contains the officer, election, penalty, audit, dividend, monthly close and invitation tools. Not every Admin option is available to every role.",
        ],
        note: "If a menu item is missing, ask your Chairperson or Secretary whether your role should have access. If the group is in view-only mode, financial records can still be reviewed, but write actions may be unavailable.",
      },
      {
        id: "help-roles",
        title: "What each role can do",
        intro: "Jirani Chama shows actions according to your account role. Some records are private to the member; group-wide views are limited to authorized officers.",
        groups: "roles",
        note: "New officer elections and historical officer-assignment records are shown under Admin. Follow the status and action displayed on the relevant record.",
      },
      {
        id: "help-contributions",
        title: "Check contributions and record cash",
        intro: "Members review records; the Treasurer records money received by the group.",
        steps: [
          "As a member, open Contributions to review your contribution summary. Open Ledger to review confirmed entries or download the transactions and attendance CSV.",
          "As Treasurer, open Record a cash payment only after cash has been received. Choose the member, amount and correct type. For a Loan Repayment, select the approved loan. Enter the date and a note, then review and confirm the cash entry.",
          "For a Monthly Contribution, use a unique receipt reference of 3–40 characters, a real date that is not in the future, and a note of 3–500 characters. The form allows dates up to 30 days back. A missing or previously used receipt reference is rejected.",
          "A contribution is recorded against the group’s configured welfare amount and any applicable penalties; the remaining share is recorded as share capital. Use the configured rules shown in the app rather than estimating a member’s split yourself.",
          "Chairpersons and Treasurers can use Correct date on an eligible contribution in Ledger. Give a reason. The corrected date must stay in the same contribution month and cannot change whether it was late.",
        ],
        note: "Record cash received only. This app keeps the entry and its history; it does not transfer money. Use Fine only to record cash received for a fine. Assessing monthly penalties is a separate officer task under Admin.",
      },
      {
        id: "help-loans",
        title: "Apply for a loan and understand a review",
        intro: "New loan applications are assessed against the rules configured for the chama.",
        steps: [
          "Open Loans, then Request loan. Enter the amount in KES, choose a repayment period, select two different active members as guarantors, and review the cost estimate before submitting.",
          "The app makes an automatic eligibility decision using the configured policy, including membership tenure, recorded contributions, group and member limits, amount tiers and guarantor coverage. Officers can view the record; they do not vote on a new application.",
          "Open Loan to review the decision, its recorded reasons and any projected repayment schedule. If a record shows Request human review, enter at least five characters explaining the relevant facts and submit the request.",
          "A non-conflicted officer can record an independent review after considering the member’s explanation and relevant information. The written finding is stored with the loan record. The interface does not set a fixed response deadline.",
        ],
        note: "An automatic approval or a human-review finding is not a funds transfer and does not change the loan’s status by itself. The app does not disburse cash. Confirm any actual disbursement and final written terms outside the app before treating an installment as due.",
      },
      {
        id: "help-attendance",
        title: "Record or review meeting attendance",
        intro: "Attendance is recorded by meeting date and can be reviewed later.",
        steps: [
          "Open Attendance and choose the meeting date. The Secretary can mark everyone present or absent, adjust individual members, then choose Save register.",
          "If a register already exists for that date, check the confirmation before replacing it. The app keeps an edit history showing who changed the register and what changed.",
          "Other roles can review the register. Members can see their own attendance status; use Meeting history and Open register to review another recorded date.",
        ],
        note: "The Attendance screen is a register for recording or reviewing who attended; use the date picker and the records shown there rather than expecting a separate meeting-invitation calendar.",
      },
      {
        id: "help-elections",
        title: "Schedule an officer election and vote",
        intro: "Use Admin, then Elections. Chairpersons and Secretaries can schedule an election.",
        steps: [
          "Choose the election date and office, then select 2–20 active Members as candidates. Submit Schedule election.",
          "Eligible chama accounts can cast one secret vote on the scheduled date, from midnight to 11:59 p.m. Nairobi time. Open the election card to see its status, candidates and notices.",
          "The highest vote count wins when voting closes. A tie requires a runoff election; use the runoff date field shown on the tied result.",
          "For an older, unscheduled election record, follow the Chairperson actions shown on its card, such as accepting a proposal, closing voting or verifying the result.",
        ],
        note: "Scheduled elections use the date and automatic status shown in the election record. Read that record before taking any extra action.",
      },
      {
        id: "help-financial-tools",
        title: "Use penalties, monthly close, dividends and the audit log",
        intro: "These tools are for authorized officers. Review the selected period and the on-screen summary before submitting a change.",
        steps: [
          "Penalties: in Admin, open Penalties, choose the month and select Assess monthly penalties. The configured deadline, welfare contribution and penalty rules determine who is assessed.",
          "Monthly close: choose a past month to review contribution and repayment totals, open-loan balance, recent entries and exceptions such as unpaid penalties or incomplete receipt references. It is a review screen, not a cash-transfer or close-account action.",
          "Dividends: enter the cycle start and end dates and admin expenses, then choose Calculate. Review the pool and member allocations. Commit dividends to share capital only when the preview is correct; committing records a dividend in share capital, not a cash payout.",
          "Audit log: Chairpersons and Treasurers can filter and page through records. Audit entries are read-only and cannot be edited or deleted.",
        ],
        note: "The Admin tools create or summarize financial records. They do not send money to members or replace checking the group’s actual cash and source documents.",
      },
      {
        id: "help-chat",
        title: "Use Group chat",
        intro: "Group chat is visible to all active members and keeps the latest 100 messages.",
        steps: [
          "Open Group chat, write your message and choose Send. A message can contain up to 500 characters.",
          "Messages cannot be edited or deleted. Check names, dates and amounts before sending, and use the chat to contact your Chairperson or Secretary about group matters.",
        ],
        note: "Do not share your PIN, activation code or other private sign-in information in the group chat.",
      },
      {
        id: "help-profile-security",
        title: "Update your profile, passkeys and device settings",
        intro: "Open the profile icon and choose Edit profile to manage your account settings.",
        steps: [
          "Update your name, phone number or email and choose Save details. A nickname is optional and is shown in Group chat. You can also choose a profile photo.",
          "To add a passkey, sign in with your current PIN within the last 10 minutes, choose Add a passkey, and follow your device’s prompt. Your device chooses its authenticator, such as fingerprint, face unlock or device PIN; the site cannot force a fingerprint.",
          "Use Sign in with a passkey on Member Login after setup. Keep your PIN available as a sign-in fallback. Remove a passkey only when you still have a way to sign in.",
          "In Notifications, choose Enable browser notifications if the browser and site support push. The page needs HTTPS (or localhost), service-worker support, browser permission and push keys configured for the site. If notifications are blocked, allow them in browser settings first.",
          "In Use Jirani Chama as an app, choose the install action. If the browser has no install prompt, use its menu. On iPhone or iPad, use Safari’s Share menu and Add to Home Screen; on Android, use the browser menu and Install app or Add to home screen.",
        ],
        note: "The install option is hidden while the app is installed on the device and can appear again after it is uninstalled. In-app pop-ups remain on even when browser push is unavailable.",
      },
      {
        id: "help-support",
        title: "Get help",
        intro: "For a group decision or a member-record question, message your Chairperson or Secretary in Group chat. For help with the app, contact the support inbox.",
        steps: [
          "Email the support team at the address below, or use the Get in touch form on the public home page. The form sends messages to the same support inbox.",
          "Include the page or task you were trying to use and the on-screen error message. Do not include your PIN, activation code or other sign-in secrets.",
        ],
        note: "If the form is unavailable, use the direct email link below.",
      },
    ],
    faqTitle: "Quick answers",
    faqs: [
      {
        question: "Why can’t I see an option shown in this guide?",
        answer: "The app hides actions your role cannot use. Ask your Chairperson or Secretary if you believe your access should be different.",
      },
      {
        question: "Why was an approved loan not paid to me?",
        answer: "The app records an eligibility decision and projected schedule; it does not transfer or disburse funds. Confirm the actual transfer and written terms with the group outside the app.",
      },
      {
        question: "Why did the install button disappear?",
        answer: "The app hides its install control after it detects an installation. If you uninstall the app, the option may show again.",
      },
      {
        question: "Why can’t I enable browser notifications?",
        answer: "Browser push needs a secure site, browser support, permission and push keys configured on the site. The Notifications panel shows which requirement is not ready.",
      },
    ],
    supportEmailLabel: "Email Jirani Chama support at 09elim3@gmail.com",
  },
  sw: {
    title: "Mwongozo na msaada",
    intro: "Tumia maelekezo haya mafupi kukamilisha kazi za kawaida. Chagua mada hapa chini; chaguo za dashibodi hutegemea jukumu lako.",
    quickTitle: "Anza hapa",
    quickSteps: [
      "Chagua Kiingereza au Kiswahili kwenye menyu ya Lugha.",
      "Ingia kwa kutumia nambari yako ya simu na PIN, tumia passkey iliyohifadhiwa, au kwanza washa mwaliko wako.",
      "Fungua menyu ya dashibodi na uchague kazi unayotaka. Usipoona chaguo fulani, huenda jukumu lako halina ruhusa ya kulitumia.",
    ],
    topicsTitle: "Vinjari mada",
    topicsLabel: "Mada za mwongozo",
    backToTopics: "Rudi kwenye mada za mwongozo",
    stepsLabel: "Hatua",
    importantLabel: "Muhimu",
    roles: [
      {
        title: "Mwanachama",
        items: [
          "Kagua michango, miamala, mikopo na mahudhurio yako binafsi.",
          "Omba mkopo, tumia gumzo la kikundi na piga kura ya siri ukitimiza masharti.",
        ],
      },
      {
        title: "Mwenyekiti",
        items: [
          "Simamia usanidi wa kikundi, masharti ya mikopo na maamuzi kuhusu viongozi au uchaguzi.",
          "Angalia kumbukumbu ya ukaguzi na usimamie hesabu za mgao pamoja na Mweka hazina.",
        ],
      },
      {
        title: "Katibu",
        items: [
          "Alika wanachama wa kawaida, rekodi mahudhurio ya mikutano na panga uchaguzi.",
          "Kadiria faini za kila mwezi masharti yaliyowekwa yanapotumika.",
        ],
      },
      {
        title: "Mweka hazina",
        items: [
          "Rekodi pesa taslimu ambazo kikundi tayari kimepokea, pamoja na marejesho ya mikopo.",
          "Kagua rekodi za fedha, sahihisha tarehe zinazostahili za michango na simamia hesabu za mgao.",
        ],
      },
    ],
    topics: [
      {
        id: "help-account",
        title: "Sajili, washa akaunti au ingia",
        intro: "Chagua maelekezo yanayolingana na akaunti yako.",
        steps: [
          "Kuanzisha kikundi, chagua Sajili Chama Kipya kwenye ukurasa wa mwanzo. Jaza maelezo yanayotakiwa ya kikundi na Mwenyekiti, kagua masharti ya fedha yanayoonyeshwa, na usome Sheria na Masharti pamoja na Ilani ya Faragha kabla ya kutuma. Masharti yanayoonyeshwa wakati wa usanidi yanaweza kubadilishwa kwa kikundi. Ikiombwa msimbo wa usanidi wa msimamizi, uombe kwa mtu anayesimamia usakinishaji huu.",
          "Ukiwa umealikwa, fungua Kuingia kwa Mwanachama, chagua Washa mwaliko, kisha weka nambari yako ya simu na msimbo wa mara moja wa kuwezesha. Chagua PIN ya tarakimu 6–12 na ukamilishe uthibitisho wa Sheria na Faragha.",
          "Ingia kwa nambari yako ya simu ya Kenya na PIN, au tumia Ingia kwa passkey ikiwa tayari umeiongeza. Nambari yako ya simu ikihusishwa na chama zaidi ya kimoja, chagua kikundi kinachoonyeshwa kisha uingie tena.",
          "Ukisahau PIN, chagua Umesahau PIN?, weka anwani ya barua pepe iliyohifadhiwa kwenye akaunti yako, kisha omba msimbo wa kuweka upya. Tumia msimbo wa tarakimu sita kuweka PIN mpya ya tarakimu 6–12.",
        ],
        note: "Msimbo wa mwaliko hutumwa kwa SMS huduma hiyo ikiwa imesanidiwa; vinginevyo afisa aliyekualika anapaswa kukushirikisha msimbo unaoonyeshwa kwa faragha. Usiweke msimbo wa kuwezesha au PIN kwenye gumzo la kikundi.",
      },
      {
        id: "help-navigation",
        title: "Tumia menyu ya dashibodi",
        intro: "Menyu ya dashibodi imepangwa kulingana na kazi. Kwenye simu, fungua menyu ya urambazaji kwanza ikiwa viungo havionekani.",
        steps: [
          "Dashibodi huonyesha muhtasari wako. Panapopatikana, tumia Wewe na Kikundi kubadili kati ya mwonekano wako binafsi wa fedha na mwonekano wa kikundi.",
          "Michango hufungua muhtasari unaokuhusu; Leja huorodhesha miamala iliyothibitishwa na hutoa faili ya CSV. Wanachama huona rekodi zao za miamala pekee.",
          "Mikopo hufungua Omba mkopo na rekodi za Mikopo. Wanachama huonyesha orodha ya wanachama, Mahudhurio huonyesha rejista za mikutano, na Gumzo la kikundi ni la wanachama hai.",
          "Msimamizi ina zana za viongozi, uchaguzi, faini, ukaguzi, mgao, kufunga mwezi na mialiko. Si kila jukumu linaloweza kutumia chaguo zote za Msimamizi.",
        ],
        note: "Chaguo la menyu likikosekana, muulize Mwenyekiti au Katibu kama jukumu lako linapaswa kuwa nalo. Kikundi kikiwa kwenye hali ya kutazama pekee, bado unaweza kukagua rekodi za fedha lakini huenda usiweze kufanya mabadiliko.",
      },
      {
        id: "help-roles",
        title: "Majukumu tofauti yanafanya nini",
        intro: "Jirani Chama huonyesha vitendo kulingana na jukumu la akaunti yako. Baadhi ya rekodi ni za mwanachama binafsi; mwonekano wa kikundi ni wa viongozi walioidhinishwa.",
        groups: "roles",
        note: "Chaguzi mpya za viongozi na rekodi za zamani za uteuzi huonekana kwenye Msimamizi. Fuata hali na kitendo kinachoonyeshwa kwenye rekodi husika.",
      },
      {
        id: "help-contributions",
        title: "Kagua michango na rekodi pesa taslimu",
        intro: "Wanachama hukagua rekodi; Mweka hazina hurekodi pesa zilizopokelewa na kikundi.",
        steps: [
          "Ukiwa mwanachama, fungua Michango kukagua muhtasari wako. Fungua Leja kukagua miamala iliyothibitishwa au kupakua faili ya CSV ya miamala na mahudhurio.",
          "Ukiwa Mweka hazina, fungua Rekodi malipo ya pesa taslimu baada tu ya kupokea pesa. Chagua mwanachama, kiasi na aina sahihi. Kwa Marejesho ya mkopo, chagua mkopo ulioidhinishwa. Weka tarehe na maelezo, kisha kagua na uthibitishe rekodi.",
          "Kwa Mchango wa kila mwezi, tumia kumbukumbu ya risiti ya kipekee yenye herufi 3–40, tarehe halisi isiyo ya baadaye na maelezo yenye herufi 3–500. Fomu inaruhusu kuweka tarehe ya nyuma hadi siku 30. Kumbukumbu ya risiti ikikosekana au ikiwa imetumika, ombi litakataliwa.",
          "Mchango hurekodiwa kulingana na kiasi cha ustawi kilichowekwa na kikundi na faini zozote zinazotumika; salio hurekodiwa kama mtaji wa hisa. Tumia masharti yaliyo kwenye programu badala ya kukadiria mgawanyo wa mwanachama mwenyewe.",
          "Mwenyekiti au Mweka hazina anaweza kutumia Sahihisha tarehe kwenye mchango unaostahili katika Leja. Andika sababu. Tarehe iliyosahihishwa lazima ibaki katika mwezi uleule wa mchango na haiwezi kubadili kama mchango ulikuwa umechelewa.",
        ],
        note: "Rekodi pesa taslimu zilizopokelewa pekee. Programu huhifadhi rekodi na historia yake; haihamishi pesa. Tumia Faini kurekodi pesa za faini zilizopokelewa. Kukadiria faini za kila mwezi ni jukumu tofauti la viongozi kwenye Msimamizi.",
      },
      {
        id: "help-loans",
        title: "Omba mkopo na elewa mapitio",
        intro: "Maombi mapya ya mkopo hukaguliwa kulingana na masharti yaliyowekwa kwa chama.",
        steps: [
          "Fungua Mikopo, kisha Omba mkopo. Weka kiasi kwa KES, chagua muda wa marejesho, chagua wanachama hai wawili tofauti kama wadhamini, kisha kagua makadirio ya gharama kabla ya kutuma.",
          "Programu hufanya uamuzi wa ustahiki kiotomatiki kwa kutumia masharti yaliyowekwa, yakiwemo muda wa uanachama, michango iliyorekodiwa, ukomo wa kikundi na mwanachama, viwango vya kiasi na uwezo wa wadhamini. Viongozi wanaweza kuona rekodi; hawapigi kura kuhusu ombi jipya.",
          "Fungua Mikopo kukagua uamuzi, sababu zilizorekodiwa na ratiba ya makadirio ya marejesho. Rekodi ikionyesha Omba mapitio ya kibinadamu, andika angalau herufi tano kueleza mambo husika kisha tuma ombi.",
          "Kiongozi asiye na mgongano wa maslahi anaweza kurekodi mapitio huru baada ya kuzingatia maelezo ya mwanachama na taarifa husika. Maelezo ya uamuzi huwekwa pamoja na rekodi ya mkopo. Mfumo haujaweka muda maalum wa kujibu.",
        ],
        note: "Idhini ya kiotomatiki au matokeo ya mapitio ya kibinadamu si uhamisho wa pesa na yenyewe hayabadili hali ya mkopo. Programu haitoi pesa. Thibitisha uhamisho halisi na masharti ya mwisho yaliyoandikwa nje ya programu kabla ya kuhesabu malipo yoyote kuwa yanadaiwa.",
      },
      {
        id: "help-attendance",
        title: "Rekodi au kagua mahudhurio ya mkutano",
        intro: "Mahudhurio hurekodiwa kwa tarehe ya mkutano na yanaweza kukaguliwa baadaye.",
        steps: [
          "Fungua Mahudhurio na uchague tarehe ya mkutano. Katibu anaweza kuweka wote kuwa wamehudhuria au hawakuhudhuria, kurekebisha wanachama mmoja mmoja, kisha kuchagua Hifadhi rejista.",
          "Ikiwa rejista ya tarehe hiyo tayari ipo, kagua uthibitisho kabla ya kuibadilisha. Programu huhifadhi historia inayoonyesha aliyeibadilisha na mabadiliko yaliyofanywa.",
          "Majukumu mengine yanaweza kukagua rejista. Mwanachama huona hali yake ya mahudhurio; tumia Historia ya mikutano na Fungua rejista kukagua tarehe nyingine iliyorekodiwa.",
        ],
        note: "Ukurasa wa Mahudhurio ni rejista ya kurekodi au kukagua waliohudhuria; tumia kichagua tarehe na rekodi zinazoonyeshwa badala ya kutarajia kalenda tofauti ya mialiko ya mikutano.",
      },
      {
        id: "help-elections",
        title: "Panga uchaguzi wa kiongozi na upige kura",
        intro: "Fungua Msimamizi, kisha Uchaguzi. Wenyeviti na Makatibu wanaweza kupanga uchaguzi.",
        steps: [
          "Chagua tarehe ya uchaguzi na wadhifa, kisha teua Wanachama hai 2–20 kama wagombea. Tuma kwa kuchagua Panga uchaguzi.",
          "Akaunti za chama zinazostahili zinaweza kupiga kura moja ya siri katika tarehe iliyopangwa, kuanzia saa sita usiku hadi saa 11:59 jioni kwa saa za Nairobi. Fungua kadi ya uchaguzi kuona hali, wagombea na matangazo.",
          "Mgombea mwenye kura nyingi zaidi hushinda kura zinapofungwa. Matokeo yakilingana, lazima panga duru nyingine ya uchaguzi; tumia sehemu ya tarehe ya duru nyingine inayoonyeshwa.",
          "Kwa rekodi ya zamani ya uchaguzi ambayo haikupangwa kwa tarehe, fuata vitendo vya Mwenyekiti vinavyoonyeshwa kwenye kadi, kama kukubali pendekezo, kufunga upigaji kura au kuthibitisha matokeo.",
        ],
        note: "Uchaguzi uliopangwa hutumia tarehe na hali ya kiotomatiki inayoonyeshwa kwenye rekodi. Kagua rekodi hiyo kabla ya kufanya kitendo kingine.",
      },
      {
        id: "help-financial-tools",
        title: "Tumia faini, kufunga mwezi, mgao na kumbukumbu ya ukaguzi",
        intro: "Zana hizi ni za viongozi walioidhinishwa. Kagua kipindi kilichochaguliwa na muhtasari unaoonyeshwa kabla ya kutuma mabadiliko.",
        steps: [
          "Faini: kwenye Msimamizi, fungua Faini, chagua mwezi na ubonyeze Tathmini faini za kila mwezi. Tarehe ya mwisho, mchango wa ustawi na masharti ya faini yaliyowekwa huamua watakaotozwa.",
          "Kufunga mwezi: chagua mwezi uliopita kukagua jumla za michango na marejesho, salio la mikopo iliyo wazi, rekodi za hivi karibuni na hitilafu kama faini zisizolipwa au kumbukumbu za risiti zilizokosekana. Huu ni ukurasa wa ukaguzi, si kitendo cha kuhamisha pesa au kufunga akaunti.",
          "Mgao: weka tarehe za mwanzo na mwisho wa kipindi pamoja na gharama za utawala, kisha chagua Kokotoa. Kagua mfuko na mgao wa wanachama. Chagua Weka mgao kwenye mtaji wa hisa tu ikiwa makadirio ni sahihi; kitendo hiki hurekodi mgao kwenye mtaji wa hisa, si malipo ya pesa taslimu.",
          "Kumbukumbu ya ukaguzi: Mwenyekiti na Mweka hazina wanaweza kuchuja na kupitia kurasa za rekodi. Rekodi za ukaguzi ni za kusoma pekee na haziwezi kuhaririwa au kufutwa.",
        ],
        note: "Zana za Msimamizi huunda au kufupisha rekodi za fedha. Hazitumi pesa kwa wanachama wala kuchukua nafasi ya kukagua pesa halisi za kikundi na nyaraka chanzo.",
      },
      {
        id: "help-chat",
        title: "Tumia gumzo la kikundi",
        intro: "Gumzo la kikundi huonekana kwa wanachama wote hai na huhifadhi ujumbe 100 wa hivi karibuni.",
        steps: [
          "Fungua Gumzo la kikundi, andika ujumbe kisha uchague Tuma. Ujumbe unaweza kuwa na herufi zisizozidi 500.",
          "Ujumbe hauwezi kuhaririwa au kufutwa. Kagua majina, tarehe na kiasi kabla ya kutuma; tumia gumzo kuwasiliana na Mwenyekiti au Katibu kuhusu mambo ya kikundi.",
        ],
        note: "Usishiriki PIN, msimbo wa kuwezesha au taarifa nyingine za siri za kuingia kwenye gumzo la kikundi.",
      },
      {
        id: "help-profile-security",
        title: "Sasisha wasifu, passkey na mipangilio ya kifaa",
        intro: "Fungua ikoni ya wasifu kisha uchague Hariri wasifu ili kusimamia mipangilio ya akaunti.",
        steps: [
          "Sasisha jina, nambari ya simu au barua pepe kisha uchague Hifadhi maelezo. Jina la utani ni la hiari na huonekana kwenye Gumzo la kikundi. Unaweza pia kuchagua picha ya wasifu.",
          "Kuongeza passkey, ingia kwa PIN yako ya sasa ndani ya dakika 10 zilizopita, chagua Ongeza passkey, kisha fuata ombi la kifaa chako. Kifaa chako huchagua njia ya uthibitishaji, kama alama ya kidole, utambuzi wa uso au PIN ya kifaa; tovuti haiwezi kulazimisha utumie alama ya kidole.",
          "Baada ya usanidi, chagua Ingia kwa passkey kwenye Kuingia kwa Mwanachama. Hifadhi PIN yako kama njia mbadala ya kuingia. Ondoa passkey tu ikiwa bado una njia nyingine ya kuingia.",
          "Kwenye Arifa, chagua Washa arifa za kivinjari ikiwa kivinjari na tovuti vinaunga mkono huduma ya push. Ukurasa unahitaji HTTPS (au localhost), huduma ya service worker, ruhusa ya kivinjari na funguo za push zilizosetwa kwa tovuti. Arifa zikizuiwa, ziruhusu kwanza kwenye mipangilio ya kivinjari.",
          "Kwenye Tumia Jirani Chama kama programu, chagua kitendo cha kusakinisha. Ikiwa kivinjari hakionyeshi kitufe cha kusakinisha, tumia menyu yake. Kwenye iPhone au iPad, tumia menyu ya Share ya Safari kisha Add to Home Screen; kwenye Android, tumia menyu ya kivinjari kisha Install app au Add to home screen.",
        ],
        note: "Chaguo la kusakinisha hufichwa programu inapotambua kuwa imesakinishwa kwenye kifaa na linaweza kuonekana tena baada ya kuiondoa. Dirisha ibukizi za ndani ya programu huendelea hata kama arifa za push za kivinjari hazipatikani.",
      },
      {
        id: "help-support",
        title: "Pata msaada",
        intro: "Kwa swali la uamuzi wa kikundi au rekodi ya mwanachama, mtumie Mwenyekiti au Katibu ujumbe kwenye Gumzo la kikundi. Kwa msaada wa programu, wasiliana na timu ya usaidizi.",
        steps: [
          "Tuma barua pepe kwa timu ya usaidizi kupitia anwani hapa chini, au tumia fomu ya Wasiliana nasi kwenye ukurasa wa mwanzo wa umma. Ujumbe wa fomu huenda kwenye kikasha hicho hicho cha usaidizi.",
          "Eleza ukurasa au kazi uliyokuwa ukitumia na ujumbe wa hitilafu unaoonekana. Usiweke PIN, msimbo wa kuwezesha au siri nyingine za kuingia.",
        ],
        note: "Fomu isipopatikana, tumia kiungo cha barua pepe hapa chini.",
      },
    ],
    faqTitle: "Majibu ya haraka",
    faqs: [
      {
        question: "Kwa nini sioni chaguo lililo kwenye mwongozo huu?",
        answer: "Programu huficha vitendo ambavyo jukumu lako haliwezi kutumia. Muulize Mwenyekiti au Katibu ikiwa unaamini unapaswa kuwa na ruhusa hiyo.",
      },
      {
        question: "Kwa nini mkopo ulioidhinishwa haukulipwa kwangu?",
        answer: "Programu hurekodi uamuzi wa ustahiki na ratiba ya makadirio; haihamishi wala haitoi pesa. Thibitisha uhamisho halisi na masharti yaliyoandikwa na kikundi nje ya programu.",
      },
      {
        question: "Kwa nini kitufe cha kusakinisha kimetoweka?",
        answer: "Programu huficha kitufe chake cha kusakinisha baada ya kutambua kuwa imesakinishwa. Ukiiondoa programu, chaguo hilo linaweza kuonekana tena.",
      },
      {
        question: "Kwa nini siwezi kuwasha arifa za kivinjari?",
        answer: "Arifa za push za kivinjari zinahitaji tovuti salama, usaidizi wa kivinjari, ruhusa na funguo za push zilizosanidiwa kwenye tovuti. Ukurasa wa Arifa huonyesha sharti ambalo halijatimizwa.",
      },
    ],
    supportEmailLabel: "Tuma barua pepe kwa usaidizi wa Jirani Chama kupitia 09elim3@gmail.com",
  },
};

function GuideTopic({ topic, copy, roles }) {
  return (
    <section className="help-guide__topic" id={topic.id} aria-labelledby={`${topic.id}-heading`}>
      <h3 id={`${topic.id}-heading`}>{topic.title}</h3>
      <p className="help-guide__intro">{topic.intro}</p>
      {topic.steps?.length > 0 && (
        <>
          <h4 className="help-guide__steps-heading">{copy.stepsLabel}</h4>
          <ol className="help-guide__steps">
            {topic.steps.map((step, index) => <li key={`${topic.id}-step-${index}`}>{step}</li>)}
          </ol>
        </>
      )}
      {topic.groups === "roles" && (
        <div className="help-guide__role-grid">
          {roles.map(role => (
            <article className="help-guide__role" key={role.title}>
              <h4>{role.title}</h4>
              <ul>
                {role.items.map((item, index) => <li key={`${role.title}-${index}`}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      )}
      {topic.note && <p className="help-guide__note"><strong>{copy.importantLabel}:</strong> {topic.note}</p>}
      <a className="help-guide__back" href="#help-topics">{copy.backToTopics}</a>
    </section>
  );
}

export default function HelpGuide() {
  const [language, setLanguage] = useState(() => window.jiraniI18n?.getLanguage?.() === "sw" ? "sw" : "en");

  useEffect(() => {
    const updateLanguage = event => {
      const nextLanguage = event?.detail?.language || window.jiraniI18n?.getLanguage?.();
      setLanguage(nextLanguage === "sw" ? "sw" : "en");
    };
    window.addEventListener("languagechange", updateLanguage);
    return () => window.removeEventListener("languagechange", updateLanguage);
  }, []);

  const copy = HELP_GUIDE_COPY[language];
  const roles = copy.roles;

  return (
    <div className="help-guide" lang={language}>
      <header className="panel-heading help-guide__header">
        <div>
          <h2 id="help-guide-title">{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>
      </header>
      <div className="help-guide__body">
        <section className="help-guide__start" aria-labelledby="help-guide-start-title">
          <h3 id="help-guide-start-title">{copy.quickTitle}</h3>
          <ol>
            {copy.quickSteps.map((step, index) => <li key={`start-${index}`}>{step}</li>)}
          </ol>
        </section>
        <section className="help-guide__topic-index" aria-labelledby="help-guide-topics-title">
          <h3 id="help-guide-topics-title">{copy.topicsTitle}</h3>
          <nav id="help-topics" aria-label={copy.topicsLabel}>
            <ol className="help-guide__topic-list">
              {copy.topics.map(topic => <li key={topic.id}><a href={`#${topic.id}`}>{topic.title}</a></li>)}
            </ol>
          </nav>
        </section>
        <div className="help-guide__sections">
          {copy.topics.map(topic => <GuideTopic key={topic.id} topic={topic} copy={copy} roles={roles} />)}
        </div>
        <section className="help-guide__faq" aria-labelledby="help-guide-faq-title">
          <h3 id="help-guide-faq-title">{copy.faqTitle}</h3>
          <div className="help-guide__faq-list">
            {copy.faqs.map((item, index) => (
              <details key={`faq-${index}`}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <p className="help-guide__support-email">
          <a href="mailto:09elim3@gmail.com">{copy.supportEmailLabel}</a>
        </p>
      </div>
    </div>
  );
}
