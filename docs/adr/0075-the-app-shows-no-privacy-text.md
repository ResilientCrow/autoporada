# 0075 — The app shows no privacy text

Amends ADR 0065 item 8 (Arch's short text at `#/soukromi` is what people
read).

## Context

ADR 0065 dropped the full privacy notice and left Arch a short text, „Jak s
údaji zacházíme“ at `#/soukromi`, linked from the sign-in, the salutation
question and the Účet page. The text promised that drafts and requests are
deleted at the end of the school year and that the record of who did what is
kept for 3 years. No part of the app does either (the retention jobs are not
built), so the text promised what the app does not do. Its wording was never
approved by the school's data protection officer.

## Decision

1. **The page is removed.** `#/soukromi`, its component and its three links
   (sign-in, salutation question, Účet) are deleted, with the `.prose` style
   that only it used.
2. **The app carries no privacy notice.** The school's GDPR notice (Art. 13
   and 14) is published by the school outside the app, for example on its
   website, with its own approval. The draft record for it stays in
   `docs/gdpr/privacy-review.md`.

## Consequences

- An old link to `#/soukromi` opens the sign-in page when signed out and
  „Tenhle list tu není“ when signed in.
- A notice inside the app, if the school wants one later, comes back with an
  approved text and only states what the app does.
