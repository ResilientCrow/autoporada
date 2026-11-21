# 0077 — Participants from a spreadsheet

Adds to ADR 0060 (Účastníci are free text) and ADR 0066 (the browser reads a
file and keeps nothing of it).

## Context

The participants of an akce are often a class list the author already has:
an export from the school's information system or a sheet kept in Excel.
Typing twenty names with their classes into Účastníci is slow and invites
typos. The field is free text printed as typed (ADR 0060), its people are
labelled as one group (ADR 0071) and it holds at most
`POINT_LIMITS.participants` (2000) characters.

## Decision

1. **The browser turns a spreadsheet into text, nothing else.** The „kdo“
   step of the akce and jednání wizard has „Načíst jména ze souboru“ under
   Účastníci. The file is read in the browser by a lazy chunk
   (`arch/core/import/participants.ts` with `sheet`, `xlsx`, `ods`, `csv`);
   the result is appended to the field and saved by `future.save` like typed
   text. No route, column, contract or stored file is added.
2. **The format is found by content.** A zip with `xl/workbook.xml` is an
   `.xlsx` (workbook, relationships, shared strings and sheets read with jszip
   and `DOMParser`); a zip whose `mimetype` is
   `application/vnd.oasis.opendocument.spreadsheet` is an `.ods`
   (`content.xml`); any other file without a NUL byte is a CSV. A CSV is
   UTF-16 with a BOM, else UTF-8 (a BOM is dropped), else Windows-1250, as
   Czech Excel saves it; its separator is the one of `;`, tab and `,` used
   most outside quotes in the first ten lines, a tie going to `;`, unless an
   Excel `sep=` line names it. An old `.xls`, a document, a PDF, a picture,
   and text that starts with a tag (a web page or an Excel 2003 XML file
   saved as `.xls`) are refused with a sentence that asks for `.xlsx`, `.ods`
   or CSV. The file may be 5 MB, checked before it is read; a zip is checked
   by `zipguard` before anything inflates; XML with a DOCTYPE is refused (a
   spreadsheet never has one); every format, CSV included, is read to 100
   columns and 10 000 rows. Hidden sheets and rows hidden by hand or by a
   filter are left out. The first visible sheet that yields names is used.
3. **Columns by their header, else by their values.** Header words are
   compared without accents, case and punctuation: a cell with both „Jméno“
   and „Příjmení“ („Jméno a příjmení“, „Příjmení a jméno“) names the whole
   person, and so does a cell that is exactly „Celé jméno“, „Žák“, „Žákyně“,
   „Student“, „Účastník“, „Osoba“, „Jména“ or „Name“ (only the whole cell:
   Žák is also a surname); a cell with „Jméno“ (or „First name“) names the
   given name, one with „Příjmení“ (or „Last name“, „Surname“) the family
   name; one with „Třída“, or „Tř.“ or „Class“, the class. A header about
   someone else or a contact (zákonný zástupce, rodič, matka, otec, třídní
   učitel, kontaktní osoba, e-mail, telefon, adresa, in their usual forms)
   names nothing. Of the first ten rows that hold something, those naming a
   name column are candidates, and the header is the one naming the most
   columns, then the one with the most cells filled, then the first, so a
   title above it („Účastníci kurzu 2026“) is passed over. The first column
   of each kind wins, and a data row whose name is itself a header (a header
   repeated on every printed page, or the header under a title) is skipped. Separate given and family names print given name
   first, „Tereza Malá“, as the field's own example; one name column prints as
   the file has it, „Malá Tereza“ too, since splitting it would be a guess
   (compound surnames). A lone „Jméno“ or „Příjmení“ column is the whole
   name. Without a header, the first 200 rows decide: a column whose every
   value looks like a class (3.B, 3B, 1.IT) is the class, and the first run
   of at most three neighbouring columns of names (letters, no digits, no @)
   is joined in the order of the file.
4. **One entry per person.** An entry is the name, then „ (třída)“ when the
   row has a class: „Tereza Malá (3.B)“. Cells are cleaned like typed text
   (`clean`), and a comma inside a cell becomes a space, because a comma
   separates people (ADR 0063, 0071). A row whose name is empty, holds a digit
   or an @, or is over 100 characters, and a repeated entry, are left out.
5. **Appended, never cut.** Entries go after what is typed, „, “ between
   them. An entry equal to one already in the field (its comma-separated
   parts, cleaned) is not added again, and the editor says how many were
   added and how many were there. When the text would pass the limit, nothing
   is added and the editor says how long it would be: a list cut short would
   print as if it were whole. The group's address (ADR 0071) stays the
   author's choice.
6. **No new dependency.** jszip is already in the import chunk (ADR 0066);
   the readers are a few hundred lines with their tests.

## Consequences

- An author fills Účastníci from a class list in one step and edits the text
  as before. The wizard shows the text before it is sent, so a sheet read
  the wrong way is seen and fixed by hand.
- An `.xlsx` gives a number as stored, not as formatted, and a formula's last
  saved result; an `.ods` gives what the cell shows. Neither matters for
  names and classes.
- An old `.xls` must be saved as `.xlsx` or CSV first.

## Options rejected

- **SheetJS.** The version on npm (0.18.5) has known advisories, a prototype
  pollution (CVE-2023-30533) and a ReDoS (CVE-2024-22363), fixed only in
  releases published outside npm; it is hundreds of kilobytes and reads far
  more than a list of names needs.
- **Read the file on the server.** The browser already holds it and reads
  annexes itself; the file would cross the network for nothing.
- **Reorder a single name column to „Jméno Příjmení“.** Guessing where a
  surname ends.
- **Add as many names as fit.** A silently shortened list.
- **Ask which sheet and which columns.** More screen for a rare case; the
  author edits the text instead.
