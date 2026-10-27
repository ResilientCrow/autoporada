import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { RecentPerson } from '@/domain/people';
import type { DraftPerson } from '@/domain/report';
import { calDate } from '@/domain/time';
import { people } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import type { Chip } from './chips-state';
import { ChipEditor } from './ChipEditor';
import { PeopleField } from './PeopleField';

const TODAY = calDate(2026, 10, 27);
const NBSP = '\u00A0';

const CHIPS: readonly Chip[] = [
  { key: 'a', person: { salutation: 'pani', givenName: 'Jana', familyName: 'Nováková' } },
  { key: 'b', person: { salutation: null, givenName: 'Petr', familyName: 'Novák' } },
  {
    key: 'c',
    person: {
      salutation: 'pan',
      titlesBefore: 'Mgr.',
      givenName: 'Karel',
      familyName: 'Dvořák',
      affiliation: '3.B',
      affiliationYear: '2025/2026',
    },
  },
];

const LABEL = 'Přidat osobu';
const LIST = 'Přidané osoby';
const RECENTS: readonly RecentPerson[] = [];

const field = (value: readonly Chip[] = CHIPS) =>
  renderToStaticMarkup(
    <PeopleField
      label={LABEL}
      listLabel={LIST}
      value={value}
      onChange={() => {}}
      today={TODAY}
      recents={RECENTS}
      directory="off"
    />,
  );

describe('PeopleField on the server', () => {
  it('renders markup the CSP accepts', () => {
    const html = field();
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('lists the chips as a compact ul of li, named, never a tag group or grid', () => {
    const html = field();
    const list = /<ul [^>]*>/.exec(html)?.[0] ?? '';
    expect(list).toContain(`aria-label="${LIST}"`);
    expect(html.match(/<li[ >]/g)).toHaveLength(3);
    expect(html).not.toMatch(/role="(grid|gridcell|row|rowgroup|listbox|option)"/);
    expect(html).not.toMatch(/role="(group|grid)"[^>]*data-rac/);
    expect(html.match(/<ul[ >]/g)).toHaveLength(1);
  });

  it('names the person on both buttons of every row, whatever the title', () => {
    const html = field();
    expect(html).toContain(`aria-label="${people.chips.editLabel('Jana Nováková')}"`);
    expect(html).toContain(`aria-label="${people.chips.removeLabel('Jana Nováková')}"`);
    expect(html).toContain(`aria-label="${people.chips.editLabel('Karel Dvořák')}"`);
    expect(html).toContain(`aria-label="${people.chips.removeLabel('Petr Novák')}"`);
    // The visible name has the title; the buttons keep their short text.
    expect(html).toContain('Mgr. Karel Dvořák');
    expect(html.match(new RegExp(`>${people.chips.edit}</button>`, 'g'))).toHaveLength(3);
    expect(html.match(new RegExp(`>${people.chips.remove}</button>`, 'g'))).toHaveLength(3);
  });

  it('puts the name after a colon in the buttons’ names, so it stays in the nominative', () => {
    const html = field();
    expect(html).toContain('aria-label="Upravit: Jana Nováková"');
    expect(html).toContain('aria-label="Odebrat: Petr Novák"');
  });

  it('shows each flag as text, with an icon that screen readers skip', () => {
    const html = field();
    expect(html.match(new RegExp(people.chips.flag.salutation, 'g'))).toHaveLength(1);
    expect(html.match(new RegExp(people.chips.flag.class, 'g'))).toHaveLength(1);
    expect(html).toMatch(/<svg aria-hidden="true"[^>]*>.*?<\/svg>[^<]*<span>Zvolte oslovení/s);
  });

  it('keeps the editor closed on the server', () => {
    const html = field();
    expect(html).not.toContain(people.chips.editor.done);
    expect(html).toContain('aria-expanded="false"');
  });

  it('draws no list for no chips', () => {
    expect(field([])).not.toContain('<ul');
  });

  it('offers no bulk salutation for people that were already there', () => {
    expect(field()).not.toContain(people.chips.bulk.label);
  });

  it('has one search box and exactly two status regions: the directory notice and the announcements', () => {
    const html = field();
    expect(html.match(/role="combobox"/g)).toHaveLength(1);
    expect(html.match(/role="status"/g)).toHaveLength(2);
    expect(html).toContain('<div data-live-announcer="true"><div role="status"></div></div>');
  });

  it('says the copy of the design, word for word', () => {
    expect(people.chips.edit).toBe('Upravit');
    expect(people.chips.remove).toBe('Odebrat');
    expect(people.chips.flag).toEqual({ salutation: 'Zvolte oslovení', class: 'ověřte třídu' });
    expect(people.chips.bulk.label).toBe('Všem nastavit oslovení:');
    expect(people.chips.bulk.done(2)).toBe(`Oslovení nastaveno: 2${NBSP}osoby.`);
    expect(people.chips.editor).toMatchObject({
      salutation: 'Oslovení',
      affiliation: 'Třída nebo organizace',
      classValid: 'Třída platí',
      up: 'Nahoru',
      down: 'Dolů',
      done: 'Hotovo',
    });
    expect(people.chips.removed('Jana Nováková', 2)).toBe(
      `Odebráno: Jana Nováková. Celkem: 2${NBSP}osoby.`,
    );
    expect(people.chips.moved('Jana Nováková', 1, 3)).toBe(`Jana Nováková, pozice 1 z${NBSP}3.`);
  });
});

const editor = (person: DraftPerson) =>
  renderToStaticMarkup(
    <ChipEditor
      id="editor-a"
      person={person}
      issues={null}
      register={() => () => {}}
      onPatch={() => {}}
      onSettleClass={() => {}}
      onConfirmClass={() => {}}
      onMove={() => {}}
      onDone={() => {}}
    />,
  );

describe('ChipEditor on the server', () => {
  const karel = CHIPS[2]!.person;

  it('is a group named after the person, after a colon', () => {
    const html = editor(karel);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Úprava: Karel Dvořák"');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('has the six fields, Třída platí for a person with a class, and the three buttons', () => {
    const html = editor(karel);
    for (const label of ['salutation', 'affiliation', 'givenName', 'familyName'] as const) {
      expect(html).toContain(people.chips.editor[label]);
    }
    expect(html).toContain(people.chips.editor.titlesBefore);
    expect(html).toContain(people.chips.editor.titlesAfter);
    for (const label of ['classValid', 'up', 'down', 'done'] as const) {
      expect(html).toContain(`>${people.chips.editor[label]}</button>`);
    }
    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html.match(/<input/g)).toHaveLength(5);
  });

  it('offers Třída platí only for a person that has a class', () => {
    expect(editor(CHIPS[0]!.person)).not.toContain(people.chips.editor.classValid);
  });

  it('offers the three salutations and an empty choice, the person’s own selected', () => {
    const html = editor(karel);
    expect(html.match(/<option/g)).toHaveLength(4);
    expect(html).toMatch(/<option value="pan" selected="">pan<\/option>/);
    expect(editor(CHIPS[1]!.person)).toMatch(/<option value="" selected="">Nezvoleno<\/option>/);
  });
});
