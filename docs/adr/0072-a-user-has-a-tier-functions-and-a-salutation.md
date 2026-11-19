# 0072 — A user has a tier, functions and a salutation

Adds to the user model (plan §1) and to ADR 0021 (the directory). Replaces
the salutation the people state guesses from a user's name. Builds on ADR
0071: participants need nobody's gender, so a salutation is needed only where
one person is named on their own.

## Context

A user has a role (what they may do) and a student flag. The documents need
more: who the person is at the school, and how to address them. The school
has a ředitel, vedení, teachers, other staff, students and absolventi.
Members of vedení hold functions: statutární zástupce, zástupce (pro
pedagogickou činnost, pro majetek, …), vedoucí IT oddělení, vedoucí PR
oddělení, člen PR oddělení. A report names them by function, and the words
follow gender: „pan profesor“, „paní profesorka“. Microsoft Entra will tell
the app only student or employee, never gender, and reading gender from a
name fails on foreign names. Today the people state guesses each user's
salutation from the name (-ová, -a).

## Decision

1. **Three separate things.** Access (`role`, unchanged) is what a person
   may do. Position (tier and functions) is who they are at the school. The
   salutation is how documents address them. Only `role` grants rights; a
   tier or a function never does and never changes the role. The tier
   `vedeni` and the role `reviewer` usually go together, but neither sets the
   other.
2. **Tier.** `users.tier`: `reditel | vedeni | ucitel | zamestnanec | student
   | absolvent`, empty until set. It replaces „Je to student“: `isStudent`
   becomes „the tier is student or absolvent“, so the policy and the check
   `users_student_role` keep their meaning. The headmaster sets the tier in
   Lidé through `users.changeAccess`, under step-up, where the audience is
   set now, since student or not changes what a person sees. Approving a
   request picks the tier instead of „approve as student“. Existing students
   become `student`; everyone else starts empty, and Lidé lists who has no
   tier.
3. **An absolvent follows the account.** An absolvent is a former student,
   with a student's access at most. Whether they can sign in depends only on
   whether their account still exists. Nothing about absolventi is tied to a
   date.
4. **Functions.** Anyone, whatever the tier, holds any number of functions,
   since students sometimes work for the school too (for example in the PR
   team): table `user_functions(user_id, head, complement, position)`. The head is a fixed list in code:
   `statutarni-zastupce | zastupce | vedouci | clen`. The complement is free
   text on one line, printed after the head and never declined: „pro
   pedagogickou činnost“, „pro majetek“, „IT oddělení“, „PR oddělení“. A new
   area is typed, not coded. The headmaster sets functions in Lidé
   (`users.setFunctions`, `admin` limit, audited without the complement
   text).
5. **What prints before the name.** A fixed list in `domain/cs` gives each
   head noun for a man and a woman, in the 1st and 2nd case:

   | Head                | Man                     | Woman                      | 2nd case, man              | 2nd case, woman            |
   | ------------------- | ----------------------- | -------------------------- | -------------------------- | -------------------------- |
   | ředitel             | pan ředitel             | paní ředitelka             | pana ředitele              | paní ředitelky             |
   | statutární zástupce | pan statutární zástupce | paní statutární zástupkyně | pana statutárního zástupce | paní statutární zástupkyně |
   | zástupce            | pan zástupce            | paní zástupkyně            | pana zástupce              | paní zástupkyně            |
   | vedoucí             | pan vedoucí             | paní vedoucí               | pana vedoucího             | paní vedoucí               |
   | člen                | pan člen                | paní členka                | pana člena                 | paní členky                |
   | profesor            | pan profesor            | paní profesorka            | pana profesora             | paní profesorky            |

   The salutation word is the person's own, so a slečna takes the woman's
   noun: „slečna členka PR oddělení Eva Malá (3.B)“. The highest function
   prints, in that order; of two with the same head, the one added first. A
   function always wins over the tier. With no function, the tier decides: a
   ředitel prints „ředitel“, a teacher „profesor“, whatever their degree; a
   student prints the salutation only: „slečna Eva Malá (3.B)“; an absolvent
   prints in the existing form for a role before the salutation: „absolvent
   pan Jan Novák“, „absolventka slečna Eva Malá“; anyone else in vedení and
   other staff print no noun: „paní Jana Malá“. Examples: „paní zástupkyně
   pro pedagogickou činnost Mgr. Jana Nováková“, „vyjádření pana profesora
   Mgr. Jana Nováka“.
6. **The salutation is the person's own answer, asked once.**
   `users.salutation`: `pan | pani | slecna`. The first time a person with
   access opens Arch without one, Arch asks „Jak Vás máme oslovovat v
   dokumentech?“ before anything else. Nothing is preselected and the
   question cannot be skipped; it is one click. Employees choose pan or
   paní, students and absolventi pan or slečna. Nobody else sets it and
   nothing guesses it. The person changes it later on Účet, together with
   their degrees (`titles_before`, `titles_after`), through `users.setAddress`
   (only their own row, `submission` limit). The guess in `arch-people.ts`
   goes: a user with no salutation yet comes without one, and the author
   picks it in the row as for anyone else.
7. **Copied when written, never linked.** When an author picks a user into
   a people row, the row stores the salutation, the head and complement and
   the degrees, as it stores a salutation now, and the author can still
   change them. Arch puts the author into the organisers the same way. A row
   in which anyone has a function names everyone one by one, as rows with
   roles do now. A statement's speaker genitive is pre-filled the same way
   and shown for checking. The akce's Organizátor stays text (ADR 0060,
   0063): Arch suggests users while the author types and inserts the
   finished phrase, which stays editable. A later change to someone's
   function or salutation never changes a written point or a generated
   document. The snapshot stays `schema: 2`: a person gains an optional
   head and complement, and an absent one prints as before (ADR 0034 item
   5).
8. **The directory later.** When Entra is connected (ADR 0021, SMOKE-TEST
   step 29) it may fill only student or employee: an empty tier becomes
   `student` or `zamestnanec`, and a student becomes `absolvent` when the
   directory drops the student mark. An employee tier the headmaster set is
   never overwritten. Functions and the salutation stay in the app. The
   exact sync is decided with the tenant.

## Consequences

- The salutation shows a person's sex. It is stored only because it prints
  and only the person sets it; `docs/gdpr/privacy-review.md` gets a line for
  it. Tier and functions are the school's own facts.
- A person without a salutation is left out of the opening, as now
  (readiness reports it); the question at first opening keeps that rare.
- There is no list of zástupce areas: the complement is typed, and Lidé
  suggests the complements already used.
- Lidé gains the tier and the functions; Účet gains the salutation and the
  degrees. Two new use cases join `USE_CASES` with their tests;
  `users.setAddress` joins the inventory's `SUBMISSION` set.
- The worker reads `users` through a table grant (migration 0008), so the
  new columns need no grant.
- Names still come from the display name split at its last word, so a
  two-word surname splits wrong. Reading Entra's given and family names is
  left to the tenant work.
