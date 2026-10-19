# 0009 — Deliberate deviations from the Word template

Status: **Accepted** on 2026-10-19. The headmaster compared the generated
replica with the template in Microsoft Word at the milestone M2 checkpoint
and found no further differences.

## Context

The blank template was edited by hand over years. It mixes indent schemes and
spacer paragraphs, and its Příloha 1 is one table padded with empty rows. A
generator needs one consistent rule for each element.

What stays exactly as in the template is pinned by the parity test against
`test/fixtures/template/format-facts.json`, and the test also checks the
template's SHA-256. It covers:

- page and margins, the default tab stop (708) and the two-column annex section;
- the body font and size, and the sizes of the title, big headings,
  „PŘÍLOHA n“ and the Příloha 1 heading;
- all numbering definitions, including the Symbol/Wingdings glyphs;
- the footer fields;
- the Příloha 1 table geometry.

Paragraph indents and paragraph-mark formatting are pinned by the golden
tests in `test/golden/`.

## Deviations to confirm at the checkpoint

Each box was ticked after checking it in Word.

### Layout

- [x] **Příloha 1 table.** The "Jméno a příjmení | Třída" header repeats at the
      top of every column, so it is no longer typed by hand. No padding rows:
      the table ends after the last student. LibreOffice and Word both
      repeat the header at each column top.
- [x] **Spacing between points.** Exactly one empty line after each point. In
      the template, points 6–9 had two.
- [x] **Big section headings.** One extra empty line before INFORMACE Z
      HOSPODAŘENÍ and INFORMACE Z PROVOZU ŠKOLY, and two after every big
      heading. The template had one or two.
- [x] **Hotel Voyager lists.** These use the same three list levels as point 5
      (o at 1068, o at 1788, ■ at 2345). The template had a separate, less
      indented list (720 / 1440).
- [x] **Příloha 2** always starts on a new page.
- [x] **Body paragraphs** have their first line at 708 and their other lines at
      the margin, everywhere. In the template, the first report used left 170
      + first line 538, and the placeholders under points 6–9 used a first
      line of 527.

### Empty parts

- [x] **Left out when empty:**
  - points "Ohlasy … v médiích" and "Ohlasy sociálních partnerů";
  - the sections INFORMACE Z HOSPODAŘENÍ and INFORMACE Z PROVOZU ŠKOLY;
  - the point "Další doposud známé akce školy";
  - an exemption line in point 4 with no students;
  - Příloha 2.

  The blank template showed all of these with empty bullets.
- [x] **Points 1 and 2 with nothing to list** say "zatím žádná" (meetings) or
      "zatím žádné" (events) instead of showing an empty bullet.

### Text

- [x] **Typography.** A non-breaking space follows one-letter words (v, k, s,
      z, o, u, a, i). Non-breaking spaces also go inside dates ("12. října"),
      after titles ("Mgr. Jana") and after initials ("O. Novák"). Quotes are
      always Czech „…“: the template's partners line used “…”. A spaced hyphen
      becomes an en dash.
- [x] **Agenda bullets (points 1, 2 and "Další doposud známé akce").** In the
      headmaster's format, confirmed at the checkpoint: "úterý 13. října 2026,
      7.00 až 14.00 hodin, areál Smíchov, Next Zone Event Space, akce Vaib, za
      Next Zone Event Space koordinuje absolvent pan Jan Absolon". Every part
      after the date is optional and separated by a comma. The responsible
      part has a verb (organizuje / koordinuje / zajišťuje / vede, agreeing in
      number), an optional "za …" and people with an optional role. Multi-day
      items read "20. až 22. října 2026, …" without times.
- [x] **People lists.** Confirmed at the checkpoint: neighbours in one
      salutation group who share a class write it once, "pánové Tomáš
      Černý, John Doe (oba 1.A)"; three or more take "(všichni 1.A)", and
      women "(obě …)" / "(všechny …)". A class shared by the whole list goes
      once at the end. Roles and jobs are never merged.

      A run keeps every class when its tail could be read as claiming a
      name with nothing in parentheses before it. A tail reaches back to
      the previous parenthesis, and "(obě …)" / "(všechny …)" skip men on
      the way. Within a group this always applies: "pánové Petr Dvořák, Jan
      Novák (3.B), Ivo Žák (3.B)". Across a group label it applies only to
      "(všichni …)" / "(všechny …)", because the label marks where a pair
      starts: "slečna Eva Malá, pánové Tomáš Černý, John Doe (oba 1.A)".
      With roles shown, the list is one group.

      Affiliations are printed as stored. "3M" or "1. LF" may be a company
      or a faculty, so the document never rewrites them. The forms
      normalise class codes on input instead ("1. a" becomes "1.A").
- [x] **Times in prose.** Report paragraphs use "od 10.00 do 12.00 hodin", as
      in the template.
- [x] **Point 4.** The students follow the label on the same line: "Tomáš
      Černý (1.A), Eva Malá (2.B)". Students new since the last issue are bold.
- [x] **Statement lines.** "- vyjádření pana … (1.A):" is bold italic as a
      whole, dash included. In the template the dash was sometimes only bold.

### Invisible in Word

These change the markup but not the printed result:

- The closing is two left-aligned paragraphs. The template used one
  justified paragraph with a tab and a line break.
- First-line indents are paragraph indents instead of leading tab
  characters.
- Every section break sits in an empty paragraph of its own, as in the
  template. The footer fields carry a cached value ("1") that Word and
  LibreOffice replace when they lay the page out.

### PDF only

- Without licensed fonts on the server, the PDF uses Liberation Serif for
  Times New Roman, Liberation Mono for Courier New, OpenSymbol for the
  Symbol/Wingdings bullets and PT Sans Narrow for Aptos Narrow. Line breaks
  match because the metrics are compatible. The **DOCX is always the
  canonical file.**

## Decision

Once ticked, each deviation becomes the rule and is pinned by the golden tests
in `test/golden/`. A deviation the headmaster rejects goes back into the
compose or renderer code, and its golden is updated in the same commit.
