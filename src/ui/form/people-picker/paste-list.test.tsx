import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PASTE_MAX_CHARS, type PasteResult } from '@/domain/cs';
import { calDate } from '@/domain/time';
import { people } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { PeopleField } from './PeopleField';
import { PastePreview } from './PastePreview';
import { PASTE_INPUT_CEILING, pickRow, previewOf, type Preview } from './paste-state';

const NBSP = '\u00A0';
const { paste } = people;
const LABEL = 'Přidat osobu';
const LIST = 'Přidané osoby';

const RESULT: PasteResult = {
  rows: [
    {
      line: 1,
      source: 'Jana Nováková 3.B',
      givenName: 'Jana',
      familyName: 'Nováková',
      affiliation: '3.B',
      uncertainOrder: false,
    },
    {
      line: 2,
      source: 'Zdislav Hruška',
      givenName: 'Zdislav',
      familyName: 'Hruška',
      uncertainOrder: true,
    },
  ],
  rejected: [
    { line: 3, code: 'no-surname', source: 'Marie' },
    { line: 5, code: 'too-long', source: 'Dlouhé' },
  ],
  truncated: false,
};

const table = (preview: Preview = previewOf(RESULT)) =>
  renderToStaticMarkup(<PastePreview preview={preview} onPreview={() => {}} onAdd={() => {}} />);

/** The `<tr>` of the body that holds `text`. */
const rowWith = (html: string, text: string) =>
  html.split('<tr').find((tr) => tr.includes(text)) ?? '';

describe('the preview of a pasted list', () => {
  it('is a table with a caption and column headers', () => {
    const html = table();
    expect(html).toMatch(new RegExp(`<caption[^>]*>${paste.caption}</caption>`));
    for (const header of Object.values(paste.columns)) {
      expect(html).toContain(`<th scope="col"`);
      expect(html).toContain(`>${header}</th>`);
    }
    expect(html.match(/<th scope="col"/g)).toHaveLength(4);
    expect(html.match(/<tbody>.*<\/tbody>/s)?.[0].match(/<tr[ >]/g)).toHaveLength(2);
  });

  it('starts a doubtful row unchecked and says why, and a certain row checked', () => {
    const html = table();
    const doubtful = rowWith(html, 'Zdislav Hruška');
    expect(doubtful).not.toContain('checked');
    expect(doubtful).toContain(paste.doubt);
    const certain = rowWith(html, 'Jana Nováková');
    expect(certain).toMatch(/<input[^>]* checked/);
    expect(certain).not.toContain(paste.doubt);
  });

  it('offers the swap only on the doubtful row', () => {
    const html = table();
    expect(rowWith(html, 'Zdislav Hruška')).toContain(paste.swap);
    expect(rowWith(html, 'Jana Nováková')).not.toContain(paste.swap);
    expect(html.match(new RegExp(paste.swap, 'g'))).toHaveLength(2); // visible text, aria-label
  });

  it('names every control by the line as typed', () => {
    const html = table();
    expect(html).toContain(`aria-label="${paste.pickLabel('Jana Nováková 3.B')}"`);
    expect(html).toContain(`aria-label="${paste.salutationLabel('Zdislav Hruška')}"`);
    expect(html).toContain(`aria-label="${paste.swapLabel('Zdislav Hruška')}"`);
  });

  it('shows the reading with its class, and a select with the empty choice and the three salutations', () => {
    const certain = rowWith(table(), 'Jana Nováková');
    expect(certain).toContain('Jana Nováková (3.B)');
    const select = /<select[^>]*>(.*?)<\/select>/s.exec(certain)?.[1] ?? '';
    expect(select.match(/<option/g)).toHaveLength(4);
    expect(select).toContain(`<option value="" selected="">${people.chips.editor.none}</option>`);
    for (const label of ['pan', 'paní', 'slečna']) expect(select).toContain(`>${label}</option>`);
  });

  it('lists the rejected lines with their line and reason', () => {
    const html = table();
    expect(html).toContain(paste.rejected.title);
    expect(html).toContain(`${paste.rejected.line(3)}`);
    expect(html).toContain(paste.rejected.reason['no-surname']);
    expect(html).toContain(paste.rejected.line(5));
    expect(html).toContain(paste.rejected.reason['too-long']);
    expect(html).toContain('Marie');
  });

  it('adds the checked rows: the count is in the button, and at zero the button is disabled', () => {
    const html = table();
    expect(html).toContain(`>${paste.add(1)}</button>`);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Přidat vybrané/);
    const more = table(pickRow(previewOf(RESULT), 2, true));
    expect(more).toContain(`>${paste.add(2)}</button>`);
    const none = table(pickRow(previewOf(RESULT), 1, false));
    expect(none).toMatch(/<button[^>]*disabled=""[^>]*>Přidat vybrané \(0\)<\/button>/);
  });

  it('offers the bulk setter for the rows still without a salutation', () => {
    const html = table();
    expect(html).toMatch(/role="group" aria-labelledby="([^"]+)"[^>]*><span id="\1"[^>]*>/);
    expect(html).toContain(`>${paste.bulk.label}</span>`);
    expect(html).toContain(`aria-label="${paste.bulk.setLabel('paní')}"`);
  });

  it('says when the text was cut, and not otherwise', () => {
    expect(table()).not.toContain(paste.truncated);
    expect(table(previewOf({ ...RESULT, truncated: true }))).toContain(paste.truncated);
  });

  it('says so when it found nobody and rejected nothing', () => {
    const html = table(previewOf({ rows: [], rejected: [], truncated: false }));
    expect(html).toContain(paste.nothing);
    expect(html).not.toContain('<table');
  });

  it('makes every button a plain button, and no control carries a name', () => {
    const html = table();
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(3);
    for (const button of buttons) expect(button).toContain('type="button"');
    expect(html).not.toMatch(/\sname=/);
  });

  it('renders markup the CSP accepts', () => {
    const html = table();
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('the paste list in a people field', () => {
  const field = () =>
    renderToStaticMarkup(
      <PeopleField
        label={LABEL}
        listLabel={LIST}
        value={[]}
        onChange={() => {}}
        today={calDate(2026, 10, 27)}
        recents={[]}
        directory="off"
      />,
    );
  const pasteMarkup = (html: string) => /<details.*<\/details>/s.exec(html)?.[0] ?? '';

  it('is a details with the summary „Vložit seznam“', () => {
    const html = pasteMarkup(field());
    expect(html).toMatch(/<details[^>]*><summary[^>]*>.*Vložit seznam<\/summary>/);
    expect(html).not.toMatch(/<details[^>]* open/);
  });

  it('has a labelled textarea that lets the parser see the overflow, with the limits in a hint', () => {
    const html = pasteMarkup(field());
    const textarea = /<textarea[^>]*>/.exec(html)?.[0] ?? '';
    // A cap at 4000 would cut a name before the parser could drop it whole and say so.
    expect(textarea).toContain(`maxLength="${PASTE_INPUT_CEILING}"`);
    expect(PASTE_INPUT_CEILING).toBeGreaterThanOrEqual(2 * PASTE_MAX_CHARS);
    const id = /id="([^"]+)"/.exec(textarea)?.[1] ?? '';
    expect(html).toContain(`<label for="${id}"`);
    expect(html).toContain(`>${paste.label}</label>`);
    expect(textarea).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain(paste.hint);
    expect(paste.hint).toContain(`60${NBSP}řádků`);
    expect(paste.hint).toContain(`4000${NBSP}znaků`);
  });

  it('shows no preview before „Zkontrolovat“, and that button is a plain one', () => {
    const html = pasteMarkup(field());
    expect(html).not.toContain('<table');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Zkontrolovat<\/button>/);
  });

  it('carries no name, no style and only plain buttons, so a form around the field sends nothing from it', () => {
    const html = pasteMarkup(field());
    expect(html).not.toMatch(/\sname=/);
    expect(html).not.toContain('style=');
    for (const button of html.match(/<button[^>]*>/g) ?? [])
      expect(button).toContain('type="button"');
  });

  it('adds nothing to the field’s live regions', () => {
    expect(field().match(/role="status"/g)).toHaveLength(2);
  });
});
