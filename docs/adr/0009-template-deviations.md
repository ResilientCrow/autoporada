# 0009 — Deliberate deviations from the Word template

Status: **Proposed**. The headmaster signs it off at the milestone M2
checkpoint, after comparing the generated replica with the template in
Microsoft Word.

## Context

The blank template was edited by hand over years. It mixes indent schemes and
spacer paragraphs, and its Příloha 1 is one table padded with empty rows.
A generator needs one consistent rule for each element.

## Deviations (to be confirmed at the checkpoint)

1. **Příloha 1 table.** A header row at the top of every column. No padding
   rows: the table ends after the last student.
2. **Spacing between points.** Exactly one empty paragraph between points,
   instead of the template's varying spacers.
3. **Hotel Voyager lists.** Template numbering instances 6 and 7 are
   normalised to the shared three-level list style.
4. **Quotes.** Partner quotes use Czech „…“ consistently. The template mixes
   them with “…”.
5. **Příloha 2.** It always starts on a new page, and it is omitted when
   empty.
6. **Typography.** Non-breaking spaces after one-letter prepositions and
   inside dates.

Any further deviation found while implementing M2 is added here before the
checkpoint.
