# 0058 — A return names the parts to rework

Adds to ADR 0053 (the Arch UI on the same backend) and to the review
decisions of design sections 10 and 12. Leaves the classic review form as it
was.

## Context

A return carried one note. The Arch return dialog offered three phrases, each
of which replaced the note, so a reviewer named one reason at a time. The
author's correction screen opened the text and the statements whatever the
note asked for, and an akce went back to the wizard's summary.

## Decision

1. **A return names parts, a note, or both.** `points.decide` and
   `future.decide` take `parts` on a return: one to four codes, each once
   (`returnPartsSchema`). A report's parts are `heading` („Název a datum“),
   `body` („Text zprávy“), `people` („Seznam účastníků“) and `statements`
   („Vyjádření“); a proposal's are `heading` and `body` („Název“, „Text“); an
   akce's or a jednání's are `title`, `when`, `place` and `responsible`
   („Název“, „Datum a čas“, „Místo“, „Kdo ji vede“). A code the item does not
   have is `invalid-input` on `parts`. A refusal still needs a note, and parts
   belong to a return only (`refineDecision`).
2. **The parts are stored with the return**, in `return_parts` on
   `point_events` and `future_events`. `GET /api/arch/state` gives a returned
   item the parts of its latest return (`parts`, else null), and the trail
   entry of each return its parts.
3. **Arch's return dialog** („Vrátit k úpravě“, formerly „Vrátit
   s poznámkou“) lists the item's parts as checkboxes, and the note is
   optional once a part is ticked. The phrases are gone.
4. **The author sees what to rework**, as „Upravte: …“ above the note. A
   returned report's correction screen opens exactly the named parts: title
   and date (a proposal's title only), the text, the people lists other than
   the organisers, the statements. A return without parts opens the text and the statements, as
   before. A returned akce's „Opravit a poslat znovu“ starts at the wizard
   step of the first named part. „Co se dělo“ adds „K přepracování: …“ under
   a return.
5. **The classic UI** shows the parts in a point's timeline and keeps its
   note-only return form.

## Consequences

- The return e-mail is unchanged: it names no note and no parts, and the
  author reads both in the app.
- A return of a proposal or an akce never names a part it does not have; the
  dialog offers only the item's own.
