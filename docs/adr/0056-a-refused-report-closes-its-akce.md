# 0056 — A refused report closes its akce

Supersedes ADR 0049 item 3 in part (a refused report is no longer missing).
Builds on ADR 0052 (the author's „Akce čekající na zprávu“).

## Context

ADR 0049 printed a placeholder for every owed akce whose report was not
approved, and its list of states left a refused (`rejected`) report out of
both sides: it was neither printed nor named as missing. Assembly fell
through to the placeholder, so the document printed „Dne … proběhla akce …“
for a report the vedení had refused, and „Zprávy z akcí … neodevzdáno“
counted it.

The Arch client listed the akce again under „Čeká na vás“ with „Napsat
zprávu“, as if the refusal had reopened it. The server never reopens it: the
submit moved the akce's `report_state` to `written` (REPORT_MACHINE `write`)
and nothing moves it back, so `future.startReport` refused with
`report-not-due` and the author saw a red bar.

## Decision

1. **A refused report closes its akce.** The porada prints nothing for it:
   no report and no placeholder (`missingReports` leaves it out, as it does
   a published one). It is not in the preflight's `reports-missing`, on the
   headmaster's „Chybějící zprávy“, or in the tally on Přehled (neither
   owed nor missing).
2. **The author is not asked again.** „Akce čekající na zprávu“ stays as
   `future.owedReports` has it: a draft or returned report, or none started
   (or one withdrawn) while the akce's `report_state` is `none` or
   `prompted`. A report handed in once moves the akce to `written`, so
   withdrawing it later does not ask for a new one either; the delete
   dialog says „O zprávu z akce vás znovu požádáme“ only while the report
   was never handed in.
3. **The Arch client mirrors the server.** Its local state moves the akce to
   `written` on submit, not when the report is started, and a refusal or a
   withdrawal leaves it as it is.

## Consequences

- A refusal is final for the akce. The vedení that wants a report fixed
  returns it („Vrátit k úpravě“) instead.
- A report withdrawn after it was handed in still leaves a placeholder
  (ADR 0049 item 3), since the vedení never decided on it.
