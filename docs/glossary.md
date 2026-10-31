# Glossary

The UI and the generated document are Czech. Code identifiers are English,
except for a few domain terms that have no clean English equivalent. Those keep
their Czech name, without diacritics, so the code and the headmaster use the
same word.

| Czech (UI / document) | Code identifier | Meaning |
|---|---|---|
| Porada vedení školy | `issue` | One weekly meeting document. It belongs to the Monday of its week. |
| bod | `point` | A numbered item in the document („15). Seminář Matika Česku“). Before it is one, an author writes it as a draft, hands it in, and a reviewer approves, returns or rejects it. A reviewer sees it while it is handed in or decided, never as a draft (a retract hides it again). |
| POKYNY PRO ZAMĚSTNANCE, ORGANIZAČNÍ ZÁLEŽITOSTI | `pokyny` | Section 1: organisational instructions. Mostly standing content. |
| INFORMACE Z HOSPODAŘENÍ | `hospodareni` | Section 2: finances. Printed only when it has items. |
| INFORMACE Z PROVOZU ŠKOLY | `provoz` | Section 3: reports about past events. |
| zpráva / bod z provozu | `report` point | A report about an event that already happened. |
| jednání | `jednani` future item | An upcoming meeting. Listed in point 1. |
| akce | `akce` future item | An upcoming event, written by its author before it happens and reviewed like a point. Listed in point 2 or in the last PROVOZ point. An approved akce is visible to every signed-in user, students included, with the people who run it. An approved akce can be changed only by an explicit „Uložit změny“, which sends it for review again; a reviewer can cancel it. After it is over, its author is asked for a report. |
| návrh | `proposal` (point kind `finance`, `pokyn`) | A proposal for an item in HOSPODAŘENÍ or for an extra POKYNY point. It has no point type and no bullets. Approving it only approves it; the headmaster's tools (M9) place it into the document. |
| vyjádření | `statement` | A quoted statement by a participant, with its speaker. At least one is mandatory per report. The speaker's name is written in the genitive. |
| účast | participants bullet | The list of people who took part („účast studentů: …“). |
| areál | `campus` | School site: Smíchov, Radlice, Na Vidouli, or elsewhere. |
| Přítomni / Hosté | `presentText` / `guestsText` | Attendees and guests of the meeting. Typed by the headmaster. |
| Příloha 1 | `annex1` | Appendix listing students in the headmaster's talent programme. |
| Příloha 2 | `annex2` | Optional free-form appendix. |
| uvolnění z výuky | `point4` registry lists | Students exempted from a subject based on certificates or exams (point 4). |
| registr | `registry` | Named student lists that feed Příloha 1 and point 4. |
| trvalý / jednorázový | `standing` / `once` | Whether a POKYNY item carries over to the next issue. |
| uzávěrka | `deadline` | Submission deadline for an issue (default Sunday 18:00). It is fixed when the issue row is created, so a deadline already shown never moves. A point handed in after it goes to the next meeting whose deadline is still ahead. |
| porada se nekoná | `issue` status `skipped` | A meeting the headmaster cancelled. Its points go to the next meeting; „Porada se koná“ undoes it. |
| dříve použité osoby | `people.recent` | People the author already put into their own recent points, offered again with their salutation, class and genitive. Nobody else sees them, and there is no separate list. |
| školní rok | `schoolYear` | School year, e.g. „2026/2027“. Switches on 1 September. |
| ředitel | `headmaster` role | Full administrator. The only role that generates the document. |
| kontrolor | `reviewer` role | Approves, edits, returns or rejects submitted points. |
| přispěvatel | `submitter` role | An allow-listed user who may file points. |
| žádost o přístup | `accessRequest` | A signed-in user's request for the submitter role, with a free-text reason that only the headmaster sees. |
| student | `isStudent` | Flag on a user. A student may only be `pending` or `submitter`. |
| bez přístupu | `pending` role | The role of a new account: it sees nothing until a request is approved or access is granted by hand. |
| zablokovaný účet | `status` `blocked` | An account that cannot sign in. Not the same as blocking further access requests. |
| ověření totožnosti | step-up | A fresh Entra sign-in (no older than 10 minutes) required before changing users or starting „Nový školní rok“. |
| 2. pád | `genitive` | The genitive case used in „vyjádření pana Johna Doe“. |
| oslovení | `salutation` | pan / paní / slečna. |
