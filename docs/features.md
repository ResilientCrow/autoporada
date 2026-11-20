# Features

This list is the scope of v1. A feature that is not listed here is not built
in v1 unless the [plan of record](plan.md) changes first. What v1 planned and
has not built yet is under „Not built yet“.

## v1

### Access

- Sign-in with the school Microsoft 365 account (single-tenant Entra ID, OIDC).
  The app stores no passwords.
- Allow-list with access requests. A user who is not approved sees „Zatím tu
  nemáte přístup“ with a reason field and „Odeslat žádost“, and the headmaster
  decides each request („Schválit“, „Zamítnout, znovu může za 30 dní“,
  „Zablokovat další žádosti“). Approving also picks the person's „Zařazení“
  (tier, ADR 0072), which is required. The requester can withdraw it („Zrušit žádost“).
- The requester gets an e-mail when the request is approved, rejected or
  blocked, and a user gets one when access is granted by hand.
- After a rejection the person can ask again 30 days later. A blocked request
  is final, but the headmaster can still grant access by hand.
- Roles: submitter, reviewer, headmaster, and `pending` for a new account. The
  UI calls them „Píše zprávy“, „Vedení“ (ADR 0052), „Ředitel“ and „Bez
  přístupu“. Besides the role, every user has a „Zařazení“ (tier): Ředitel,
  Vedení, Učitel, Zaměstnanec, Student or Absolvent. A tier grants no rights,
  but a student or an absolvent may only be a submitter (or have no access).
  Functions (below) grant none either.
- The headmaster finds people in „Lidé“ by name or e-mail. People who have
  access but no tier yet (accounts that existed before ADR 0072) are listed
  first under „Bez zařazení“. The headmaster sets a person's „Zařazení“ there,
  and it cannot go back to empty. A headmaster cannot change their own role or
  account status; a sole headmaster first promotes a deputy, but may set their
  own tier to a staff tier (never student or absolvent).
- „Funkce“ of a person (the headmaster sets them in „Lidé“, up to five): a kind
  (Statutární zástupce, Zástupce, Vedoucí, Člen) and a typed complement („pro
  pedagogickou činnost“, „PR oddělení“; it is never declined). The complement
  field suggests complements already used for other people. The highest function
  prints before the person's name in documents, in the order of the kinds above,
  and before the salutation („členka PR oddělení paní Jana Nováková“, ADR 0073).
- Re-authentication (step-up, valid 10 minutes, „Ověřit přihlášením“) for
  changes to users' roles, types and account status, and for „Nový školní rok“.
- „Odhlásit všude“, which revokes all of a user's sessions.
- Salutation (ADR 0072): the first time a person opens Arch they are asked
  „Jak Vás máme oslovovat v dokumentech?“, with nothing preselected and no way
  past it. Employees (every tier but student and absolvent) choose pan or paní,
  students and absolventi pan or slečna. The question comes back if a tier
  change makes the saved answer invalid. On „Účet“ the person can change their
  salutation and write their degrees before and after the name. Only the person
  sets these; they are never guessed from the name or read from Entra.

### Submitting

- Everything is in Arch (`/`, hash routes; ADR 0065). The home screen is a set
  of tiles; „Čeká na Vás“ lists what the user owes (reports of ended akce, with
  „Napsat zprávu“, „Pokračovat“, „Opravit“), „Přehled“ lists the user's own
  items, and „Akce školy“ the approved akce and jednání of everyone.
- Reports for INFORMACE Z PROVOZU ŠKOLY, written in a wizard („O čem je
  zpráva“ when there is no akce, „Kdo to organizoval“, „Jak to dopadlo“,
  „Kdo se vyjádřil“, „Co řekl“, „Kontrola“):
  - the opening sentence is pre-written from the fields; there are no report
    types: it reads its grammar from the title and an unknown gender prints
    „akce s názvem …“ (ADR 0067, 0068), and every report starts with the same
    rows (Organizátoři, Účastníci);
  - the Účastníci row names its people under one label, „slečny a pánové“,
    „slečny“ or „pánové“, with no salutation each; nothing is preselected,
    „slečny a pánové“ needs two people, and a report has no „bez oslovení“
    (ADR 0071, 0074);
  - the place is typed as it is named („místnost S205“, „Národní muzeum“)
    and the opening reads it into the locative („v místnosti S205“); a place
    it cannot read gets „v prostorách …“ or „na adrese …“ (ADR 0069);
  - to hand in: at least one person across the lists and at least one
    vyjádření (the wizard asks for the first one from an organiser);
  - a live document preview.
- People: the picker offers the author's own people from earlier reports (with
  their salutation, class and genitive form) and the app's own users with
  access (the picker labels them „ze školního adresáře“). Picking a user copies
  their address card into the row: salutation, the function noun and its
  complement, and degrees („zástupkyně pro pedagogickou činnost paní Mgr. Jana
  Nováková“: a function and an absolvent („absolvent pan …“) go before the
  salutation, a teacher's „profesor“ and the ředitel after it: „pan profesor …“). The row is a copy, not a link, and „Bez funkce“ drops the copied
  head. Staff who write points get everyone's card; a student gets only their
  own. The genitive is prefilled with the head in the 2nd case. It does not search
  the school's Microsoft directory: that route has no caller in Arch (ADR
  0065 item 7). A list of people can be pasted, with the class in brackets
  („Tereza Malá (3.B)“). Class codes are saved in the school's form („1. a“
  becomes „1.A“). „Doplnit oslovení podle jmen“ guesses salutations for typed
  people to check; a user's own salutation is never guessed.
- Genitive suggestion with an indicator when it was only guessed. The author
  can correct it.
- Future items (jednání / akce). They are placed into points 1 and 2 and the
  last PROVOZ point by date. An approved akce is visible to every signed-in
  user, students included, with its free-text Organizátor, Účastníci and Poznámka
  as typed (ADR 0060). Organizátor first asks „Organizuje“ or „Koordinuje“, then
  the names (the step also suggests the app's users, copied as above); the line prints „organizuje …“ / „koordinuje …“, or „organizují …“ /
  „koordinují …“ when the names hold a comma (ADR 0063), except a comma before
  a title after a name: „Mgr. Jan Novák, Ph.D.“ is one person. Under Účastníci of an akce
  the author picks one address for the whole group: „slečny a pánové“, „slečny“,
  „pánové“ or „bez oslovení“, nothing preselected; the line prints „zúčastní se
  slečny a pánové: …“ (one name: „slečna“, „pan“), „slečny a pánové“ needs several
  names, and a jednání has no address (ADR 0071). Akce and jednání share one wizard (Název, Kdy, Kde, Kdo,
  Poznámka, then a check); only Název and the day are required, and the day
  cannot be in the past. The place field waits for the areál (Smíchov,
  Radlice, Na Vidouli, Jinde). The printed line is date, time,
  areál, místo, název, poznámka, organizátor, účastníci, joined by commas, with
  empty pieces left out; multi-day items print „neděle 3. května až čtvrtek
  14. května 2026“ and no time. Within a list: by start day, multi-day items
  first, then timed, then untimed, then by title. An approved akce is
  changed only by „Změnit“ and „Uložit změny“, which sends it for review again
  (the headmaster's items need no review). After the
  event, the author is asked to write the report by e-mail and gets a draft
  prefilled from the akce (title, dates, areál and místo; not the organizers). Every approved akce owes a report; it cannot be
  declined (ADR 0048). The author deletes a draft or returned item that was
  never approved from its page („Smazat akci“, „Smazat jednání“) after a
  confirmation (ADR 0057). The headmaster can copy an item to another day
  („Stejné na jiný den“).
- Proposals for HOSPODAŘENÍ items and for extra POKYNY points („Návrh do
  pokynů“), by vedení only (reviewers and the headmaster, never a student;
  ADR 0052).
- The headmaster's items (akce, jednání, reports) go straight into the porada:
  the final button reads „Zařadit do porady“ instead of „Odeslat vedení“, with
  no review. Anyone else's reads „Odeslat vedení“.
- Everyone without an akce can still write a report: „Napsat zprávu“ starts
  one on an event nobody registered.
- Autosave with conflict detection and a status track on a report („Napsáno“,
  „U vedení“, „Schváleno“, „V poradě …“). While a report waits for review the
  author can take it back („Vzít zpět a upravit“) or delete it („Smazat
  zprávu“). A returned report opens in „Oprava“ with only the parts the
  reviewer named. A late hand-in goes to the next meeting whose deadline is
  still ahead, and the editor says which one.
- Caps per author (`domain/report/limits.ts`): at most 20
  reports waiting for review (`PENDING_CAP`), and 50 jednání/akce as drafts and
  50 waiting for review (`FUTURE_CAP`). Returned items count for neither.
- A report on an event that ends after its porada's deadline but before the
  meeting day is a late report: it is due two hours after the event ends (an
  event with no end time ends at 20:00), but never after midnight before the
  meeting day (printed as 23:59 of the day before), and it goes to that
  porada. The editor says „Odevzdejte do …; vyjde v poradě …“. A report is owed from the
  end of its akce, so it can be started on the akce's last evening.
- The report of an akce goes to the akce's porada (the first porada whose
  meeting day is after the akce's last day) and to no other, even when it is
  handed in after the deadline, as long as that porada is not generated yet
  (ADR 0049). Once it is generated the hand-in is refused („Porada už je
  vygenerovaná“).
- The state sent to the browser is the working set only (ADR 0070): live
  items, and for a generated porada metadata. History is read on demand
  („Archiv“).

### Reviewing

- One queue, „Ke kontrole“ (staff only): reports, jednání/akce (waiting, or
  approved with a cancel request) and, for the headmaster, the paragraphs of
  missing reports, oldest hand-in first. Reviewers approve („Schválit“), edit
  („Upravit text“), return („Vrátit autorovi“: tick the parts to rework, a
  note, or both; ADR 0058) or reject („Zamítnout“, a note is required); they
  can also cancel an approved akce. A teacher's „Požádat o zrušení“ only asks:
  the akce stays approved until vedení confirms („Potvrdit zrušení“) or
  refuses („Zamítnout zrušení“, a note is required), and the author can take
  the request back („Vzít žádost zpět“; ADR 0062). A reviewer cannot approve
  their own point („Svou zprávu si sami neschválíte.“); the headmaster can. A
  decision can be undone from the toast that follows it.
- Staff reviewers see the full preview of the porada („Náhled porady“,
  read-only); it names students, so students never see it.
- A reviewer sees a colleague's point only after the author handed it in; a
  draft stays private. A returned point stays visible to reviewers.
- A reviewer's edit keeps the original wording of the changed fields in the
  point's timeline („Úprava: …“). A reviewer's edit of someone else's
  approved akce does not send it back to the author.
- E-mail notifications to authors (a point returned, approved or rejected; none
  when the author decided their own point; none for akce decisions). Reviewers
  and the headmaster get no digest mail (switched off, ADR 0037): what waits
  for review and the access requests are in the app.

### Weekly issue

- One issue (porada) per Monday key; the meeting date is free. The deadline
  counts back from the meeting date: by default two days before, at 20:00,
  which is Saturday 20:00 for a Monday meeting. Submissions after the deadline
  go to the next porada, except the late reports above.
- Settings („Nastavení“, headmaster): the deadline (1 to 4 days before the
  meeting, 8:00 to 22:00 on a quarter hour) and the two deadline reminders on
  or off. A deadline already shown to an author never moves: saving freezes the
  porady shown so far with the old rule and applies the new one to those nobody
  has seen, and never to a deadline set by hand. (The heading and intro of
  Příloha 1 are stored settings, but Arch has no field for them.)
- Deadline reminders by e-mail, which nobody can switch off for themselves:
  two days before the deadline at 13:00 to the organiser of every approved
  akce that has ended and whose report this porada is owed and
  nobody has handed in yet (the porada after the akce's last day; students
  too), and on its day at 12:00 to authors with a draft (touched in the last 28
  days) or returned point. The headmaster can switch either reminder off for
  everyone. Reminders go out in the six hours after their time and stagger over
  30 minutes. The deadline day's reminder leaves out late reports, which have
  their own mails: one when the akce ends (with the exact deadline) and one an
  hour before it, to the author of the akce or of the late draft.
- No summary mail for the headmaster after the deadline or after the late
  reports (switched off, ADR 0037): the preflight of the porada shows where
  its points stand.
- The porada screens („Porada“, headmaster): the working porada is the first
  open one whose meeting date is today or later, with steps „Zkontrolovat“,
  „Pokyny a hospodaření“, „Chybějící zprávy“, „Přítomní a hosté“, „Přílohy“,
  „Seznamy studentů“ and „Vygenerovat dokument“ (Náhled). Poradas after it are
  listed under „Další porady“; one nobody has written to yet is a virtual
  porada that starts to exist when someone sends something.
- Přítomni, Hosté and the older Příloha 2 carry from the latest earlier porada
  that has a value, and the headmaster edits them in „Přítomní a hosté“ and
  „Přílohy“. An empty value clears and carries as cleared.
- A POKYNY outline editor with carry-over („Pokyny a hospodaření“). Each item
  is standing („Trvalý bod“) or one-time („Jen pro tuto poradu“), and items can
  be edited, added with text and removed („Odebrat bod“). The first write
  copies the outline that was derived from the earlier porada, or from the
  school's starting content. The meetings, events, talent and exemption rows
  are generated and not editable; the partner slot keeps quotes, at most 20.
  Approved proposals are appended to their section, marked „Nově schválený
  návrh“, and the headmaster places them („Zařadit za bod“ or „Nechat na
  konci“); a proposal's wording is changed through the reviewer's edit. A
  placed proposal that goes back to its author keeps its place: the editor
  hides it, and it comes back there once approved again.
- Ohlasy v médiích and ohlasy sociálních partnerů (headmaster only), in the
  outline.
- „Přidat do porady“ (headmaster): adds an akce, jednání, a proposal, a
  report, an ohlas, a student to a list or an annex directly, with no review.
- Annexes („Přílohy“): Příloha 1 is the talent list from the registry. Další
  přílohy are the older Příloha 2 (free-form text, carried on) and numbered
  annexes that can be added, reordered and removed, each starting on a new
  page. An annex part is text, a table, a picture or a file import: .docx,
  .odt, .pdf and .doc are read in the browser into ordinary parts (.pdf and
  .doc give text only; ADR 0066), and the whole annex list is limited to
  3.5 MB. Control characters, tabs and line breaks in table cells and picture
  descriptions are refused.
- Student registry („Seznamy studentů“, headmaster edits, staff reviewers read): the
  lists of Příloha 1 and point 4, more can be added („Nový seznam“, with a
  „Text v dokumentu“), each entry with given
  name, family name and class, sorted by class, with students added since the
  last document in bold. Bulk paste („Vložit seznam“) reads the document's own list
  format („Jana Nováková (1.A), Patricie Nováková, Anna Nováková (obě 2.B), …“)
  and one name per line, with a preview of the problems before anything is
  added. „Nový školní rok“ (step-up) archives the chosen lists for the ending
  school year; entries never printed are deleted.
- Full preview and a preflight check before generating. The server blocks on
  an invalid snapshot, an incomplete report and an earlier porada not yet
  generated or dropped (named, with a link; ADR 0040), and warns about points
  and akce still waiting, returned points, late reports still expected, akce
  whose report is missing, unchecked placeholders, placed proposals no longer
  eligible, an empty Příloha 1 and a deadline still ahead.
- A missing report: every akce owed to the porada whose report is not approved
  at generation is printed among the reports as its title, a paragraph the
  system writes from the akce („V úterý 5. května 2026 od 14.00 hodin proběhla
  akce předání diplomů (areál Smíchov, Zasedací místnost). Akci organizovali:
  paní profesorka Jana Nováková. Za Smíchovskou střední se
  zúčastnili: účast slečna Eva Malá (2.GA). Zpráva o akci nebyla dodána.“, the
  names and Účastníci as typed, empty pieces left out; „Akci za školu
  koordinovali:“ for a coordinated akce, „Akci zajišťovali:“ for one saved
  without a role) and the line
  „vyjádření organizátora: nebylo dodáno“. The headmaster can rewrite the paragraph on
  „Chybějící zprávy“ („Přepsat odstavec“) and restore the system's text
  („Vrátit původní text“).
  Each paragraph is reviewed (ADR 0061): „Zkontrolováno“ confirms the system's
  text, and the paragraph counts as checked only while that confirmed original
  equals the paragraph the system would write now, so an edit of the akce or the
  headmaster's own save un-checks it. The status is checked, handed-in (a report
  waits for a decision), open (the author can still hand in) or to-check. The
  headmaster sees the to-check ones in Ke kontrole, marked
  „Vygenerováno automaticky (zpráva nedodána)“, with „Zkontrolováno“; Chybějící
  zprávy there is an overview.
  While any paragraph is unchecked, „Vygenerovat a zveřejnit“ first opens
  „Nezkontrolované odstavce“ („Zkontrolovat“ / „Vygenerovat i tak“). It is
  never blocked.
  Generation closes such a report: an unfinished draft or a report still in
  review is withdrawn, and the akce is no longer asked about (ADR 0049). A
  report the vedení refused closes its akce: nothing is printed for it and the
  author is not asked for another (ADR 0056).
- Generation: „Vygenerovat dokument“ on the Náhled opens „Vygenerovat a
  zveřejnit“ (headmaster, after a confirmation tick; held off while the
  preflight blocks) and stores a DOCX in the
  exact template look and publishes the points it prints. The worker then makes
  the PDF with Gotenberg („PDF se připravuje…“, or „PDF se nepovedlo“ with the
  reason). Both stay downloadable („Stáhnout DOCX“, „Stáhnout PDF“) from the
  porada and from „Archiv“ for the headmaster and the staff reviewers, and
  every download is audited. A generated porada cannot be reopened or
  regenerated yet (ADR 0038).
- Calendar (ADR 0054): a porada that does not take place does not exist. The
  headmaster has three acts. „Přesunout poradu“ changes the meeting date and
  deadline of an open porada, within the neighbouring poradas; it is refused
  when the date is too early or late, that week already has a porada, the
  deadline would already be past while the porada is still open, or the order
  of meeting dates and deadlines would break (the dialog says which). „Porada
  se nekoná“ drops an open porada after a confirmation tick; its points,
  outline, empty texts and annexes go to the next one, and it cannot be
  brought back. „Přidat poradu“ adds one for a week without one, but not
  before a generated porada. The Monday key of a porada never changes. Nobody
  is mailed about a move (switched off, ADR 0037).
- Times: screens and mails write „23:59“ (a colon, no leading zero); the
  document keeps the template's „7.00“.

### Operations

- Docker compose deployment (`deploy/compose.yaml`): Caddy, web, worker,
  Postgres, Gotenberg (document to PDF, worker only), a second locked-down
  Gotenberg for the annex import of `.doc` files (web only), a one-shot
  `migrate`, and a `cli` tools profile.
- Timed jobs: mail ledger prune (daily, 91 days), the report prompt (daily
  08:00), deadline reminders and late-report mails (every 15 minutes). The
  queue deletes its own finished jobs.
- CLI (`pnpm cli`, or the tools image): `migrate`, `jobs:status` (jobs and
  the dead-letter queue), `jobs:redrive` (replay dead jobs), `jobs:run`
  (queue one timed job now), `mail:test` (a test e-mail to a reviewer or the
  headmaster), `render-snapshot` and `auth:probe`.
- A short privacy text, „Jak s údaji zacházíme“ (`#/soukromi`), open without
  signing in. The full privacy notice is not built (ADR 0065).

### Not built yet

Planned for v1, but not in the code:

- Backups: encrypted, nightly, restore-verified and copied off the server.
  The compose stack has no backup service.
- Retention jobs: purging drafts and requests at the end of the school year
  and the audit log after 3 years. The rules exist in `domain/retention` and
  only the mail-ledger prune uses them. The privacy text at `#/soukromi` still states them.
- A health endpoint (the web healthcheck fetches `/`), a daily ops check and
  alert e-mails to the IT contact.
- A break-glass CLI to generate a porada, revoke sessions, set a role and
  handle data-subject requests.

### Known limits

- Arch needs JavaScript; there is no fallback without it (ADR 0065).
- Registry lists keep their stored order; they cannot be reordered (ADR 0065).
- The search of the school's Microsoft directory (`DIRECTORY` `dev` or
  `graph`, ADR 0021) exists as a route only (`POST /api/adresar/hledat`);
  nothing in Arch calls it (ADR 0065 item 7), and production stays `off`
  until the tenant is set up.
- Moving a porada notifies nobody: a late report's first mail already sent
  keeps the old close, and the last call carries the new one.

## Deferred (later)

- Entra group claims for roles; a second approver.
- In-app notification feed; attendance checkboxes for Přítomni.
- A UI for data-subject requests.
- Photos in points.
- An importer for legacy `.doc` / `.docx` poradas.
- An ICS calendar feed of future items; statistics.
- PDF/A output; Trusted Types; Postgres row-level security.
