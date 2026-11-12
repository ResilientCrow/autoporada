# Glossary

The UI and the generated document are Czech. Code identifiers are English,
except for a few domain terms that have no clean English equivalent. Those keep
their Czech name, without diacritics, so the code and the headmaster use the
same word.

| Czech (UI / document) | Code identifier | Meaning |
|---|---|---|
| Porada vedení školy | `issue` | One weekly meeting document. It belongs to a slot (a Monday) and has its own meeting date, which is the Monday unless the porada was moved. |
| slot | `monday`, `IssueSlot` | A porada Monday: the key of one porada in URLs, hand-in, mail keys and placement. A slot is stored, skipped, generated or virtual (not yet created). The slot never changes when the porada moves; the meeting date does. |
| datum porady | `meetingDate` | The day the meeting is held. The document's title, the agenda windows, the deadline and the reports that count all follow it. It is free: „Přesunout poradu“ sets it. |
| bod | `point` | A numbered item in the document („15). Seminář Matika Česku“). Before it is one, an author writes it as a draft, hands it in, and a reviewer approves, returns or rejects it. A reviewer sees it while it is handed in or decided, never as a draft (a retract hides it again). |
| POKYNY PRO ZAMĚSTNANCE, ORGANIZAČNÍ ZÁLEŽITOSTI | `pokyny` | Section 1: organisational instructions. Mostly standing content. |
| INFORMACE Z HOSPODAŘENÍ | `hospodareni` | Section 2: finances. Printed only when it has items. |
| INFORMACE Z PROVOZU ŠKOLY | `provoz` | Section 3: reports about past events. |
| zpráva / bod z provozu | `report` point | A report about an event that already happened. |
| pozdní zpráva | late report, `isLateReport` | A report on an event that ends after its porada's deadline but before the meeting day. It is due two hours after the event ends (20.00 if no end time), at most 00.00 of the meeting day, and goes to that porada. |
| jednání | `jednani` future item | An upcoming meeting. Listed in point 1. |
| akce | `akce` future item | An upcoming event, written by its author before it happens and reviewed like a point. Listed in point 2 or in the last PROVOZ point. An approved akce is visible to every signed-in user, students included, with its Organizátor, Účastníci and Poznámka (free text, as typed). An approved akce can be changed only by an explicit „Uložit změny“, which sends it for review again; a reviewer can cancel it. After it is over, its author is asked for a report. |
| chybějící zpráva | `report_placeholders`, `placeholderStatus` | The paragraph the document prints for an akce whose report was not handed in. The headmaster confirms it with „Zkontrolováno“. It is checked only while the confirmed original equals the system's current paragraph, so an edit of the akce or the headmaster's own save un-checks it. Status: checked, handed-in (a report waits for a decision), open (the author can still hand in) or to-check. |
| návrh | `proposal` (point kind `finance`, `pokyn`) | A proposal for an item in HOSPODAŘENÍ or for an extra POKYNY point. It has no point type and no bullets. Approving it only approves it; the headmaster places it in the porada's outline (M9), where it is appended to its section and marked „Nově schválený návrh“ until the headmaster moves it. |
| vyjádření | `statement` | A quoted statement by a participant, with its speaker. At least one is mandatory per report. The speaker's name is written in the genitive. |
| účast | participants bullet | The list of people who took part („účast studentů: …“). |
| areál | `campus` | School site: Smíchov, Radlice, Na Vidouli, or elsewhere. |
| Přítomni / Hosté | `presentText` / `guestsText` | Attendees and guests of the meeting. Typed by the headmaster. |
| Příloha 1 | `annex1` | Appendix listing students in the headmaster's talent programme. |
| Příloha 2 | `annex2` | Optional free-form appendix. |
| uvolnění z výuky | `point4` registry lists | Students exempted from a subject based on certificates or exams (point 4). |
| registr | `registry` | Named student lists that feed Příloha 1 and point 4. |
| trvalý / jednorázový | `standing` / `once` | Whether a POKYNY item carries over to the next issue. |
| osnova | outline, `issue_items` | The headmaster's list of items in POKYNY and HOSPODAŘENÍ for one porada, with the meetings, events and partners slots. Until the first write it is derived from the latest earlier porada that has one. |
| seznam v registru | registry list, `registry_lists` | One named list of students (Příloha 1, or a list of point 4). The headmaster adds, orders and archives lists; an entry is a given name, a family name and a class. |
| nový školní rok | `registry.newSchoolYear` | Archives the chosen registry lists for the school year that ends. The lists stay; entries never printed are deleted. |
| pravidlo uzávěrky | `DeadlineRule` | The setting that gives every uzávěrka: 1 to 4 days before the meeting date, at a time from 8.00 to 22.00 (default 2 days, 20.00). It applies when a porada's row is created, or to one nobody has seen. |
| uzávěrka | `deadline` | Submission deadline for an issue (default Saturday 20:00 for a Monday meeting: two days before the meeting date, counted back from it). It is fixed when the issue row is created, so a deadline already shown never moves. A point handed in after it goes to the next meeting whose deadline is still ahead. |
| porada se nekoná | `issue` status `skipped` | A meeting the headmaster cancelled, before or after its deadline. Its points go to the next meeting; „Porada se koná“ undoes it unless that breaks the meeting order. |
| přesunout poradu | `issues.move` | Moving a porada to another meeting date. The deadline follows by the rule (or is set by hand), and a slot in the way is skipped in the same step. |
| pořadí porad | `orderConflicts` | The rule that, among porady that are held, meeting dates and deadlines increase and every deadline is before its own meeting day. |
| dříve použité osoby | `people.recent` | People the author already put into their own recent points, offered again with their salutation, class and genitive. Nobody else sees them, and there is no separate list. |
| školní rok | `schoolYear` | School year, e.g. „2026/2027“. Switches on 1 September. |
| ředitel | `headmaster` role | Full administrator. The only role that generates the document. |
| vedení | `reviewer` role | A member of the school's leadership: approves, edits, returns or rejects submitted points, and may propose HOSPODAŘENÍ and POKYNY items. Shown as „Vedení“ (once „kontrolor“; ADR 0052). |
| přispěvatel | `submitter` role | An allow-listed user who may file points. |
| žádost o přístup | `accessRequest` | A signed-in user's request for the submitter role, with a free-text reason that only the headmaster sees. |
| student | `isStudent` | Flag on a user. A student may only be `pending` or `submitter`. |
| bez přístupu | `pending` role | The role of a new account: it sees nothing until a request is approved or access is granted by hand. |
| zablokovaný účet | `status` `blocked` | An account that cannot sign in. Not the same as blocking further access requests. |
| ověření totožnosti | step-up | A fresh Entra sign-in (no older than 10 minutes) required before changing users or starting „Nový školní rok“. |
| 2. pád | `genitive` | The genitive case used in „vyjádření pana Johna Doe“. |
| oslovení | `salutation` | pan / paní / slečna. |
