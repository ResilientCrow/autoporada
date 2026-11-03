# 0052 — Owed reports come first, and only vedení proposes

Builds on ADR 0035 (the close of a late report), ADR 0048 (every approved
akce owes a report) and ADR 0049 (an akce's report goes to its porada, or a
placeholder does). Settles the bound of the report card that ADR 0048 left
open. Changes the Czech label of the `reviewer` role (the glossary row).

## Context

The school's points have three sources. A report (souhrn z akce) should
come from an akce the author registered at an earlier porada. A report
written from scratch is the exception, for an event nobody registered. A
proposal for HOSPODAŘENÍ or POKYNY is the leadership's (vedení: the
reviewers and the headmaster).

The app said otherwise. „Současné události“ (`/body`) opened with two equal
buttons, „Nový bod“ and „Nový návrh“, offered to every submitter, students
included. „Akce čekající na zprávu“, the akce whose report the author owes,
sat below the account card on Přehled. It named no porada and no deadline,
listed every ended akce however old (ADR 0048), and lost an akce as soon as
its report was started, while it was still only a draft. Nothing told a
teacher: this is the report the coming porada waits on.

## Decision

1. **Only vedení proposes.** A new check `point.propose` allows a reviewer
   or the headmaster who is not a student (the same test as
   `issue.preview`). `points.create` gates a `report` on `point.create`
   (any submitter, as before) and a `finance` or `pokyn` proposal on
   `point.propose`. `/navrhy/novy` is not found without it. `point.create`
   keeps its meaning (may write points) for the nav, the lists and the
   calendar. A proposal already started by someone else is left alone:
   editing, handing in and reviewing it work as before.
2. **The reviewer role reads „Vedení“.** The role chip and the users-list
   filter say „Vedení“ (the filter's slug becomes `vedeni`). Sentences that
   named „kontrolor“ say „jiný člen vedení nebo ředitel“. The code, the
   database enum and the policy keep `reviewer`.
3. **A report from scratch is a quiet link for ordinary staff.** Whoever may
   propose (item 1) keeps the buttons „Nový bod“ and „Nový návrh“ on
   `/body` and `/pridani`. Everyone else sees no button. Under the owed
   reports they get one link: „Akce nebyla předem zadaná? Napsat zprávu bez
   akce“, to `/body/novy` as before. The empty list says „Zatím tu nemáte
   žádný bod.“ and points nowhere.
4. **The card lists what the open porady wait on.** „Akce čekající na
   zprávu“ (title kept) lists the author's approved akce that have ended
   (`reportDue`) and whose porada (`owedPorada`, ADR 0049) is open: not
   generated, not skipped. That is normally the coming porada, and also a
   porada of this week already held but not yet generated. The open porady
   are those of the calendar window from this week's Monday on, the same
   ones `points.submit` places a report in: a porada of an earlier week
   takes no more reports, so its akce are not listed. Akce owed to a
   generated porada have been marked missed (ADR 0049 item 6) and are gone.
   The card is bounded by the open porady, not by a page of the list: the
   use case `future.owedReports` reads `owedTo` for each open porada whose
   `since` is not after today, keeps the author's own, and reads their
   report points in the author's scope.
5. **Each row says where and by when.** Under the title and days: „Půjde na
   poradu {datum}; odevzdejte do {kdy}.“ `{kdy}` is the report's close
   (`reportCloses`, ADR 0035), so a late report shows its own. Past the
   close the row says „Termín uplynul {kdy}; porada na zprávu ještě čeká.“
   The rows are ordered by porada, then by close.
6. **A started report stays on the card until it is handed in.** While the
   akce's report point is a draft or returned, the row shows its state chip
   and „Pokračovat ve zprávě“, a link to the point, in place of „Napsat
   zprávu“. A withdrawn report counts as none started (the button starts a
   new one, as `future.startReport` already allows). The row leaves once the
   report is submitted, approved or published. A report withdrawn after it
   was handed in leaves the akce's report `written`, so `future.startReport`
   would refuse a new one; the row does not come back.
7. **The headmaster sees the count.** On Přehled the headmaster (only the
   `issue.edit` holder) gets „Zprávy z akcí pro poradu {datum}: neodevzdáno
   {n} z {m}“ for the working porada (the first open porada whose meeting
   day is today or later). `m` counts the akce owed to it (`owedTo`, ADR
   0049), ended or not. `n` counts those whose report is not handed in: no
   report point, or one that is a draft, returned or withdrawn. The line
   links „Chybějící zprávy“ (`/porada/[datum]/zpravy`, ADR 0049), on a card
   of that title. It is left out when `m` is 0. These are counts only: no
   titles, no names (`issues.reportTally`).
8. **Přehled puts the work first.** The order is: the owed reports, the
   headmaster's count, the review queue card, the „Moje body“ card, the
   headmaster's meeting strip, and the account card (role chips,
   „Odhlásit všude“) last. On Přehled the owed card is hidden when empty.
   At the top of `/body` and `/pridani` an empty card says „Teď nemáte
   žádnou zprávu z akce k napsání.“

Items 4 to 7 read `owedPorada` and `owedTo` from ADR 0049 and are built on
top of it. Items 1 to 3 and 8 stand alone.

## Consequences

- A teacher opens the app to the reports they owe, with the porada and the
  hour, and a report from scratch takes a deliberate click.
- Students and ordinary staff can no longer start a proposal. One they have
  in progress still goes through review.
- The card no longer shows every unwritten report since the deploy, only
  those an open porada still prints. An older one is a placeholder in its
  porada (ADR 0049), and nothing reminds anyone of it.
- The card reads the calendar and each listed akce's report point. It stays
  small: an author has few akce owed to the open porady.
- No migration and no worker change. The worker's mails (ADR 0035, 0046)
  are unchanged.

## Options rejected

- **A „vedení“ flag apart from the roles.** A second axis to keep in step
  with `reviewer`. The school's vedení is exactly its reviewers and the
  headmaster.
- **Rename the role in code and the database.** A migration and a sweep
  through every layer, for a word only the UI shows.
- **Hide „Nový bod“ entirely.** An event nobody registered still needs its
  report.
- **List every unwritten report, grouped by porada.** A report for a
  generated porada can no longer print. Listing it would ask for work that
  goes nowhere.
- **Show upcoming akce before they end.** Nothing can be done with them
  yet. The mails and the card start when the akce ends.
- **A count badge in the nav.** The card on Přehled and on `/body` is where
  the work starts. A badge would need the calendar on every page.
