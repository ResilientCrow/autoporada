import { describe, expect, it } from 'vitest';

import { registryFixtures } from '../../../../test/support/registry';
import { setupWorld } from '../../../../test/support/world';
import { previewPaste } from './index';

const world = setupWorld();
const { people, list, entry, entriesOf } = registryFixtures(world);

const SAMPLE =
  'Jana Nováková (1.A), Patricie Nováková, Anna Nováková (obě 2.B), Jan Novák (1.A), Patrik Novák, ' +
  'Ondřej Novák (oba 1.B), Jan Hezký, Milan Nový, Jiří Novotný (všichni 1.C)';

async function preview(text: string, input: Record<string, unknown> = {}, listId?: string) {
  const head = await people.headmaster();
  const target = listId ?? (await list()).id;
  return world.run(previewPaste, world.as(head), {
    listId: target,
    text,
    order: 'given-family',
    ...input,
  });
}

describe('registry.previewPaste', () => {
  it('reads the user’s sample into nine rows without a problem', async () => {
    const result = await preview(SAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows.map((r) => `${r.givenName} ${r.familyName} ${r.classCode}`)).toEqual([
      'Jana Nováková 1.A',
      'Patricie Nováková 2.B',
      'Anna Nováková 2.B',
      'Jan Novák 1.A',
      'Patrik Novák 1.B',
      'Ondřej Novák 1.B',
      'Jan Hezký 1.C',
      'Milan Nový 1.C',
      'Jiří Novotný 1.C',
    ]);
    expect(
      result.value.rows.flatMap((r) => [...r.problems, ...r.warnings.map((w) => w.code)]),
    ).toEqual([]);
  });

  it('writes nothing and audits nothing: not the text, not the rows', async () => {
    const target = await list();
    expect((await preview(SAMPLE, {}, target.id)).ok).toBe(true);
    expect(await entriesOf(target.id)).toHaveLength(0);
    expect(await world.inspect.audit()).toHaveLength(0);
  });

  it('marks a student already on the list, case and diacritics folded, and not a removed one', async () => {
    const target = await list();
    await entry(target.id, 'Nováková', { givenName: 'Jana', classCode: '1.A' });
    await entry(target.id, 'Novák', { givenName: 'Jan', classCode: '1.A', removedAt: new Date() });
    const result = await preview('JANA NOVAKOVA 1.a, Jan Novák (1.A)', {}, target.id);
    expect(result.ok && result.value.rows.map((r) => r.problems)).toEqual([['duplicate'], []]);
  });

  it('takes the name order from the form', async () => {
    const result = await preview('Nováková Jana 1.A', { order: 'family-given' });
    expect(result.ok && result.value.rows[0]).toMatchObject({
      givenName: 'Jana',
      familyName: 'Nováková',
    });
  });

  it('reports the group-count warning with the rows still unproblematic', async () => {
    const result = await preview('A Bé, C Dé, E Éf (oba 1.A)');
    const warning = { code: 'group-count', word: 'oba' };
    expect(result.ok && result.value.rows.map((r) => [r.problems, r.warnings])).toEqual([
      [[], [warning]],
      [[], [warning]],
      [[], [warning]],
    ]);
  });

  it('takes 200 names and refuses 201 as text too long', async () => {
    const names = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `Jan${String.fromCharCode(97 + (i % 26))}${i} Novák 1.A`,
      ).join('\n');
    const { id } = await list();
    const ok = await preview(names(200), {}, id);
    expect(ok.ok && ok.value.rows).toHaveLength(200);
    expect(await preview(names(201), {}, id)).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { text: 'too-long' } },
    });
  });

  it('refuses more than 20 000 characters, a bad order and an extra field as invalid input', async () => {
    const { id } = await list();
    for (const input of [{ text: 'x'.repeat(20_001) }, { order: 'random' }, { remember: true }]) {
      const result = await preview('Jan Novák 1.A', input, id);
      expect(!result.ok && result.error.code, JSON.stringify(Object.keys(input))).toBe(
        'invalid-input',
      );
    }
  });

  it('answers not-found for an unknown list', async () => {
    expect(await preview('Jan Novák 1.A', {}, '0198f000-0000-7000-8000-00000000ffff')).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
  });

  it('is for the headmaster alone, not even a reviewer who may read the registry', async () => {
    const target = await list();
    for (const who of [people.reviewer, people.submitter]) {
      const result = await world.run(previewPaste, world.as(await who()), {
        listId: target.id,
        text: 'Jan Novák 1.A',
        order: 'given-family',
      });
      expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
    }
  });
});
