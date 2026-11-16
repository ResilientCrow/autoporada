# 0068 — An unknown title is named, not quoted

Amends ADR 0067 items 3 and 4. Item 7 (the placeholder paragraph) stands.

## Context

When the title does not say its gender, ADR 0067 had the opening sentence
write „proběhla akce „Vinobraní na Smíchovské střední““. The school writes
„proběhla akce s názvem Vinobraní na Smíchovské střední“: the quotes read as
foreign in its reports.

## Decision

The fallback of the opening sentence (`openingSentence`, `domain/cs/sentence`)
is „proběhla akce s názvem <title>“, „kterou“, with the title as typed and no
quotes. A title whose gender is read still prints bare after its own verb.

## Consequences

- Only new openings change. An opening already written into a point is the
  author's text and is not rewritten.
- The placeholder paragraph keeps „proběhla akce <title>“, so a confirmed
  placeholder stays checked.
