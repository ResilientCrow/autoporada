import { describe, expect, it } from 'vitest';

import { registryFixtures } from '../../../../test/support/registry';
import { setupWorld } from '../../../../test/support/world';
import { removeEntry } from './index';

const world = setupWorld();
const { people, list, entry, entryById, entriesOf } = registryFixtures(world);

describe('registry.removeEntry', () => {
  it('deletes a student no document has listed and audits it without a name', async () => {
    const head = await people.headmaster();
    const target = await list();
    const jana = await entry(target.id, 'Nováková', { givenName: 'Jana' });
    const result = await world.run(removeEntry, world.as(head), { id: jana.id });
    expect(result).toEqual({ ok: true, value: { deleted: true } });
    expect(await entryById(jana.id)).toBeNull();
    const event = (await world.inspect.audit()).at(-1);
    expect(event).toMatchObject({
      actorId: head.id,
      action: 'registry.entry_removed',
      targetType: 'registry_entry',
      targetId: jana.id,
      data: { meta: { deleted: true } },
    });
    expect(JSON.stringify(event?.data)).not.toMatch(/Jana|Nováková/);
  });

  it('keeps a printed student as removed, at the clock, and frees the name for a new entry', async () => {
    const head = await people.headmaster();
    const target = await list();
    const jana = await entry(target.id, 'Nováková', { givenName: 'Jana', printed: true });
    const result = await world.run(removeEntry, world.as(head), { id: jana.id });
    expect(result).toEqual({ ok: true, value: { deleted: false } });
    expect(await entryById(jana.id)).toMatchObject({
      removedAt: world.clock.now(),
      firstPublishedIssueId: jana.firstPublishedIssueId,
    });
    expect(await entriesOf(target.id)).toHaveLength(0);
    expect((await world.inspect.audit()).at(-1)?.data).toMatchObject({ meta: { deleted: false } });
    await entry(target.id, 'Nováková', { givenName: 'Jana' });
  });

  it('answers not-found the second time, for a removed entry and for an unknown id', async () => {
    const head = await people.headmaster();
    const target = await list();
    const jana = await entry(target.id, 'Nováková', { printed: true });
    expect((await world.run(removeEntry, world.as(head), { id: jana.id })).ok).toBe(true);
    const audited = (await world.inspect.audit()).length;
    for (const id of [jana.id, '0198f000-0000-7000-8000-00000000ffff']) {
      expect(await world.run(removeEntry, world.as(head), { id })).toEqual({
        ok: false,
        error: { code: 'not-found' },
      });
    }
    expect(await world.inspect.audit()).toHaveLength(audited);
  });

  it('refuses a malformed id and extra fields as invalid input', async () => {
    const head = await people.headmaster();
    for (const input of [
      { id: 'x' },
      { id: '0198f000-0000-7000-8000-00000000ffff', force: true },
    ]) {
      const result = await world.run(removeEntry, world.as(head), input);
      expect(!result.ok && result.error.code).toBe('invalid-input');
    }
  });

  it('is for the headmaster alone', async () => {
    const target = await list();
    const jana = await entry(target.id, 'Nováková');
    for (const make of [people.reviewer, people.submitter]) {
      const result = await world.run(removeEntry, world.as(await make()), { id: jana.id });
      expect(result).toEqual({ ok: false, error: { code: 'forbidden' } });
    }
    expect(await entriesOf(target.id)).toHaveLength(1);
  });
});
