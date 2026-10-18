# 0007 — Restricted rich text as flat indented paragraphs

## Context

The standing POKYNY content uses three list levels: „o“ (bold italic), „o“
and „■“. The template sometimes skips a level, e.g. a „■“ directly under a
level-0 item. ProseMirror nested lists cannot represent a skipped level.

## Decision

- TipTap 3 with a custom schema. The document is a list of paragraphs, each
  with an `indent` attribute 0–3 (0 = plain paragraph, 1–3 = the three bullet
  levels).
- The only marks are bold and italic. No links, headings, images, HTML or
  pasted styles.
- The stored form is JSON, validated server-side:
  - Zod and the ProseMirror schema check;
  - at most 64 KB and 2,000 nodes.
- It is rendered through components, never through `dangerouslySetInnerHTML`.

## Consequences

- Tab and Shift+Tab change the indent level, and screen readers announce the
  level.
- Pasting from Word keeps text and basic marks only.
