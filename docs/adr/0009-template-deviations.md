# 0009 — Deliberate deviations from the Word template

Status: **Proposed**. The headmaster signs it off at the milestone M2
checkpoint, after comparing the generated replica with the template in
Microsoft Word.

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

Tick each box after checking it in Word.

### Layout

- [ ] **Příloha 1 table.** The "Jméno a příjmení | Třída" header repeats at the
      top of every column, so it is no longer typed by hand. No padding rows:
      the table ends after the last student. LibreOffice was confirmed to
      repeat the header at each column top. **Check in Word that it does too.**
- [ ] **Spacing between points.** Exactly one empty line after each point. In
      the template, points 6–9 had two.
- [ ] **Big section headings.** One extra empty line before INFORMACE Z
      HOSPODAŘENÍ and INFORMACE Z PROVOZU ŠKOLY, and two after every big
      heading. The template had one or two.
- [ ] **Hotel Voyager lists.** These use the same three list levels as point 5
      (o at 1068, o at 1788, ■ at 2345). The template had a separate, less
      indented list (720 / 1440).
- [ ] **Příloha 2** always starts on a new page.
- [ ] **Body paragraphs** have their first line at 708 and their other lines at
      the margin, everywhere. In the template, the first report used left 170
      + first line 538, and the placeholders under points 6–9 used a first
      line of 527.

### Empty parts

- [ ] **Left out when empty:**
  - points "Ohlasy … v médiích" and "Ohlasy sociálních partnerů";
  - the sections INFORMACE Z HOSPODAŘENÍ and INFORMACE Z PROVOZU ŠKOLY;
  - the point "Další doposud známé akce školy";
  - an exemption line in point 4 with no students;
  - Příloha 2.

  The blank template showed all of these with empty bullets.
- [ ] **Points 1 and 2 with nothing to list** say "zatím žádná" (meetings) or
      "zatím žádné" (events) instead of showing an empty bullet.

### Text

- [ ] **Typography.** A non-breaking space follows one-letter words (v, k, s,
      z, o, u, a, i). Non-breaking spaces also go inside dates ("12. října"),
      after titles ("Mgr. Jana") and after initials ("O. Novák"). Quotes are
      always Czech „…“: the template's partners line used “…”. A spaced hyphen
      becomes an en dash.
- [ ] **Times.** Bullets use "10:00–11:00"; prose uses "od 10.00 do 12.00
      hodin". Both styles appear in the template. Bullets for multi-day items
      show the dates only ("27.–29. 10. 2026"), no times.
- [ ] **Point 4.** The students follow the label on the same line: "Tomáš
      Černý (1.A), Eva Malá (2.B)". Students new since the last issue are bold.
- [ ] **Statement lines.** "- vyjádření pana … (1.A):" is bold italic as a
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
