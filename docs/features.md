# Features

This list is the scope of v1. A feature that is not listed here is not built
in v1 unless the [plan of record](plan.md) changes first.

## v1

### Access

- Sign-in with the school Microsoft 365 account (single-tenant Entra ID, OIDC).
  The app stores no passwords.
- Allow-list with access requests. Users who are not approved see
  „Požádat o přístup“, and the headmaster decides each request.
- The requester gets an e-mail when the request is approved, rejected or
  blocked, and a user gets one when access is granted by hand.
- After a rejection the person can ask again 30 days later. A blocked request
  is final, but the headmaster can still grant access by hand.
- Roles: submitter, reviewer, headmaster. The UI calls the reviewer role
  „Vedení“ (ADR 0052). A student flag limits students to the submitter role.
- The headmaster finds people in the users list by name or e-mail. A
  headmaster cannot change their own role, type or account status; a sole
  headmaster first promotes a deputy.
- Re-authentication (step-up) for changes to users' roles, types and account
  status, and for „Nový školní rok“.
- „Odhlásit všude“, which revokes all of a user's sessions.

### Submitting

- Report points for INFORMACE Z PROVOZU ŠKOLY:
  - structured fields that produce a pre-written opening sentence;
  - admin-defined point types with labelled bullets;
  - at least one participant list and one vyjádření, both mandatory;
  - a live document preview.
- People picker that searches the M365 directory (when the search is switched
  on; production starts with it off) and offers the people from the author's
  own earlier points, with their salutation, class and genitive form. Nothing
  is shared between authors. A list of people can be pasted. Class codes are
  saved in the school's form ("1. a" becomes "1.A").
- Genitive suggestion with a confidence indicator. The submitter can correct it.
- Future items (jednání / akce). They are placed into points 1 and 2 and the
  last PROVOZ point by date. An approved akce is visible to every signed-in
  user, students included, with its free-text Organizátor, Účastníci and Poznámka
  as typed (ADR 0060). Akce and jednání share one wizard (Název, Kdy, Kde, Kdo,
  Poznámka); only Název and Den are required. The printed line is date, time,
  areál, místo, název, poznámka, organizátor, účastníci, joined by commas, with
  empty pieces left out; multi-day items print „neděle 3. května až čtvrtek
  14. května 2026“ and no time. Within a list: by start day, multi-day items
  first, then timed, then untimed, then by title. An approved akce is
  changed only by „Uložit změny“, which sends it for review again. After the
  event, the author is asked to write the report by e-mail and gets a draft
  prefilled from the akce (title, dates, areál and místo; not the organizers). Every approved akce owes a report; it cannot be
  declined (ADR 0048). The author deletes a draft or returned item from its
  wizard after a confirmation (ADR 0057).
- Proposals for HOSPODAŘENÍ items and for extra POKYNY points, by vedení only
  (reviewers and the headmaster, never a student; ADR 0052).
- „Akce čekající na zprávu“ lists the author's ended akce whose porada is
  still open, by porada and then by close. Each row says „Půjde na poradu …;
  odevzdejte do …“, or past the close „Termín uplynul …; porada na zprávu ještě
  čeká.“ A draft or returned report keeps its row, with its state and
  „Pokračovat ve zprávě“; the row leaves once the report is handed in. It is
  the first card on Přehled (hidden when empty) and the top of „Současné
  události“ (a sentence when none is owed; ADR 0052).
- Vedení start points with „Nový bod“ and „Nový návrh“. Everyone else gets one
  quiet link, „Akce nebyla předem zadaná? Napsat zprávu bez akce“, for a report
  on an event nobody registered.
- Přehled puts the work first: the owed reports, for the headmaster „Zprávy z
  akcí pro poradu …: neodevzdáno n z m“ (the working porada, linking
  „Chybějící zprávy“), the review queue, „Moje body“, the meeting strip, and
  the account card last (ADR 0052).
- Autosave with conflict detection, a status timeline, „Stáhnout“ (back to a
  draft) and „Zrušit bod“. A late hand-in goes to the next meeting whose
  deadline is still ahead, and the editor says which one.
- A report on an event that ends after its porada's deadline but before the
  meeting day is a late report: it is due two hours after the event ends (an
  event with no end time ends at 20:00), but never after midnight before the
  meeting day (printed as 23:59 of the day before), and it goes to that
  porada. The editor and the detail say „Zprávu odevzdejte do …; půjde na
  poradu …“. A report is owed from the end of its akce, so it can be started
  on the akce's last evening.
- The report of an akce goes to the akce's porada (the first porada not
  skipped whose meeting day is after the akce's last day) and to no other,
  even when it is handed in after the deadline, as long as that porada is not
  generated yet (ADR 0049).

### Reviewing

- A queue grouped by section, with a flat queue of akce beside it (oldest
  hand-in first, a mark for a changed approved akce). Reviewers approve, edit,
  return (ticking the parts to rework, a note, or both; ADR 0058) or reject
  (a note is required); they can also cancel an approved akce. A reviewer cannot approve their own point.
- Staff reviewers see the full preview of the porada (`/porada/[datum]/nahled`,
  read-only); it names students, so students never see it.
- A reviewer sees a colleague's point only after the author handed it in; a
  draft stays private. A returned point stays visible to reviewers.
- A reviewer's edit keeps the original wording of the changed fields in the
  point's timeline („Původní znění“).
- E-mail notifications to authors (a point returned, approved or rejected; none
  when the author decided their own point; none for akce decisions). Reviewers
  and the headmaster get no digest mail (switched off, ADR 0037): what waits
  for review and the access requests are in the app.

### Weekly issue

- One issue (porada) per Monday slot. The deadline counts back from the
  meeting date: by default two days before, at 20:00, which is Saturday 20:00
  for a Monday meeting. Submissions after the deadline go to the next porada,
  except the late reports above.
- Settings (`/nastaveni`, headmaster): the deadline (1 to 4 days before the
  meeting, 8:00 to 22:00 on a quarter hour), the two deadline reminders on or
  off, and the heading and intro of Příloha 1. The form shows its effect before
  saving. A deadline already shown to an author never moves: saving freezes the
  porady shown so far with the old rule and applies the new one to those nobody
  has seen, and never to a deadline set by hand.
- Deadline reminders by e-mail, which nobody can switch off for themselves:
  two days before the deadline at 13:00 to the organiser of every approved
  akce that has ended and whose report (souhrn z akce) this porada is owed and
  nobody has handed in yet (the porada after the akce's last day; students
  too), and on its day at 12:00 to authors with a draft or returned point.
  The headmaster can switch either reminder off for everyone. Saturday's
  reminder leaves out late reports, which have their own mails: one when the
  akce ends (with the exact deadline) and one an hour before it, to the author
  of the akce or of the late draft.
- No summary mail for the headmaster after the deadline or after the late
  reports (switched off, ADR 0037): the preflight of the porada shows where
  its points stand.
- The porada pages (`/porada`, headmaster): the working slot is the first open
  porada whose meeting date is today or later, with steps for the outline,
  „Údaje“, Příloha 2 and the preview.
- Přítomni, Hosté and Příloha 2 carry from the latest earlier porada that has
  a value, and the headmaster edits them in „Údaje“ and „Příloha 2“. An
  empty value clears and carries as cleared; „Odebrat přílohu“ removes Příloha 2.
- A POKYNY outline editor with carry-over (`/porada/[datum]/pokyny`). Each item
  is standing or one-time, items can be reordered, edited, added with text and
  removed, and the text is restricted rich text with three indent levels. The
  first write copies the outline that was derived from the earlier porada, or
  from the school's starting content. The meetings, events and partner slots are
  generated or restricted (partners keep their quotes, at most 20). Approved
  proposals are appended to their section, marked „Nově schválený návrh“, and
  the headmaster places them; a proposal's wording is changed through the
  reviewer's edit. A placed proposal that goes back to its author keeps its
  place: the editor hides it, and it comes back there once approved again.
- The rich-text editor: bold, italic, undo, and four indent levels (plain,
  then the o / o / ■ levels). Text pasted from Word or Google Docs is cleaned
  in the browser to paragraphs, bold, italic and levels; nothing else is kept.
  Every M9 editor saves with „Uložit“ and asks before leaving with unsaved
  changes.
- Ohlasy v médiích and ohlasy sociálních partnerů (headmaster only), in the
  outline.
- Příloha 2, optional free-form content.
- Student registry (`/registr`, headmaster edits, staff reviewers read): the
  lists of Příloha 1 and point 4, more can be added, each entry with given
  name, family name and class, sorted by class, with students added since the
  last document in bold („NOVÉ“). Bulk paste reads the document's own list
  format („Jana Nováková (1.A), Patricie Nováková, Anna Nováková (obě 2.B), …“)
  and one name per line, with a preview of the problems before anything is
  added. „Nový školní rok“ (step-up) archives the chosen lists for the ending
  school year; entries never printed are deleted.
- Full preview and a preflight check before generating. The preflight blocks on
  an invalid snapshot and on an earlier porada neither generated nor skipped
  (named, with a link; ADR 0040), and warns about points and akce still waiting, returned
  points, late reports still expected, akce whose report is missing, placed
  proposals no longer eligible, an empty Příloha 1 and a deadline still ahead.
- A missing report: every akce owed to the porada whose report is not approved
  at generation is printed among the reports as its title, a paragraph the
  system writes from the akce („V úterý 5. května 2026 od 14.00 hodin proběhla
  akce předání diplomů (areál Smíchov, Zasedací místnost). Akci zajišťovali:
  organizuje paní profesorka Jana Nováková. Za Smíchovskou střední se
  zúčastnili: účast slečna Eva Malá (2.GA). Zpráva o akci nebyla dodána.“, the
  Organizátor and Účastníci texts as typed, empty pieces left out) and the line
  „vyjádření organizátora: nebylo dodáno“. The headmaster can rewrite the paragraph on
  „Chybějící zprávy“ (`/porada/[datum]/zpravy`) and restore the system's text.
  Generation closes such a report: an unfinished draft or a report still in
  review is withdrawn, and the akce is no longer asked about (ADR 0049). A
  report the vedení refused closes its akce: nothing is printed for it and the
  author is not asked for another (ADR 0056).
- Generation: „Vygenerovat dokument“ on the Náhled (headmaster, after a
  confirmation tick; held off while the preflight blocks) stores a DOCX in the
  exact template look and publishes the points it prints. The worker then makes
  the PDF with Gotenberg. Both stay downloadable from the porada and from
  „Archiv porad“ for the headmaster and the staff reviewers, and every download
  is audited. A generated porada cannot be reopened or regenerated yet (ADR
  0038).
- „Porada se nekoná“, before or after its deadline, asks for the day the next
  porada is held, any day up to the end of the 26-week horizon (ADR 0051). The
  day belongs to the nearest Monday: Monday to Thursday to their own week,
  Friday to Sunday to the next. A day in this porada's own week moves it there,
  for example a holiday Monday to the Tuesday after or the Friday before.
  A later day skips this porada and every one before that day's, and moves
  that porada to the day when it is not its meeting date. A moved porada gets
  the deadline the rule counts back from the new day; there is no hand-set
  deadline. The dialog says what the day does, or why it is refused: a day
  that falls on a skipped porada, one whose deadline would already have
  passed while the current one has not, or one that breaks the order of
  meeting dates and deadlines. The Přehled strip skips a single week. Přehled
  shows a moved porada; nobody is mailed about a move (switched off, ADR
  0037). A skipped porada cannot come back once a later one is generated (ADR
  0041). There is no separate „Přesunout poradu“ page.
- Times: screens and mails write „23:59“ (a colon, no leading zero); the
  document keeps the template's „7.00“.

### Operations

- Docker compose deployment: Caddy, web, worker, Postgres, Gotenberg, backups.
- Encrypted nightly backups. Each one is restore-verified, then copied off the
  server.
- Retention jobs:
  - drafts and requests are purged at the end of the school year;
  - the audit log is kept 3 years.
- Health endpoint, a daily ops check, and alert e-mails to the IT contact.
- A break-glass CLI: generate, revoke sessions, set role, render a snapshot,
  and handle data-subject requests.
- CLI commands for the queue: `jobs:status` lists jobs and the dead-letter
  queue, `jobs:redrive` replays dead jobs, and `mail:test` sends a test e-mail
  to a reviewer or headmaster.
- Privacy notice page.

### Known limits

- The editor's unsaved-changes guard catches closing the tab and clicking a
  link of the app, but not the browser's Back button.
- Moving a porada notifies nobody: a late report's first mail already sent
  keeps the old close, and the last call carries the new one.

## Deferred (later)

- Entra group claims for roles; a second approver.
- In-app notification feed; attendance checkboxes for Přítomni.
- Data-subject-request UI (v1 has the CLI only).
- Photos in points.
- An importer for legacy `.doc` / `.docx` poradas.
- An ICS calendar feed of future items; statistics.
- PDF/A output; Trusted Types; Postgres row-level security.
