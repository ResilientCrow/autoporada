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
   The Caddy access log keeps the client IP and strips the sign-in query parameters, the users-list search text (`hledat`) and the Referer header; app logs record actors only as UUIDs.
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

14. **Whole table**, reviewer DPO, note: „Ověřit dobu uchování záloh, účtů a archivních seznamů a ověřit, že jinde nezůstává kopie e-mailu.“ These are the retention gaps still open; none has a rule in the code yet:
    - **Backups**: retention is not specified anywhere. Backups include the mail ledger (item 14b; ids only), so a ledger row lives on in the backups for their retention.
    - **Mailbox copies**: Graph `sendMail` saves to Sent Items by default (`saveToSentItems` defaults to true), so copies would pile up in the `autoporada@ssps.cz` mailbox. The Graph adapter sends `saveToSentItems: false` (`src/infra/mail/graph.ts`, tested against the fake Graph); the DPO should still confirm no other copy is kept. A copy of each mail stays in the recipient's own mailbox, as with any e-mail. Bounces (NDRs), which quote the full text, collect in the `autoporada@ssps.cz` inbox with no retention rule; docs/ENTRA-SETUP.md §3 recommends an Exchange retention policy on that inbox and naming who reads it.
    - **Job payloads**: resolved in code. A payload holds ids only, and pg-boss deletes finished jobs after 2 days, unrun ones after 14 days and failed ones (the `dead` queue) after 90 days (`src/infra/jobs/queues.ts`; `test/arch/privacy-facts.test.ts` ties the notice to these numbers). See item 14a.
    - **Users**: no deletion rule exists for the `users` table.
    - **Archived registry entries**: no deletion rule exists for archived student lists.
14a. **Background jobs row**, „Úlohy na pozadí (jen identifikátory)“: „dokončené 2 dny, nespuštěné 14 dní, neúspěšné 90 dní“. Reviewer: DPO. Note: „Ověřit dobu uchování úloh na pozadí.“
    The numbers are the queue settings of `mail.send` and `dead`. A job carries a template name and two ids, never an address; the address is read from the database when the mail is sent.
14b. **Mail ledger row**, „Záznam o odeslaných e-mailech“: „91 dní“. Reviewer: DPO. Note: „Ověřit dobu uchování záznamu o odeslaných e-mailech.“
    The ledger (`mail_ledger`, ADR 0016) records each mail the worker sent or skipped: the template name, the recipient's and the subject's ids, a state, a short code, counts of attempts and of sends with an unknown outcome, the id of the queue job that last claimed it (a pg-boss job id, not personal data) and Microsoft's request id; never an address, subject line or text. `mail.prune` deletes a row 91 days after it settled (`MAIL_LEDGER_RETENTION_DAYS` in `src/domain/retention`; `test/arch/privacy-facts.test.ts` ties the notice to it), one day more than a failed job is kept, so replaying a failed job never mails twice. Only the worker may read or write it; the web has no grant. Deleting a user deletes their rows.
    - It outlives the 1 September purge of decided access requests: for up to 91 days a row still names a request id whose request is gone.
    - Backups include it (ids only), so it lives on in the backups for their retention (item 14).
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
25. **E-mail, job title and department**, no flag on the page. They come from Entra at sign-in and appear in the headmaster's users list, the queue and the user detail. Only users with `users.view` (headmasters who are not students) see them. The „Jaké údaje“ table already names these fields. What the headmaster searches for in the list (a name or an e-mail) is kept out of the server logs.
26. **Audit of decisions**, no flag on the page. Approving, rejecting, cancelling and blocking a request, and every change of role, type or account status (including manual grants), are audited with the actor and the user concerned, and kept for 3 years like the rest of the log. The audit rows hold no request text.
27. **Manual grant over a blocked request**, no flag on the page. A block stops further requests and leaves the account alone, and it has no end date (item 16). The headmaster can still grant access by hand under step-up, which repairs a mistaken block. The DPO should know that a blocked person can regain access only this way.

### Points, review and the people search (M8a)

28. **Who reads a returned point**, in „Kdo údaje vidí“: „Vrácený bod vidí kontroloři a ředitel dál, i když ho autor znovu upravuje a průběžně ukládá, a vidí ho i po zrušení bodu.“ Reviewer: DPO. Note: „Ověřit, že kontroloři a ředitel smějí číst vrácený bod, který autor dál upravuje.“
    **Open, for the user and the DPO** (security review S1). A reviewer sees a colleague's point only when it was handed in once and is not now a draft (`own-or-submitted`, design SSU-5, ADR 0018 and 0026). A returned point keeps `submitted_at` and stays visible to every reviewer and the headmaster (ADR 0026 item 3). The author edits a returned point with autosave, so a rewrite is readable by reviewers as it is saved, and stays readable if the author then withdraws the point. Two changes would close it: a save in the returned state clears `submitted_at` (an ADR superseding ADR 0026 item 3), or reviewers see the last handed-in text and not the working copy. Both change the approved design; **neither is built**. The notice states the current behaviour.
29. **Retract and withdraw**, in the same section: „Když autor odeslání stáhne, je to zase jen jeho koncept.“ No flag. **Decided in round A** (ADR 0026, 1c2da2c): „Stáhnout“ clears `submitted_at`, so a draft rewritten after a retract and then withdrawn is the author's alone again, and a reviewer's request for it is not found. A point withdrawn after a return keeps `submitted_at` and stays visible to reviewers (item 28). Before the fix the post-retract edits were visible to reviewers.
30. **Erasing a user who has points**, no flag on the page. **Open** (round A F8, not now). `points.author_id` and `point_events.actor_id` are plain foreign keys to `users`, so erasing a user who wrote or decided a point is refused by the database; the fakes mirror it by constraint name (f350ad4). The data-subject-request CLI (M11) has to decide between deleting or anonymising the points, or keeping the user row; until then an erasure request for such a user needs a manual decision. Nothing in the notice promises more than „někdy to nejde“ (section `prava`).
31. **Previous wording of an edited field (D13)**, in „Jaké údaje“: „Původní znění“. Reviewer: DPO. Note: „Ověřit, že původní znění upravených polí smí zůstat u bodu.“
    A reviewer's edit keeps the previous values of the changed fields in `point_events.before`, so the author and the reviewers see them as „Původní znění“ in the timeline (plain text per field). They are purged with the point (the `point_events` rows cascade from `points`; the app role cannot delete or update an event row). The audit log holds only the names of the changed fields; `test/arch/audit-meta.test.ts` fails on a meta key named `title`, `note`, `text`, `quote`, `name`, `body` or `before`. The text people wrote can include names of minors.
32. **Approved akce for everyone (D4)**, not on the page until M8b builds akce. Then „Kdo údaje vidí“ gains „Schválené akce vidí všichni přihlášení, i studenti, a to i se jmény osob, které akci zajišťují.“ Reviewer: DPO. Note: „Ověřit, že studenti smějí vidět jména zodpovědných osob u schválených akcí.“
    Akce arrive with M8b (future items); the policy already lets every active user view an approved akce (`policy.ts`). The form will ask for staff only („Uveďte vyučující, kteří akci zajišťují.“). If the DPO refuses, D4 (c) shows students the akce without the names and needs a separate view type; D4 (b) hides approved akce from students and is a policy change.
33. **The school directory search**, in „Odkud údaje máme“, no flag. With `DIRECTORY` off (the only production mode until the Graph adapter of M8b) nothing leaves the server and people are added by hand. When it is on, the browser sends only the typed text (at least 3 and at most 64 characters, `DIRECTORY_LIMITS.minQuery` and `.query`) to the web server, and the server asks the directory; the answer holds at most 10 people and only given name, family name, display name and the directory id, never an e-mail address or a class. Logs carry a code, never the query (the Graph adapter of M8b adds the status class). `test/arch/privacy-facts.test.ts` ties the 3 and the 10 to `DIRECTORY_LIMITS`. Whether Microsoft Graph accepts the search for the permission the tenant grants is a real-tenant question (a SMOKE-TEST step with M8b, row 65).
34. **The people memory** („Dříve použité osoby“), in „Jaké údaje“, no flag. The people offered again are read from the author's own last points (30 points updated within 400 days: `RECENT_POINTS` and `RECENT_DAYS` in `src/application/use-cases/people/recent.ts`) when the editor opens; nothing is shared between authors, no table holds them, and a typed or pasted person is remembered only in the author's points. They disappear with those points. A reviewer's edit changes the point itself, so the author's memory offers the corrected person from then on, whatever the point's state.
35. **Notes, mails and logs**, no flag. A reviewer's note to the author lives only in the `point_events` row (never in the audit). Decision mails carry ids only: constant subject, a link to `/body`, no title and no note; the worker reads `points` and `point_events` through column grants (migration 0017). Nobody is mailed about a decision they made on their own point. Logs and audit meta carry codes, never text people wrote (ADR 0015, 0016).

## Kept off the page, for the record

- The DPIA and the record of processing are separate documents (plan §4, §11); this list does not replace them.
- Art. 22: nothing is decided automatically. The second-case suggestion, class normalisation and deadline roll-over are automated processing, but a person reviews every point and decides role changes.
- Portability does not apply (Art. 20(3)); nothing rests on consent.
- The supervisory authority is the Úřad pro ochranu osobních údajů; its address and data box on the page were checked against uoou.gov.cz.
