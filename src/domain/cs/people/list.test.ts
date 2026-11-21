import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { formatName, renderPeople, SALUTATION, withAffiliation, type Person } from '../index';

const p = (
  salutation: Person['salutation'],
  givenName: string,
  familyName: string,
  affiliation?: string,
): Person => ({
  salutation,
  givenName,
  familyName,
  ...(affiliation && { affiliation }),
});

const participants = { join: 'comma', order: 'class-surname' } as const;
const organisers = { join: 'and', order: 'input' } as const;
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
    [[p('pani', 'Jana', 'Nováková'), p('pani', 'Petra', 'Malá')], 'paní Petra Malá, Jana Nováková'],
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

describe('next to a name with no class', () => {
  it.each([
    [
      [
        p('pan', 'Petr', 'Dvořák'),
        p('pan', 'Jan', 'Novák', '3.B'),
        p('pan', 'Ivo', 'Žák', '3.B'),
        p('pan', 'Adam', 'Malý', '3.B'),
      ],
      'pánové Petr Dvořák, Jan Novák (3.B), Ivo Žák (3.B) a Adam Malý (3.B)',
    ],
    [
      [p('pan', 'Petr', 'Dvořák'), p('pan', 'Jan', 'Novák', '3.B'), p('pan', 'Ivo', 'Žák', '3.B')],
      'pánové Petr Dvořák, Jan Novák (3.B) a Ivo Žák (3.B)',
    ],
    [
      [
        p('slecna', 'Eva', 'Malá'),
        p('pan', 'Petr', 'Dvořák'),
        p('pan', 'Jan', 'Novák', '3.B'),
        p('pan', 'Ivo', 'Žák', '3.B'),
      ],
      'slečna Eva Malá, pánové Petr Dvořák, Jan Novák (3.B) a Ivo Žák (3.B)',
    ],
  ])('keeps every class of a run right after it in its group: %#', (people, text) => {
    expect(renderPeople(people, organisers)).toBe(text);
  });

  it('lets a group label mark where a pair starts (checkpoint M2)', () => {
    const people = [
      p('slecna', 'Eva', 'Malá'),
      p('pan', 'Tomáš', 'Černý', '1.A'),
      p('pan', 'John', 'Doe', '1.A'),
    ];
    expect(renderPeople(people, participants)).toBe(
      `slečna Eva Malá, pánové Tomáš Černý, John Doe (oba${NB}1.A)`,
    );
    const women = [
      p('slecna', 'Eva', 'Malá'),
      p('pani', 'Alena', 'A', '2.B'),
      p('pani', 'Běla', 'B', '2.B'),
    ];
    expect(renderPeople(women, participants)).toBe(
      `slečna Eva Malá, paní Alena A, Běla B (obě${NB}2.B)`,
    );
  });

  it('does not let „(všichni …)“ reach back over a group label', () => {
    const people = [
      p('pani', 'Jana', 'Nováková'),
      p('pan', 'Adam', 'A', '1.A'),
      p('pan', 'Bořek', 'B', '1.A'),
      p('pan', 'Cyril', 'C', '1.A'),
    ];
    expect(renderPeople(people, participants)).toBe(
      'paní Jana Nováková, pánové Adam A (1.A), Bořek B (1.A), Cyril C (1.A)',
    );
    expect(
      renderPeople([{ ...people[0]!, affiliation: '1.A' }, ...people.slice(1)], participants),
    ).toBe(`paní Jana Nováková, pánové Adam A, Bořek B, Cyril C (všichni${NB}1.A)`);
    const women = [
      p('slecna', 'Eva', 'Malá'),
      p('pani', 'Alena', 'A', '2.B'),
      p('pani', 'Běla', 'B', '2.B'),
      p('pani', 'Cecílie', 'C', '2.B'),
    ];
    expect(renderPeople(women, participants)).toBe(
      'slečna Eva Malá, paní Alena A (2.B), Běla B (2.B), Cecílie C (2.B)',
    );
  });

  it('keeps every class of a pair of women right after a bare woman', () => {
    const people = [
      p('slecna', 'Eva', 'Malá'),
      p('slecna', 'Alena', 'A', '2.B'),
      p('slecna', 'Běla', 'B', '2.B'),
    ];
    expect(renderPeople(people, { join: 'comma', order: 'input' })).toBe(
      'slečny Eva Malá, Alena A (2.B), Běla B (2.B)',
    );
  });

  it('lets „všechny“ reach past a bare man to a bare woman', () => {
    const responsible = [
      { ...p('slecna', 'Eva', 'Malá'), role: 'absolventka' },
      { ...p('pan', 'Jan', 'Novák'), role: 'učitel' },
      p('slecna', 'Alena', 'A', '2.B'),
      p('slecna', 'Běla', 'B', '2.B'),
      p('slecna', 'Cecílie', 'C', '2.B'),
    ];
    expect(renderPeople(responsible, organisers)).toBe(
      'absolventka slečna Eva Malá, učitel pan Jan Novák, slečna Alena A (2.B), slečna Běla B (2.B) a slečna Cecílie C (2.B)',
    );
    const grouped = [
      p('pani', 'Jana', 'Bílá'),
      p('pan', 'Jan', 'Novák'),
      p('slecna', 'Alena', 'A', '2.B'),
      p('slecna', 'Běla', 'B', '2.B'),
      p('slecna', 'Cecílie', 'C', '2.B'),
    ];
    expect(renderPeople(grouped, { ...participants, groupOrder: ['pani', 'pan'] })).toBe(
      'paní Jana Bílá, pan Jan Novák, slečny Alena A (2.B), Běla B (2.B), Cecílie C (2.B)',
    );
  });

  it('knows that „obě“ and „všechny“ never count a man', () => {
    const afterMan = [
      p('pan', 'Jan', 'Novák'),
      p('slecna', 'Alena', 'A', '2.B'),
      p('slecna', 'Běla', 'B', '2.B'),
      p('slecna', 'Cecílie', 'C', '2.B'),
    ];
    expect(renderPeople(afterMan, { ...participants, groupOrder: ['pan'] })).toBe(
      `pan Jan Novák, slečny Alena A, Běla B, Cecílie C (všechny${NB}2.B)`,
    );
    const responsible = [
      { ...p('pan', 'Jan', 'Novák'), role: 'absolvent' },
      p('slecna', 'Eva', 'Malá', '1.A'),
      p('slecna', 'Lucie', 'Králová', '1.A'),
    ];
    expect(renderPeople(responsible, organisers)).toBe(
      `absolvent pan Jan Novák, slečna Eva Malá a slečna Lucie Králová (obě${NB}1.A)`,
    );
  });

  it.each([
    [
      [p('pan', 'Adam', 'A', '1.A'), p('pan', 'Bořek', 'B', '1.A'), p('pan', 'Cyril', 'C')],
      `pánové Adam A, Bořek B (oba${NB}1.A), Cyril C`,
    ],
    [
      [
        p('pani', 'Jana', 'Bílá', 'učitelka fyziky'),
        p('pan', 'Adam', 'A', '1.A'),
        p('pan', 'Bořek', 'B', '1.A'),
        p('pan', 'Cyril', 'C', '1.A'),
      ],
      `paní Jana Bílá (učitelka fyziky), pánové Adam A, Bořek B, Cyril C (všichni${NB}1.A)`,
    ],
    [
      [
        p('pan', 'Adam', 'A', '1.A'),
        p('pan', 'Bořek', 'B', '1.A'),
        p('pan', 'Cyril', 'C', '2.B'),
        p('pan', 'Dan', 'D', '2.B'),
      ],
      `pánové Adam A, Bořek B (oba${NB}1.A), Cyril C, Dan D (oba${NB}2.B)`,
    ],
    [
      [
        p('pan', 'Petr', 'Dvořák'),
        p('pan', 'Karel', 'X', '2.B'),
        p('pan', 'Adam', 'A', '1.A'),
        p('pan', 'Bořek', 'B', '1.A'),
      ],
      `pánové Petr Dvořák, Karel X (2.B), Adam A, Bořek B (oba${NB}1.A)`,
    ],
    [
      [
        p('slecna', 'Eva', 'Malá'),
        p('pani', 'Jana', 'Bílá', 'učitelka'),
        p('pan', 'Adam', 'A', '1.A'),
        p('pan', 'Bořek', 'B', '1.A'),
        p('pan', 'Cyril', 'C', '1.A'),
      ],
      `slečna Eva Malá, paní Jana Bílá (učitelka), pánové Adam A, Bořek B, Cyril C (všichni${NB}1.A)`,
    ],
    [
      [
        p('pan', 'Petr', 'Dvořák'),
        p('pan', 'Jan', 'Novák', '3.B'),
        p('pan', 'Ivo', 'Žák', '3.B'),
        p('pan', 'Adam', 'A', '1.A'),
        p('pan', 'Bořek', 'B', '1.A'),
      ],
      `pánové Petr Dvořák, Jan Novák (3.B), Ivo Žák (3.B), Adam A, Bořek B (oba${NB}1.A)`,
    ],
    [
      [
        p('slecna', 'Eva', 'Malá'),
        p('pan', 'Adam', 'A', '1.A'),
        p('pan', 'Bořek', 'B', '1.A'),
        p('pan', 'Cyril', 'C', '2.B'),
        p('pan', 'Dan', 'D', '2.B'),
        p('pan', 'Emil', 'E', '2.B'),
      ],
      `slečna Eva Malá, pánové Adam A, Bořek B (oba${NB}1.A), Cyril C, Dan D, Emil E (všichni${NB}2.B)`,
    ],
  ])('still compresses after a parenthesis: %#', (people, text) => {
    expect(renderPeople(people, { join: 'comma', order: 'input' })).toBe(text);
  });
});

describe('affiliations as stored', () => {
  it.each([
    [[p('pani', 'Jana', 'Bílá', '3M')], 'paní Jana Bílá (3M)'],
    [[p('pani', 'Jana', 'Bílá', 'TU 1.A')], 'paní Jana Bílá (TU 1.A)'],
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

const TOGETHER = /^(oba|obě|všichni|všechny)\u00A0(.+)$/;

/**
 * Reads a list back the way a reader does. A name gets the parenthesis right
 * after it. A tail like „(oba 1.A)“ also reaches back over the bare names
 * before it, up to the previous parenthesis; „obě“ and „všechny“ skip men.
 * „Všichni“ / „všechny“ take every name they reach, across group labels. A
 * pair takes the nearest one, and is ambiguous if it reaches another one in
 * the same group (every name is in one group when roles are shown).
 */
function readBack(text: string, people: readonly Person[]): Map<Person, string | undefined> {
  const withRoles = people.some((p) => p.role?.trim());
  const placed = people
    .map((person) => ({ person, at: text.indexOf(formatName(person)) }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.person);
  const own = placed.map(
    (p) =>
      /^ \(([^)]*)\)/.exec(text.slice(text.indexOf(formatName(p)) + formatName(p).length))?.[1],
  );
  const read = own.map((o) => (o && TOGETHER.test(o) ? undefined : o));
  const sameGroup = (j: number, k: number) =>
    withRoles || placed[j]!.salutation === placed[k]!.salutation;
  own.forEach((o, i) => {
    const [, word, klass] = (o && TOGETHER.exec(o)) || [];
    if (!word) return;
    const feminine = word === 'obě' || word === 'všechny';
    const reached: number[] = [];
    for (let j = i - 1; j >= 0 && own[j] === undefined; j--) {
      if (!feminine || SALUTATION[placed[j]!.salutation].sex === 'f') reached.push(j);
    }
    const pair = word === 'oba' || word === 'obě';
    const covered = [i, ...(pair ? reached.slice(0, 1) : reached)];
    if (pair && reached[0] !== undefined && reached[1] !== undefined)
      expect(sameGroup(reached[0], reached[1]), `${text}: whom does „${o}“ mean?`).toBe(false);
    for (const j of covered) read[j] = klass;
    const women = covered.every((j) => SALUTATION[placed[j]!.salutation].sex === 'f');
    const fitting = covered.length === 2 ? (women ? 'obě' : 'oba') : women ? 'všechny' : 'všichni';
    expect(covered.length).toBeGreaterThanOrEqual(2);
    expect(word).toBe(fitting);
  });
  return new Map(placed.map((person, i) => [person, read[i]]));
}

describe('what a list says about each person', () => {
  const NAMES = ['Adam', 'Bořek', 'Cyril', 'Dan', 'Emil', 'Filip', 'Gustav', 'Hugo'];
  const person = fc.record({
    salutation: fc.constantFrom('pan', 'pani', 'slecna') as fc.Arbitrary<Person['salutation']>,
    // Mostly one class, so runs of three or more are common.
    affiliation: fc.constantFrom(
      undefined,
      undefined,
      '1.A',
      '1.A',
      '1.A',
      '1.A',
      '1a',
      ' 2.B ',
      '2.B',
      '1. LF',
      'učitelka',
    ),
    role: fc.constantFrom(undefined, undefined, undefined, undefined, undefined, 'absolvent'),
  });
  const people = fc.array(person, { minLength: 1, maxLength: NAMES.length }).map((list) =>
    list.map((x, i): Person => ({
      salutation: x.salutation,
      givenName: NAMES[i] ?? '',
      familyName: 'Novák',
      ...(x.affiliation && { affiliation: x.affiliation }),
      ...(x.role && { role: x.role }),
    })),
  );
  const options = fc.record({
    join: fc.constantFrom('comma', 'and') as fc.Arbitrary<'comma' | 'and'>,
    order: fc.constantFrom('input', 'class-surname') as fc.Arbitrary<'input' | 'class-surname'>,
    groupOrder: fc.shuffledSubarray<Person['salutation']>(['slecna', 'pani', 'pan']),
  });

  it('reads back as each person’s own class or job, and nothing for anyone else', () => {
    fc.assert(
      fc.property(people, options, (list, opts) => {
        const text = renderPeople(list, opts);
        for (const p of list) {
          const at = text.indexOf(formatName(p));
          expect(at).toBeGreaterThanOrEqual(0);
          expect(text.indexOf(formatName(p), at + 1)).toBe(-1);
        }
        const read = readBack(text, list);
        for (const p of list) expect(read.get(p)).toBe(p.affiliation?.trim() || undefined);
      }),
      { numRuns: 3000 },
    );
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

describe('people with a function (ADR 0072)', () => {
  const headed = (
    person: Person,
    head: NonNullable<Person['head']>,
    complement?: string,
  ): Person => ({ ...person, head, ...(complement && { complement }) });

  it('prints a function and its complement before the salutation, a ředitel after it', () => {
    const deputy = headed(p('pani', 'Jana', 'Nováková'), 'zastupce', 'pro pedagogickou činnost');
    expect(renderPeople([deputy], organisers)).toBe(
      'zástupkyně pro pedagogickou činnost paní Jana Nováková',
    );
    expect(renderPeople([headed(p('pan', 'Jan', 'Novák'), 'reditel')], organisers)).toBe(
      'pan ředitel Jan Novák',
    );
  });

  it('keeps the affiliation after the name', () => {
    expect(
      renderPeople([headed(p('slecna', 'Eva', 'Malá', '3.B'), 'clen', 'PR oddělení')], organisers),
    ).toBe('členka PR oddělení slečna Eva Malá (3.B)');
  });

  it('names everyone one by one as soon as anyone has a head', () => {
    const list = [
      headed(p('pani', 'Jana', 'Bílá'), 'vedouci', 'IT oddělení'),
      p('pani', 'Eva', 'Malá'),
      p('pan', 'Jan', 'Novák'),
    ];
    expect(renderPeople(list, organisers)).toBe(
      'vedoucí IT oddělení paní Jana Bílá, paní Eva Malá a pan Jan Novák',
    );
  });

  it('writes an absolvent before the salutation', () => {
    expect(
      renderPeople(
        [
          headed(p('pan', 'Jan', 'Novák'), 'absolvent'),
          headed(p('slecna', 'Eva', 'Malá'), 'absolvent'),
        ],
        organisers,
      ),
    ).toBe('absolvent pan Jan Novák a absolventka slečna Eva Malá');
  });

  it('still shares a class at the end of a run', () => {
    const list = [
      headed(p('pan', 'Petr', 'Dvořák', '1.A'), 'clen', 'PR oddělení'),
      p('pan', 'Jan', 'Novák', '1.A'),
    ];
    expect(renderPeople(list, organisers)).toBe(
      `člen PR oddělení pan Petr Dvořák a pan Jan Novák (oba${NB}1.A)`,
    );
  });

  it('leaves a list without heads as it was', () => {
    expect(renderPeople([p('pani', 'Jana', 'Malá'), p('pan', 'Jan', 'Novák')], organisers)).toBe(
      'paní Jana Malá a pan Jan Novák',
    );
  });

  it('prints no head in a list with one label', () => {
    const row = [{ givenName: 'Eva', familyName: 'Malá', affiliation: '3.B' }];
    expect(
      renderPeople(row, {
        join: 'comma',
        order: 'input',
        oneLabel: { label: 'slečna', women: true },
      }),
    ).toBe('slečna Eva Malá (3.B)');
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

describe('one label for the whole group (ADR 0071)', () => {
  const n = (givenName: string, familyName: string, affiliation?: string) => ({
    givenName,
    familyName,
    ...(affiliation && { affiliation }),
  });
  const one = (label: string | null, women = false) =>
    ({ join: 'comma', order: 'class-surname', oneLabel: { label, women } }) as const;

  it('puts the label once before the names, sorted by class and surname', () => {
    expect(
      renderPeople([n('Jan', 'Novák', '2.A'), n('Eva', 'Malá', '3.B')], one('slečny a pánové')),
    ).toBe('slečny a pánové Jan Novák (2.A), Eva Malá (3.B)');
    expect(
      renderPeople([n('Eva', 'Malá', '3.B'), n('Jan', 'Novák', '2.A')], one('slečny a pánové')),
    ).toBe('slečny a pánové Jan Novák (2.A), Eva Malá (3.B)');
  });

  it('prints the names alone with no label', () => {
    expect(renderPeople([n('Eva', 'Malá', '3.B'), n('Jan', 'Novák', '2.A')], one(null))).toBe(
      'Jan Novák (2.A), Eva Malá (3.B)',
    );
  });

  it('prints one person with the label it is given', () => {
    expect(renderPeople([n('Eva', 'Malá', '3.B')], one('slečna', true))).toBe(
      'slečna Eva Malá (3.B)',
    );
  });

  it('keeps the class-run grouping, with the word of the group', () => {
    const pair = [n('Petr', 'Dvořák', '1.A'), n('Jan', 'Novák', '1.A')];
    expect(renderPeople(pair, one('pánové'))).toBe(`pánové Petr Dvořák, Jan Novák (oba${NB}1.A)`);
    expect(renderPeople(pair, one('slečny', true))).toBe(
      `slečny Petr Dvořák, Jan Novák (obě${NB}1.A)`,
    );
    expect(renderPeople([...pair, n('Ivo', 'Žák', '1.A')], one('slečny', true))).toBe(
      `slečny Petr Dvořák, Jan Novák, Ivo Žák (všechny${NB}1.A)`,
    );
    expect(renderPeople([...pair, n('Ivo', 'Žák', '1.A')], one('slečny a pánové'))).toBe(
      `slečny a pánové Petr Dvořák, Jan Novák, Ivo Žák (všichni${NB}1.A)`,
    );
  });

  it('writes a run inside the list: a class shared by neighbours only', () => {
    const people = [n('Adam', 'A', '1.A'), n('Bořek', 'B', '1.A'), n('Cyril', 'C', '2.B')];
    expect(renderPeople(people, one('pánové'))).toBe(
      `pánové Adam A, Bořek B (oba${NB}1.A), Cyril C (2.B)`,
    );
  });

  it('never drops or repeats anyone', () => {
    const people = [n('Adam', 'A'), n('Bořek', 'B', '1.A'), n('Cyril', 'C', '1.A'), n('Dan', 'D')];
    const text = renderPeople(people, one('slečny a pánové'));
    for (const name of ['Adam A', 'Bořek B', 'Cyril C', 'Dan D'])
      expect(text.split(name)).toHaveLength(2);
  });

  it('renders nothing for nobody', () => {
    expect(renderPeople([], one('pánové'))).toBe('');
  });

  it('leaves the salutation lists as they were', () => {
    expect(renderPeople([p('slecna', 'Eva', 'Malá', '1.A')], participants)).toBe(
      'slečna Eva Malá (1.A)',
    );
  });
});
