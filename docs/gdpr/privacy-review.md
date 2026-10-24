# Privacy notice: review hand-over

This list is for the data protection officer (DPO: Moore Czech Republic s.r.o.) and the headmaster. It covers the privacy notice at `/ochrana-osobnich-udaju`. The text lives in `src/ui/copy/privacy.ts`, `privacy-processing.ts` and `privacy-retention.ts`; the numbers it states live in `privacy-facts.ts`.

The page shows every open item as a „K ověření“ mark with the reviewer and a one-line task. The commentary below is deliberately kept off the page, because the page must stay plain Czech for readers from 15 years up (GDPR Art. 12).

## What approval means

The notice is a draft until all three hold. `src/ui/copy/privacy.test.ts` enforces them: an approved notice with open reviews or without a date fails the test.

1. `approved: true` in `src/ui/copy/privacy.ts`.
2. `effectiveFrom` is set (an ISO date), so the page shows „Účinné od“ with it.
3. No `review` flag is left anywhere: not in the summary, not in a section block, not in a facts row.

To clear a flag, confirm or correct the text, then delete the `review` property. The reviewer named on the page is the one who clears it. Approval is a prerequisite for go-live (plan M11).

## Review flags on the page

Each entry gives the section, the flagged text, the reviewer and the note shown on the page, then the commentary.

### Summary („Stručně“)

1. **Bullet 3**, „Údaje jsou na serveru, který spravuje škola. Microsoft používáme k přihlášení a k e-mailům.“ Reviewer: headmaster. Note: „Ověřit umístění serveru.“
   Server location: ADR 0008 says only that the app runs on infrastructure the school controls. Neither the country nor the site is recorded in the repository; school IT confirms both.
2. **Bullet 4**, „Rozpracované a zamítnuté body mažeme na konci školního roku. Schválené body patří do archivu porad.“ Reviewer: DPO. Note: „Ověřit dobu uchování.“ See section `doba` below.
3. **Bullet 5**, „Můžete se zeptat, jaké údaje o vás máme, a požádat o opravu. Obraťte se na školu nebo na pověřence.“ Reviewer: DPO. Note: „Ověřit, jak se žádosti podávají.“ See section `prava`.

### `spravce`, „Kdo vaše údaje zpracovává“

4. **Controller facts**: name „Smíchovská střední škola, příspěvková organizace“, IČO 61386855, address „Preslova 72/25, Smíchov, 150 00 Praha 5“, data box `mgm3z73`, e-mail `reditel@ssps.cz`. Reviewer: DPO. Note: „Ověřit přesný název a adresu správce.“
   The values come from ARES (legal form 331) and the school's „povinné údaje“ page. The school's own „Podmínky GDPR“ page still shows the old name and address („Smíchovská střední průmyslová škola a gymnázium, Preslova 25“), so the two public sources disagree.

### `poverenec`, „Pověřenec pro ochranu osobních údajů“

5. **E-mail row**, `gdpr@moore-czech.cz`. Reviewer: DPO. Note: „Ověřit kontaktní adresu pověřence.“
   The „povinné údaje“ page gives this role address. The „Podmínky GDPR“ page gives a different one (a consultant address next to a named person). Art. 37(7) requires publishing the DPO's contact details, so the DPO decides which address goes on the page. No personal name appears in the notice.

### `ucely`, „Proč údaje zpracováváme“

6. **Legal basis**, „Důvodem je plnění úkolu ve veřejném zájmu, kterým je škola pověřena (čl. 6 odst. 1 písm. e) GDPR). Zpracování proto nestojí na vašem souhlasu ani na oprávněném zájmu.“ Reviewer: DPO. Note: „Ověřit právní odkaz.“
   The page cites only the GDPR. Art. 6(3) requires the basis for a public task to be laid down in Union or Member State law, so a Czech provision should be named. The research suggested these candidates but **could not confirm them; treat all as unverified**:
   - zákon 110/2019 Sb. § 5 písm. b) (processing needed for a task carried out in the public interest, with which the controller is entrusted);
   - školský zákon 561/2004 Sb. §§ 164 and 165 (the head's responsibility for providing education and for the school's organisation and operation).

   The reading that these are the right provisions for the meeting papers is an interpretation, not a confirmed one. The school's „Podmínky GDPR“ cite § 28 odst. 2 (školní matrika), which covers pupil records only and does not fit. The DPO decides the citation. The „oprávněný zájem“ sentence rests on Art. 6(1), last sentence: public authorities cannot use point (f) for their tasks.

### `udaje`, „Jaké údaje zpracováváme“

7. **Technical logs row**, „IP adresa, čas a adresa požadavku, identifikátor požadavku, údaje o prohlížeči“. Reviewer: DPO. Note: „Ověřit rozsah technických záznamů.“
   The Caddy access log keeps the client IP and strips the sign-in query parameters; app logs record actors only as UUIDs.
8. **People named in points**, „Lidé zmínění v bodech se do Autoporady nepřihlašují. Údaje o nich zadávají jiní lidé.“ Reviewer: DPO. Note: „Ověřit informace pro lidi, kteří se nepřihlašují.“
   Art. 14 applies: the app holds data about people who never gave it themselves (participants, organisers, speakers whose statements are quoted, many of them minors; ADR 0008 says the app stores the names and statements of minors). Art. 14 adds the categories of data and the source of the data, which the page gives in „Jaké údaje“ and „Odkud údaje máme“. Whether this page is enough, or the people concerned must be told another way, is for the DPO.
9. **Student lists**, „Seznamy studentů obsahují jen jméno a třídu, žádné důvody.“ Reviewer: DPO. Note: „Ověřit, že seznamy uvolnění z výuky neuvádějí důvody.“
   Art. 9 risk: if a point-4 list („uvolnění z výuky“) can reveal a health reason, that is special-category data. The app stores only name and class, but the DPO should confirm the lists are never used with reasons.

### `prijemci`, „Kdo údaje vidí“

10. **Recipient list** („Microsoft jako zpracovatel školy …“, „IT školy, které spravuje server“, „šifrované zálohy, které jsou mimo server“). Reviewer: DPO. Note: „Ověřit, kde budou uložené zálohy.“
    Backup target: the off-site target is not chosen yet (plan §13, item 7). The backups are age-encrypted, so the target holds only encrypted data.
11. **Porada document**, „Dokument porady dostávají osoby, kterým ho vedení školy předá.“ Reviewer: headmaster. Note: „Ověřit, komu se dokument porady předává.“
    Recipients of the porada document are decided by the school's leadership; the app does not send it.

### `ulozeni`, „Kde jsou údaje uložené“

12. **Server**, „Údaje jsou na serveru, který spravuje škola.“ Reviewer: headmaster. Note: „Ověřit umístění serveru.“ Same point as flag 1: server location.
13. **Transfers**, „Zálohy jsou šifrované a jejich kopie je mimo server. Microsoft zpracovává údaje podle smlouvy se školou.“ Reviewer: DPO. Note: „Ověřit znění o předávání údajů mimo EU.“
    EU Data Boundary and DPF wording. The page deliberately says only that Microsoft acts under the school's contract. Facts found:
    - a tenant with an EU location keeps most Entra data in the EU Data Boundary; for Microsoft 365 the location follows the billing address;
    - there are documented exceptions (for example IP addresses and phone numbers flagged as fraudulent are published globally), plus temporary exceptions on a separate Microsoft page that was not read in full;
    - the school tenant's actual data location is **unverified**;
    - the EU-US Data Privacy Framework was upheld by the General Court on 3 September 2025 (T-553/23 Latombe); an appeal (C-703/25 P) was reported pending in June 2026. Microsoft's current DPF certification is **unverified**.

    The DPO decides whether to name the Data Boundary or the DPF, or to keep the neutral wording.

### `doba`, „Jak dlouho údaje uchováváme“

14. **Whole table**, reviewer DPO, note: „Ověřit dobu uchování záloh, kopií e-mailů, dat úloh na pozadí, účtů a archivních seznamů.“ These are the retention gaps; none has a rule in the code yet:
    - **Backups**: retention is not specified anywhere.
    - **Mailbox copies**: Graph `sendMail` saves to Sent Items by default (`saveToSentItems` defaults to true), so copies would pile up in the `autoporada@ssps.cz` mailbox. The mail adapter (M7) will send `saveToSentItems: false`; the DPO should still confirm no other copy is kept.
    - **Job payloads**: how long pg-boss keeps finished jobs, which hold mail payloads, is not specified.
    - **Users**: no deletion rule exists for the `users` table.
    - **Archived registry entries**: no deletion rule exists for archived student lists.
15. **Archive row**, „Porady, schválené a zveřejněné body, vytvořené dokumenty“: „trvale, jako archiv porad“. Reviewer: DPO. Note: „Ověřit trvalé uchování podle spisového a skartačního plánu.“
    „Trvale“ against the school's spisový a skartační plán and zákon 499/2004 Sb. is **unverified**. The generated documents are insert-only by design.
16. **Blocked requests row**, „bez časového omezení, aby blokace platila“. Reviewer: DPO. Note: „Ověřit dobu uchování zablokovaných žádostí.“
    A block has no end date; the DPO should say whether that is acceptable or a limit is needed.
17. **Technical logs row**, „v záznamech serveru; jejich rozsah omezuje velikost (10 MB, nejvýše 5 souborů na službu), ne čas“. Reviewer: DPO. Note: „Ověřit dobu uchování technických záznamů.“
    The Docker log rotation caps size, not age.

### `cookies`

18. **Microsoft sign-in page**, „Přihlašovací stránka Microsoftu používá vlastní cookies podle smlouvy školy.“ Reviewer: DPO. Note: „Ověřit znění o cookies Microsoftu.“
    The app's own two cookies are technical and need no consent or banner (zákon 127/2005 Sb. § 89 odst. 3; ÚOOÚ practice of 12 June 2024), but the information duty still applies, and the page describes them. Microsoft's cookies are Microsoft's; the page does not describe them.

### `prava`, „Vaše práva“

19. **Request channel**, „Přenositelnost údajů se u nás neuplatní (čl. 20 odst. 3). Škola odpoví do jednoho měsíce. Požádat můžete školu nebo pověřence.“ Reviewer: DPO. Note: „Ověřit, jak se žádosti podávají.“
    In v1 requests are handled by hand through a command-line tool (find and export); there is no form. The DPO should confirm the channel and the one-month answer time (Art. 12(3)).

### `povinnost`, „Musíte údaje poskytnout?“

20. **No legal duty**, „Žádný zákon vám neukládá, abyste Autoporadu používali.“ Reviewer: DPO. Note: „Ověřit informaci o povinnosti poskytnout údaje.“
    Art. 13(2)(e): not a statutory or contractual requirement, as far as the research found. The DPO confirms.
21. **No other way in**, „Bez přihlášení ji ale používat nelze.“ Reviewer: headmaster. Note: „Ověřit, zda lze podklady posílat i jinou cestou.“
    The headmaster decides whether materials may still reach the meeting by another channel (for example e-mail to the headmaster); that has not been decided. The two flags are separate blocks because a block can have only one reviewer.

### `zmeny`, „Změny a účinnost“

22. **Effective date**, „Toto oznámení se může změnit. Aktuální znění najdete vždy na této stránce. …“ Reviewer: DPO. Note: „Stanovit datum účinnosti.“
    Set `effectiveFrom` when approving. The DPO also decides whether the notice should be linked from ssps.cz.

### Access requests and users (M6)

23. **Wait after a rejection**, in the first retention row (rejected requests): „Novou žádost lze podat nejdříve 30 dní po zamítnutí.“ Reviewer: DPO. Note: „Ověřit lhůtu pro novou žádost po zamítnutí.“
    The 30 days come from `ACCESS_COOLDOWN_DAYS` in code; a test compares the page with it. The wait ends at 00:00 Prague time on the 30th day after the decision and is computed from the stored request, so the 1 September purge of rejected requests can end it early. The DPO confirms the length is proportionate.
24. **Reasons**, no flag on the page. The reason of a request is free text, up to 1 000 characters, written by the user. Only the headmaster sees it (queue and user detail), and it is never written to the audit log. A user may type personal data of others or special-category data into it; the form asks only for the purpose. It is deleted with the request on 1 September, unless the request is blocked.
25. **E-mail, job title and department**, no flag on the page. They come from Entra at sign-in and appear in the headmaster's users list, the queue and the user detail. Only users with `users.view` (headmasters who are not students) see them. The „Jaké údaje“ table already names these fields.
26. **Audit of decisions**, no flag on the page. Approving, rejecting, cancelling and blocking a request, and every change of role, type or account status (including manual grants), are audited with the actor and the user concerned, and kept for 3 years like the rest of the log. The audit rows hold no request text.
27. **Manual grant over a blocked request**, no flag on the page. A block stops further requests and leaves the account alone, and it has no end date (item 16). The headmaster can still grant access by hand under step-up, which repairs a mistaken block. The DPO should know that a blocked person can regain access only this way.

## Kept off the page, for the record

- The DPIA and the record of processing are separate documents (plan §4, §11); this list does not replace them.
- Art. 22: nothing is decided automatically. The second-case suggestion, class normalisation and deadline roll-over are automated processing, but a person reviews every point and decides role changes.
- Portability does not apply (Art. 20(3)); nothing rests on consent.
- The supervisory authority is the Úřad pro ochranu osobních údajů; its address and data box on the page were checked against uoou.gov.cz.
