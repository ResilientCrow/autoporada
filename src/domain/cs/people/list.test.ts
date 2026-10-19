import { describe, expect, it } from 'vitest';

import { renderPeople, withAffiliation, type Person } from '../index';

const p = (
  salutation: Person['salutation'],
  givenName: string,
  familyName: string,
  affiliation?: string,
  titlesBefore?: string,
): Person => ({
  salutation,
  givenName,
  familyName,
  ...(affiliation && { affiliation }),
  ...(titlesBefore && { titlesBefore }),
});

const participants = { join: 'comma', order: 'class-surname' } as const;
const organisers = { join: 'and', order: 'input', compress: true } as const;
const NB = '\u00A0';

describe('participant lists', () => {
  it.each([
    [[p('slecna', 'Eva', 'Malá', '1.A')], 'slečna Eva Malá (1.A)'],
    [
      [p('slecna', 'Eva', 'Malá', '1.A'), p('slecna', 'Lucie', 'Králová', '2.B')],
      'slečny Eva Malá (1.A), Lucie Králová (2.B)',
    ],
    [
      [p('pan', 'John', 'Doe', '1.A'), p('pan', 'Petr', 'Dvořák', '3.C')],
      'pánové John Doe (1.A), Petr Dvořák (3.C)',
    ],
    [
      [
        p('pani', 'Jana', 'Nováková', undefined, 'Mgr.'),
        p('pani', 'Petra', 'Malá', undefined, 'Ing.'),
      ],
      'paní Ing. Petra Malá, Mgr. Jana Nováková',
    ],
  ])('%#: %s', (people, text) => {
    expect(renderPeople(people, participants)).toBe(text);
  });

  it('groups slečny, then paní, then pánové, whatever the input order', () => {
    const mixed = [
      p('pan', 'John', 'Doe', '1.A'),
      p('slecna', 'Eva', 'Malá', '2.B'),
      p('pan', 'Jan', 'Novák', '2.A'),
    ];
    expect(renderPeople(mixed, participants)).toBe(
      'slečna Eva Malá (2.B), pánové John Doe (1.A), Jan Novák (2.A)',
    );
  });

  it('sorts each group by class, then surname', () => {
    const boys = [
      p('pan', 'Jan', 'Žák', '2.A'),
      p('pan', 'Petr', 'Novák', '1.B'),
      p('pan', 'Adam', 'Čermák', '1.B'),
    ];
    expect(renderPeople(boys, participants)).toBe(
      `pánové Adam Čermák, Petr Novák (oba${NB}1.B), Jan Žák (2.A)`,
    );
  });

  it('writes neighbours from one class with the class once (checkpoint M2)', () => {
    const people = [
      p('slecna', 'Eva', 'Malá', '2.B'),
      p('pan', 'Tomáš', 'Černý', '1.A'),
      p('pan', 'John', 'Doe', '1.A'),
    ];
    expect(renderPeople(people, participants)).toBe(
      `slečna Eva Malá (2.B), pánové Tomáš Černý, John Doe (oba${NB}1.A)`,
    );
  });

  it.each([
    [
      [
        p('pan', 'Adam', 'A', '1.A'),
        p('pan', 'Bořek', 'B', '1.A'),
        p('pan', 'Cyril', 'C', '1.A'),
        p('slecna', 'Dana', 'D', '2.B'),
      ],
      `slečna Dana D (2.B), pánové Adam A, Bořek B, Cyril C (všichni${NB}1.A)`,
    ],
    [
      [
        p('slecna', 'Alena', 'A', '1.A'),
        p('slecna', 'Běla', 'B', '1.A'),
        p('slecna', 'Cecílie', 'C', '2.B'),
      ],
      `slečny Alena A, Běla B (obě${NB}1.A), Cecílie C (2.B)`,
    ],
    [
      [
        p('slecna', 'Alena', 'A', '1.A'),
        p('slecna', 'Běla', 'B', '1.A'),
        p('slecna', 'Cecílie', 'C', '1.A'),
        p('pan', 'Dan', 'D', '3.C'),
      ],
      `slečny Alena A, Běla B, Cecílie C (všechny${NB}1.A), pan Dan D (3.C)`,
    ],
    [
      [
        p('slecna', 'Eva', 'Malá', '1.A'),
        p('pan', 'Tomáš', 'Černý', '1.A'),
        p('pan', 'John', 'Doe', '1.A'),
      ],
      `slečna Eva Malá, pánové Tomáš Černý, John Doe (všichni${NB}1.A)`,
    ],
    [
      [p('pani', 'Jana', 'Bílá', 'učitelka fyziky'), p('pani', 'Eva', 'Malá', 'učitelka fyziky')],
      'paní Jana Bílá (učitelka fyziky), Eva Malá (učitelka fyziky)',
    ],
  ])('compresses only class runs: %#', (people, text) => {
    expect(renderPeople(people, participants)).toBe(text);
  });

  it('compresses only neighbours in a ranked order', () => {
    const podium = [
      p('pan', 'Adam', 'A', '1.A'),
      p('pan', 'Bořek', 'B', '2.B'),
      p('pan', 'Cyril', 'C', '1.A'),
    ];
    expect(renderPeople(podium, { join: 'comma', order: 'input' })).toBe(
      'pánové Adam A (1.A), Bořek B (2.B), Cyril C (1.A)',
    );
  });

  it('keeps a ranked order when asked to (results, jury)', () => {
    const podium = [p('pan', 'Jan', 'Žák', '2.A'), p('pan', 'Adam', 'Čermák', '1.B')];
    expect(renderPeople(podium, { join: 'comma', order: 'input' })).toBe(
      'pánové Jan Žák (2.A), Adam Čermák (1.B)',
    );
  });

  it('honours a custom group order', () => {
    const two = [p('slecna', 'Eva', 'Malá'), p('pan', 'Jan', 'Novák')];
    expect(renderPeople(two, { join: 'comma', groupOrder: ['pan', 'pani', 'slecna'] })).toBe(
      'pan Jan Novák, slečna Eva Malá',
    );
  });

  it('never drops or repeats anyone, whatever group order it is given', () => {
    const three = [p('slecna', 'Eva', 'Malá'), p('pan', 'Jan', 'Novák'), p('pani', 'Jana', 'Bílá')];
    expect(renderPeople(three, { join: 'comma', groupOrder: ['pan'] })).toBe(
      'pan Jan Novák, slečna Eva Malá, paní Jana Bílá',
    );
    expect(
      renderPeople(three, { join: 'comma', groupOrder: ['pan', 'pan', 'pani', 'slecna'] }),
    ).toBe('pan Jan Novák, paní Jana Bílá, slečna Eva Malá');
  });

  it('renders nothing for nobody', () => {
    expect(renderPeople([], participants)).toBe('');
  });
});

describe('affiliations as stored', () => {
  it.each([
    [[p('pani', 'Jana', 'Bílá', '3M', 'Ing.')], 'paní Ing. Jana Bílá (3M)'],
    [[p('pani', 'Jana', 'Bílá', 'TU 1.A', 'Mgr.')], 'paní Mgr. Jana Bílá (TU 1.A)'],
    [[p('pani', 'Jana', 'Bílá', ' učitelka fyziky ')], 'paní Jana Bílá (učitelka fyziky)'],
    [
      [p('pan', 'Adam', 'A', '1.A'), p('pan', 'Bořek', 'B', '1a')],
      'pánové Adam A (1.A), Bořek B (1a)',
    ],
    [
      [p('pan', 'Adam', 'A', ' 2.B '), p('pan', 'Bořek', 'B', '2.B')],
      `pánové Adam A, Bořek B (oba${NB}2.B)`,
    ],
  ])('never rewrites what the form stored: %#', (people, text) => {
    expect(renderPeople(people, { join: 'comma', order: 'input' })).toBe(text);
  });

  it.each([
    [' Next Zone ', 'X (Next Zone)'],
    ['3M', 'X (3M)'],
    ['  ', 'X'],
    [undefined, 'X'],
  ])('withAffiliation(%j)', (affiliation, text) => {
    expect(withAffiliation('X', affiliation)).toBe(text);
  });
});

describe('people with roles', () => {
  it('names each person on their own, role first', () => {
    const graduate = { ...p('pan', 'Jan', 'Novák'), role: 'absolvent' };
    const teacher = { ...p('pani', 'Jana', 'Bílá'), role: 'učitelka' };
    expect(renderPeople([graduate], organisers)).toBe('absolvent pan Jan Novák');
    expect(renderPeople([graduate, teacher], organisers)).toBe(
      'absolvent pan Jan Novák a učitelka paní Jana Bílá',
    );
  });
});

describe('organiser phrases', () => {
  it.each([
    [
      [p('slecna', 'Eva', 'Malá', '3.B'), p('pan', 'Jan', 'Novák', '3.B')],
      `slečna Eva Malá a pan Jan Novák (oba${NB}3.B)`,
    ],
    [
      [p('slecna', 'Eva', 'Malá', '3.B'), p('slecna', 'Lucie', 'Králová', '3.B')],
      `slečny Eva Malá a Lucie Králová (obě${NB}3.B)`,
    ],
    [
      [p('pan', 'Adam', 'A', '2.A'), p('pan', 'Bořek', 'B', '2.A'), p('pan', 'Cyril', 'C', '2.A')],
      `pánové Adam A, Bořek B a Cyril C (všichni${NB}2.A)`,
    ],
    [
      [
        p('slecna', 'Alena', 'A', '2.A'),
        p('pani', 'Běla', 'B', '2.A'),
        p('slecna', 'Cecílie', 'C', '2.A'),
      ],
      `slečny Alena A, Cecílie C a paní Běla B (všechny${NB}2.A)`,
    ],
    [
      [p('pan', 'Jan', 'Novák', '1.A'), p('pani', 'Jana', 'Bílá', 'učitelka')],
      'paní Jana Bílá (učitelka) a pan Jan Novák (1.A)',
    ],
    [[p('pan', 'Jan', 'Novák', '1.A')], 'pan Jan Novák (1.A)'],
    [
      [p('pani', 'Jana', 'Bílá', 'učitelka fyziky'), p('pani', 'Eva', 'Malá', 'učitelka fyziky')],
      'paní Jana Bílá (učitelka fyziky) a Eva Malá (učitelka fyziky)',
    ],
  ])('%#: %s', (people, text) => {
    expect(renderPeople(people, organisers)).toBe(text);
  });
});
