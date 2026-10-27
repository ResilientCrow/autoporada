import { describe, expect, it } from 'vitest';

import type { RecentPerson } from '@/domain/people';
import { POINT_LIMITS, type DraftPerson, type DraftStatement } from '@/domain/report';
import { cs } from '@/ui/copy';

import { keyBullets } from './bullet-chips';
import type { PointContentWire } from './fields';
import { bulletsEdit, withPatch, type Edit } from './report-patch';
import { setPeople } from './bullets-state';
import {
  applyStatementOp,
  chooseSpeaker,
  genitiveNote,
  NEW_STATEMENT,
  OTHER,
  optionValue,
  pickSpeaker,
  selectedOption,
  setSpeaker,
  speakerOptions,
  syncSpeakers,
  unquoted,
  unquotedStatement,
  withSyncedSpeakers,
} from './statements-state';

const { statements: copy } = cs.points;

const person = (givenName: string, familyName: string, extra: Partial<DraftPerson> = {}) =>
  ({ salutation: 'pan', givenName, familyName, ...extra }) satisfies DraftPerson;

const NOVAK = person('Jan', 'Novák', { affiliation: '3.B', affiliationYear: '2026/2027' });
const MALA = person('Eva', 'Malá', { salutation: 'slecna', graphId: 'g-2' });
const DVORAK = person('Petr', 'Dvořák');
const ODD = person('Xyzzy', 'Qwrtz');

const statement = (extra: Partial<DraftStatement> = {}): DraftStatement => ({
  speaker: null,
  speakerGenitive: '',
  quote: '',
  ...extra,
});

const recent = (p: DraftPerson, genitive?: string): RecentPerson => ({
  ...p,
  ...(genitive !== undefined && { genitive }),
  lastUsed: '2026-10-01T10:00:00.000Z',
});

const bullet = (key: string, people: readonly DraftPerson[]) => ({
  key,
  label: key,
  kind: 'people' as const,
  order: 'input' as const,
  people: [...people],
});

const CONTENT: PointContentWire = {
  title: 'Exkurze',
  eventDate: '2027-01-14',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: 'Věta.',
  openingEdited: false,
  body: { type: 'doc', content: [] },
  bullets: [bullet('organizatori', [NOVAK]), bullet('ucastnici', [MALA, DVORAK])],
  statements: [],
};

describe('NEW_STATEMENT', () => {
  it('has no speaker, genitive or quote', () => {
    expect(NEW_STATEMENT).toEqual({ speaker: null, speakerGenitive: '', quote: '' });
  });
});

describe('applyStatementOp', () => {
  const list = ['a', 'b', 'c'];

  it('adds the fresh item at the end, focusing the new card’s „Kdo“', () => {
    expect(applyStatementOp(list, { kind: 'add' }, 'new')).toEqual({
      ok: true,
      list: ['a', 'b', 'c', 'new'],
      focus: { row: 3, control: 'speaker' },
    });
  });

  it('refuses an add past the cap with a code, and takes one that fills it', () => {
    const full = Array.from({ length: POINT_LIMITS.statements }, (_, i) => `s${i}`);
    expect(applyStatementOp(full, { kind: 'add' }, 'new')).toEqual({ ok: false, code: 'limit' });
    const almost = full.slice(1);
    const filled = applyStatementOp(almost, { kind: 'add' }, 'new');
    expect(filled.ok && filled.list).toHaveLength(POINT_LIMITS.statements);
  });

  it('removes a card and focuses the next card’s „Kdo“', () => {
    expect(applyStatementOp(list, { kind: 'remove', index: 1 }, 'x')).toEqual({
      ok: true,
      list: ['a', 'c'],
      focus: { row: 1, control: 'speaker' },
    });
  });

  it('focuses the previous card’s „Kdo“ after removing the last', () => {
    expect(applyStatementOp(list, { kind: 'remove', index: 2 }, 'x')).toEqual({
      ok: true,
      list: ['a', 'b'],
      focus: { row: 1, control: 'speaker' },
    });
  });

  it('focuses „Přidat vyjádření“ after removing the only card', () => {
    expect(applyStatementOp(['a'], { kind: 'remove', index: 0 }, 'x')).toEqual({
      ok: true,
      list: [],
      focus: 'add',
    });
  });

  it('refuses to remove a card that is not there', () => {
    expect(applyStatementOp(list, { kind: 'remove', index: 3 }, 'x')).toEqual({
      ok: false,
      code: 'unknown',
    });
  });

  it('moves a card up, with focus on the button that moved, now one place higher', () => {
    expect(applyStatementOp(list, { kind: 'up', index: 2 }, 'x')).toEqual({
      ok: true,
      list: ['a', 'c', 'b'],
      focus: { row: 1, control: 'up' },
    });
  });

  it('moves a card down, with focus on the button that moved, now one place lower', () => {
    expect(applyStatementOp(list, { kind: 'down', index: 0 }, 'x')).toEqual({
      ok: true,
      list: ['b', 'a', 'c'],
      focus: { row: 1, control: 'down' },
    });
  });

  it('does nothing at the ends and keeps focus on the same button', () => {
    const up = applyStatementOp(list, { kind: 'up', index: 0 }, 'x');
    expect(up).toEqual({ ok: true, list, focus: { row: 0, control: 'up' } });
    expect(up.ok && up.list).toBe(list);
    const down = applyStatementOp(list, { kind: 'down', index: 2 }, 'x');
    expect(down).toEqual({ ok: true, list, focus: { row: 2, control: 'down' } });
    expect(down.ok && down.list).toBe(list);
  });

  it('leaves the list it was given as it was', () => {
    applyStatementOp(list, { kind: 'remove', index: 0 }, 'x');
    applyStatementOp(list, { kind: 'down', index: 0 }, 'x');
    expect(list).toEqual(['a', 'b', 'c']);
  });
});

describe('optionValue', () => {
  it('is the graphId when there is one', () => {
    expect(optionValue(MALA)).toBe('id:g-2');
  });

  it('is the name key otherwise, whatever the case, spaces and titles', () => {
    expect(optionValue(person(' JAN', 'novák', { titlesBefore: 'Mgr.' }))).toBe(optionValue(NOVAK));
    expect(optionValue(NOVAK)).not.toBe(optionValue(DVORAK));
  });

  it('never equals the „Jiná osoba…“ value or the empty one', () => {
    expect([OTHER, '']).not.toContain(optionValue(NOVAK));
    expect([OTHER, '']).not.toContain(optionValue(MALA));
  });
});

describe('speakerOptions and selectedOption', () => {
  const participants = [NOVAK, MALA, DVORAK];

  it('lists the participants by their names, then „Jiná osoba…“', () => {
    const options = speakerOptions(participants, optionValue(MALA));
    expect(options.map((o) => o.label)).toEqual([
      'Jan Novák',
      'Eva Malá',
      'Petr Dvořák',
      copy.other,
    ]);
    expect(options.map((o) => o.value)).toEqual([...participants.map(optionValue), OTHER]);
  });

  it('puts a „Vyberte…“ first only while nothing is chosen', () => {
    expect(speakerOptions(participants, '')[0]).toEqual({ value: '', label: copy.choose });
    expect(speakerOptions(participants, OTHER).map((o) => o.value)).not.toContain('');
  });

  it('offers only „Jiná osoba…“ with no participants', () => {
    expect(speakerOptions([], OTHER).map((o) => o.label)).toEqual([copy.other]);
  });

  it('selects the participant who is the same person as the speaker', () => {
    const typedCopy = person('eva', 'MALÁ', { salutation: 'pani' });
    expect(selectedOption(statement({ speaker: typedCopy }), participants, false)).toBe(
      optionValue(MALA),
    );
  });

  it('selects „Jiná osoba…“ for a speaker who is not a participant', () => {
    expect(selectedOption(statement({ speaker: ODD }), participants, false)).toBe(OTHER);
  });

  it('selects nothing for no speaker, or „Jiná osoba…“ once it was asked for', () => {
    expect(selectedOption(statement(), participants, false)).toBe('');
    expect(selectedOption(statement(), participants, true)).toBe(OTHER);
  });

  it('lets a speaker who is a participant win over the wish for another person', () => {
    expect(selectedOption(statement({ speaker: DVORAK }), participants, true)).toBe(
      optionValue(DVORAK),
    );
  });

  it('keeps a participant’s value through bullet edits that do not remove them', () => {
    const before = optionValue(DVORAK);
    const edited = [person('Karel', 'Cizí'), person('PETR', 'dvořák'), NOVAK];
    expect(speakerOptions(edited, before).map((o) => o.value)).toContain(before);
    expect(selectedOption(statement({ speaker: DVORAK }), edited, false)).toBe(before);
  });
});

describe('chooseSpeaker', () => {
  it('copies the person and writes the genitive from the suggestion', () => {
    const chosen = chooseSpeaker(statement({ quote: 'Ahoj' }), NOVAK, []);
    expect(chosen.speaker).toEqual(NOVAK);
    expect(chosen.speakerGenitive).toBe('pana Jana Nováka');
    expect(chosen.quote).toBe('Ahoj');
  });

  it('prefers the genitive the author last wrote for that person', () => {
    const chosen = chooseSpeaker(statement(), NOVAK, [
      recent(DVORAK, 'pana Petra Dvořáka'),
      recent(person('jan', 'NOVÁK'), 'pana Honzy Nováka'),
    ]);
    expect(chosen.speakerGenitive).toBe('pana Honzy Nováka');
  });

  it('ignores a recent genitive of another person', () => {
    expect(
      chooseSpeaker(statement(), NOVAK, [recent(DVORAK, 'pana Petra Dvořáka')]).speakerGenitive,
    ).toBe('pana Jana Nováka');
  });

  it('leaves the genitive empty with no salutation, whatever the recent says', () => {
    const nobody = person('Jan', 'Novák', { salutation: null });
    expect(chooseSpeaker(statement({ speakerGenitive: 'stará' }), nobody, []).speakerGenitive).toBe(
      '',
    );
    expect(
      chooseSpeaker(statement(), nobody, [recent(NOVAK, 'pana Honzy Nováka')]).speakerGenitive,
    ).toBe('');
  });

  it('prefills an empty affiliation from the person’s, and keeps one that is set', () => {
    expect(chooseSpeaker(statement(), NOVAK, []).affiliation).toBe('3.B');
    expect(chooseSpeaker(statement({ affiliation: '' }), NOVAK, []).affiliation).toBe('3.B');
    expect(chooseSpeaker(statement({ affiliation: 'ředitel' }), NOVAK, []).affiliation).toBe(
      'ředitel',
    );
  });

  it('leaves the affiliation alone when the person has none', () => {
    const chosen = chooseSpeaker(statement(), DVORAK, []);
    expect(Object.hasOwn(chosen, 'affiliation')).toBe(false);
  });
});

describe('pickSpeaker', () => {
  const participants = [NOVAK, MALA];

  it('chooses the participant the value names', () => {
    const picked = pickSpeaker(statement(), optionValue(MALA), participants, []);
    expect(picked.speaker).toEqual(MALA);
    expect(picked.speakerGenitive).toBe('slečny Evy Malé');
  });

  it('clears the speaker and genitive when „Jiná osoba…“ is picked over a participant', () => {
    const before = chooseSpeaker(statement({ quote: 'Q' }), NOVAK, []);
    // The class NOVAK brought is untouched, so it goes with him (see „follows the speaker“).
    expect(pickSpeaker(before, OTHER, participants, [])).toEqual({
      ...before,
      speaker: null,
      speakerGenitive: '',
      affiliation: '',
    });
  });

  it('keeps a speaker who is already another person', () => {
    const before = statement({ speaker: ODD, speakerGenitive: 'pana X' });
    expect(pickSpeaker(before, OTHER, participants, [])).toBe(before);
  });

  it('changes nothing for a value that names no participant', () => {
    const before = statement({ speaker: NOVAK });
    expect(pickSpeaker(before, 'id:nobody', participants, [])).toBe(before);
    expect(pickSpeaker(before, '', participants, [])).toBe(before);
  });
});

describe('setSpeaker', () => {
  it('clears the speaker and genitive when the field is emptied', () => {
    const before = chooseSpeaker(statement({ quote: 'Q' }), ODD, []);
    expect(setSpeaker(before, null, [])).toEqual({ ...before, speaker: null, speakerGenitive: '' });
  });

  it('chooses another person as a pick does', () => {
    const before = chooseSpeaker(statement(), ODD, []);
    expect(setSpeaker(before, NOVAK, [])).toEqual(chooseSpeaker(before, NOVAK, []));
    expect(setSpeaker(statement(), NOVAK, []).speakerGenitive).toBe('pana Jana Nováka');
  });

  it('keeps a corrected genitive when the same person’s chip is edited', () => {
    const corrected = { ...chooseSpeaker(statement(), NOVAK, []), speakerGenitive: 'pana Honzy' };
    const edited = person('Jan', 'Novák', { affiliation: '4.A' });
    const next = setSpeaker(corrected, edited, []);
    expect(next.speaker).toEqual(edited);
    expect(next.speakerGenitive).toBe('pana Honzy');
  });

  it('writes the genitive once a salutation is chosen on the chip', () => {
    const nobody = person('Jan', 'Novák', { salutation: null });
    const before = chooseSpeaker(statement(), nobody, []);
    expect(setSpeaker(before, NOVAK, []).speakerGenitive).toBe('pana Jana Nováka');
  });
});

describe('the affiliation follows the speaker while it is untouched', () => {
  const participants = [NOVAK, MALA, DVORAK];
  const eva = person('Eva', 'Malá', { salutation: 'slecna', graphId: 'g-2', affiliation: '2.C' });

  it('is the new speaker’s on a switch, then empty for one with none (Jan 3.B, Eva 2.C, Petr none)', () => {
    const withJan = chooseSpeaker(statement(), NOVAK, []);
    expect(withJan.affiliation).toBe('3.B');
    const withEva = pickSpeaker(withJan, optionValue(eva), [NOVAK, eva], []);
    expect(withEva.affiliation).toBe('2.C');
    const withPetr = pickSpeaker(withEva, optionValue(DVORAK), [eva, DVORAK], []);
    expect(withPetr.affiliation).toBe('');
  });

  it('goes from a speaker with a class to one with none, and not back to undefined', () => {
    const withJan = chooseSpeaker(statement(), NOVAK, []);
    expect(chooseSpeaker(withJan, DVORAK, []).affiliation).toBe('');
  });

  it('treats an empty or blank field as untouched', () => {
    expect(chooseSpeaker(statement({ affiliation: '  ' }), NOVAK, []).affiliation).toBe('3.B');
    const before = statement({ speaker: DVORAK, affiliation: '' });
    expect(chooseSpeaker(before, NOVAK, []).affiliation).toBe('3.B');
  });

  it('keeps what the author typed across a switch, and across „Jiná osoba…“', () => {
    const typed = { ...chooseSpeaker(statement(), NOVAK, []), affiliation: 'ředitel' };
    expect(chooseSpeaker(typed, MALA, []).affiliation).toBe('ředitel');
    expect(pickSpeaker(typed, OTHER, participants, []).affiliation).toBe('ředitel');
    expect(setSpeaker(typed, null, []).affiliation).toBe('ředitel');
    expect(setSpeaker(typed, ODD, []).affiliation).toBe('ředitel');
  });

  it('keeps a class the author typed even when it equals a different person’s', () => {
    const typed = { ...chooseSpeaker(statement(), DVORAK, []), affiliation: '2.C' };
    expect(chooseSpeaker(typed, NOVAK, []).affiliation).toBe('2.C');
  });

  it('clears an untouched affiliation when the speaker is cleared, in either way', () => {
    const withJan = chooseSpeaker(statement({ quote: 'Q' }), NOVAK, []);
    expect(pickSpeaker(withJan, OTHER, participants, []).affiliation).toBe('');
    expect(setSpeaker(withJan, null, []).affiliation).toBe('');
  });

  it('does not add an affiliation key to a statement that has none to clear', () => {
    const before = chooseSpeaker(statement(), DVORAK, []);
    expect(Object.hasOwn(setSpeaker(before, null, []), 'affiliation')).toBe(false);
  });

  it('follows an edited chip of the same person while untouched, and keeps a typed one', () => {
    const withJan = chooseSpeaker(statement(), NOVAK, []);
    const edited = person('Jan', 'Novák', { affiliation: '4.A' });
    expect(setSpeaker(withJan, edited, []).affiliation).toBe('4.A');
    const typed = { ...withJan, affiliation: 'ředitel' };
    expect(setSpeaker(typed, edited, []).affiliation).toBe('ředitel');
  });

  it('follows a participant whose class changed, after a bullet edit, but not a typed one', () => {
    const later = person('Jan', 'Novák', { affiliation: '4.A' });
    const content = (s: DraftStatement): PointContentWire => ({
      ...CONTENT,
      bullets: [bullet('ucastnici', [later])],
      statements: [s],
    });
    const withJan = chooseSpeaker(statement({ quote: 'Q' }), NOVAK, []);
    expect(syncSpeakers(content(withJan), []).statements[0]?.affiliation).toBe('4.A');
    const typed = { ...withJan, affiliation: 'ředitel' };
    expect(syncSpeakers(content(typed), []).statements[0]?.affiliation).toBe('ředitel');
  });
});

describe('genitiveNote', () => {
  it('asks for the salutation while the speaker has none and the genitive is empty', () => {
    const nobody = person('Jan', 'Novák', { salutation: null });
    expect(genitiveNote(statement({ speaker: nobody }), [])).toBe(copy.needSalutation);
  });

  it('says nothing about the salutation once the author wrote a genitive', () => {
    const nobody = person('Jan', 'Novák', { salutation: null });
    expect(genitiveNote(statement({ speaker: nobody, speakerGenitive: 'pana Nováka' }), [])).toBe(
      null,
    );
  });

  it('asks to check a suggestion the rules are unsure of, while the field still holds it', () => {
    const chosen = chooseSpeaker(statement(), ODD, []);
    expect(chosen.speakerGenitive).toBe('pana Xyzzyho Qwrtze');
    expect(genitiveNote(chosen, [])).toBe(copy.check('pana Xyzzyho Qwrtze'));
  });

  it('drops the check once the author changed the text', () => {
    const chosen = chooseSpeaker(statement(), ODD, []);
    expect(genitiveNote({ ...chosen, speakerGenitive: 'pana Xyzzyho Qwrtzeho' }, [])).toBe(null);
  });

  it('does not ask to check a remembered genitive or a sure suggestion', () => {
    const remembered = chooseSpeaker(statement(), ODD, [recent(ODD, 'pana Xyzzyho Qwrtze')]);
    expect(genitiveNote(remembered, [recent(ODD, 'pana Xyzzyho Qwrtze')])).toBe(null);
    expect(genitiveNote(chooseSpeaker(statement(), NOVAK, []), [])).toBe(null);
  });

  it('says nothing with no speaker', () => {
    expect(genitiveNote(statement(), [])).toBe(null);
  });
});

describe('syncSpeakers', () => {
  const withSpeaker = (speaker: DraftPerson, recents: RecentPerson[] = []) =>
    chooseSpeaker(statement({ quote: 'Q' }), speaker, recents);

  /** A point whose participants are `people`, with one statement by `speaker`. */
  const point = (people: DraftPerson[], speaker: DraftStatement): PointContentWire => ({
    ...CONTENT,
    bullets: [bullet('ucastnici', people)],
    statements: [speaker],
  });

  it('gives the statement the participant’s current fields', () => {
    const before = withSpeaker(person('Jan', 'Novák', { salutation: null }));
    expect(before.speakerGenitive).toBe('');
    const later = person('Jan', 'Novák', { affiliation: '4.A' });
    const synced = syncSpeakers(point([later], before), []);
    expect(synced.statements[0]?.speaker).toEqual(later);
  });

  it('writes a genitive that was empty because the speaker had no salutation', () => {
    const before = withSpeaker(person('Jan', 'Novák', { salutation: null }));
    const synced = syncSpeakers(point([NOVAK], before), []);
    expect(synced.statements[0]?.speakerGenitive).toBe('pana Jana Nováka');
  });

  it('refreshes a genitive that is still the suggestion of the old copy', () => {
    const before = withSpeaker(MALA);
    expect(before.speakerGenitive).toBe('slečny Evy Malé');
    const asMrs = person('Eva', 'Malá', { salutation: 'pani', graphId: 'g-2' });
    const synced = syncSpeakers(point([asMrs], before), []);
    expect(synced.statements[0]?.speakerGenitive).toBe('paní Evy Malé');
  });

  it('keeps a genitive the author corrected, though the speaker’s fields refresh', () => {
    const before = { ...withSpeaker(MALA), speakerGenitive: 'slečny Evičky Malé' };
    const asMrs = person('Eva', 'Malá', { salutation: 'pani', graphId: 'g-2' });
    const synced = syncSpeakers(point([asMrs], before), []);
    expect(synced.statements[0]?.speaker).toEqual(asMrs);
    expect(synced.statements[0]?.speakerGenitive).toBe('slečny Evičky Malé');
  });

  it('treats a remembered genitive as the suggestion of the old copy', () => {
    const recents = [recent(DVORAK, 'pana Petříka Dvořáka')];
    const before = withSpeaker(DVORAK, recents);
    expect(before.speakerGenitive).toBe('pana Petříka Dvořáka');
    const retitled = person('Petr', 'Dvořák', { titlesBefore: 'Ing.' });
    const synced = syncSpeakers(point([retitled], before), recents);
    expect(synced.statements[0]?.speakerGenitive).toBe('pana Petříka Dvořáka');
  });

  it('leaves a speaker who is no longer a participant, and a statement with none', () => {
    const gone = withSpeaker(ODD);
    const content = { ...point([NOVAK], gone), statements: [gone, statement()] };
    const synced = syncSpeakers(content, []);
    expect(synced.statements[0]).toBe(gone);
    expect(synced.statements[1]).toBe(content.statements[1]);
  });

  it('hands back the same content when nothing changes', () => {
    const content = point([DVORAK], withSpeaker(DVORAK));
    expect(syncSpeakers(content, [])).toBe(content);
  });

  it('syncs each statement on its own', () => {
    const later = person('Jan', 'Novák', { affiliation: '1.A' });
    const content: PointContentWire = {
      ...CONTENT,
      bullets: [bullet('ucastnici', [later, DVORAK])],
      statements: [withSpeaker(NOVAK), withSpeaker(DVORAK)],
    };
    const synced = syncSpeakers(content, []);
    expect(synced.statements.map((s) => s.speaker)).toEqual([later, DVORAK]);
  });
});

describe('withSyncedSpeakers', () => {
  const start = (): Edit => {
    const nobody = person('Jan', 'Novák', { salutation: null });
    const content: PointContentWire = {
      ...CONTENT,
      bullets: [bullet('ucastnici', [nobody])],
      statements: [chooseSpeaker(statement(), nobody, [])],
    };
    return { content, bullets: keyBullets(content.bullets) };
  };

  it('brings a salutation chosen on the chip to the statement, after a bullet change', () => {
    const before = start();
    const after = bulletsEdit(before, (bullets) =>
      setPeople(bullets, 'ucastnici', [{ key: 'ucastnici.0', person: person('Jan', 'Novák') }]),
    );
    const next = withSyncedSpeakers(before, after, []);
    expect(next.content.statements[0]?.speaker?.salutation).toBe('pan');
    expect(next.content.statements[0]?.speakerGenitive).toBe('pana Jana Nováka');
    expect(next.bullets).toBe(after.bullets);
  });

  it('does nothing when the bullets are the same, so a genitive cleared by hand stays empty', () => {
    // The statement's copy is behind the participant's, so a sync would fill the genitive in.
    const behind = start();
    const content: PointContentWire = {
      ...behind.content,
      bullets: [bullet('ucastnici', [NOVAK])],
      statements: [{ ...behind.content.statements[0]!, speakerGenitive: '' }],
    };
    const before: Edit = { content, bullets: keyBullets(content.bullets) };
    const cleared: Edit = {
      ...before,
      content: withPatch(content, {
        statements: [{ ...content.statements[0]!, speakerGenitive: '' }],
      }),
    };
    expect(syncSpeakers(cleared.content, []).statements[0]?.speakerGenitive).toBe(
      'pana Jana Nováka',
    );
    expect(withSyncedSpeakers(before, cleared, [])).toBe(cleared);
  });
});

describe('unquoted', () => {
  it.each([
    ['„Ahoj“', 'Ahoj'],
    ['“Ahoj”', 'Ahoj'],
    ['"Ahoj"', 'Ahoj'],
    ["'Ahoj'", 'Ahoj'],
    ['”Ahoj”', 'Ahoj'],
  ])('strips the pair in %s', (text, expected) => {
    expect(unquoted(text)).toBe(expected);
  });

  it('strips a leading mark and a trailing one on their own', () => {
    expect(unquoted('„Ahoj')).toBe('Ahoj');
    expect(unquoted('Ahoj“')).toBe('Ahoj');
  });

  it('strips only one mark at each end', () => {
    expect(unquoted('„„Ahoj““')).toBe('„Ahoj“');
  });

  it('never touches quotation marks inside the text', () => {
    expect(unquoted('„Řekl „ahoj“ a odešel“')).toBe('Řekl „ahoj“ a odešel');
    expect(unquoted('Je to "super" věc')).toBe('Je to "super" věc');
  });

  it('trims the spaces around the text and inside the marks', () => {
    expect(unquoted('  „ Ahoj “ ')).toBe('Ahoj');
  });

  it('leaves text with no marks as it is and empties marks alone', () => {
    expect(unquoted('Ahoj')).toBe('Ahoj');
    expect(unquoted('')).toBe('');
    expect(unquoted('„“')).toBe('');
    expect(unquoted('"')).toBe('');
  });
});

describe('unquotedStatement', () => {
  it('strips the marks around the quote', () => {
    const before = statement({ quote: '„Děkuji.“', speakerGenitive: 'pana X' });
    expect(unquotedStatement(before)).toEqual({ ...before, quote: 'Děkuji.' });
  });

  it('hands back the very statement when the quote has nothing to strip', () => {
    const before = statement({ quote: 'Děkuji.' });
    expect(unquotedStatement(before)).toBe(before);
    const empty = statement();
    expect(unquotedStatement(empty)).toBe(empty);
  });
});
