# 0040 — Poradas are generated in order

Adds to ADR 0038 items 1 and 2 (what holds the generation off).

## Context

ADR 0038 let the headmaster generate any open porada of the calendar.
Generating publishes every approved point the porada prints, and the next
porada derives its outline from the latest earlier one. If the porada of
2 November is generated while 26 October is still open, the points due by
26 October are published by 2 November's document, and 26 October, when it
is generated after all, derives from an outline that has moved on. The
headmaster can also simply forget a week. The review of slim M10 left this
open.

## Decision

1. **A porada is generated only when no earlier one is open.** The
   assembler reads the calendar (`readSlots`: this week's Monday on, or
   earlier with a meeting still ahead) with the deadline rule it already
   reads first. The earliest slot before the Monday that is neither
   generated nor skipped becomes the fact `earlierOpen`.
2. **The preflight blocks with `earlier-open`.** It is the first block of
   an open porada, and it names that porada by its Monday and meeting date.
   A porada that is not open says `issue-not-open` only. The Náhled holds
   the form as for any block. „Dřívější porada ještě není vygenerovaná ani
   zrušená. Nejdřív ji vygenerujte, nebo u ní zvolte „Porada se nekoná““,
   with a link to that porada's workspace, which offers both.
3. **`issues.generate` refuses with `issue-blocked`**, as for any block. It
   reads the calendar in its own transaction. If two Mondays are generated
   at once, the later one sees the earlier still open and is refused.
4. **A porada of a past week does not count.** A row whose Monday is before
   this week and whose meeting has passed is outside the calendar. Nobody
   can generate it, so it would hold every porada for good.

## Consequences

- At the start the headmaster works through the calendar from this week:
  generates the porada or marks it „Porada se nekoná“.
- An unskip is not checked against later poradas: a skipped porada can be
  opened again after a later one was generated, and the generated one
  stays. Refusing that is a later decision.
- The assembler reads the calendar on every preview. It is the same read
  as the workspace's.

## Options rejected

- **A refusal of its own (`earlier-open` as a rule code).** The preflight
  already holds the form and names what to fix. A second path would say the
  same thing twice.
- **Counting by the meeting date.** The meeting order (`meeting-order`)
  already keeps the meetings in the order of their Mondays.
