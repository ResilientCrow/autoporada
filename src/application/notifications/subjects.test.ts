import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { decidePoint } from '@/application/use-cases';
import { TEMPLATE_NAMES, type TemplateName } from '@/notify';

import { pointFixtures } from '../../../test/support/points';
import { setupWorld } from '../../../test/support/world';
import { loadSubject } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = pointFixtures(world);
const MISSING = '00000000-0000-7000-8000-00000000dead';

/** Reads as the worker does, in one transaction. */
const load = <T extends TemplateName>(template: T, id: string) =>
  world.workerDb.transaction(
    { principal: system('job:mail.send'), now: world.clock.now(), requestId: 'test' },
    { mode: 'read' },
    (tx) => loadSubject(tx, template, id),
  );

describe('loadSubject', () => {
  it('reads the decided request for the access decisions', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const user = await world.seed.user({ role: 'pending' });
    for (const [template, state] of [
      ['access.approved', 'approved'],
      ['access.rejected', 'rejected'],
      ['access.blocked', 'blocked'],
    ] as const) {
      const request = await world.seed.accessRequest({
        userId: user.id,
        state,
        decidedBy: head.id,
      });
      const subject = await load(template, request.id);
      expect(subject?.id).toBe(request.id);
      expect(subject?.state).toBe(state);
    }
  });

  it('reads the user for a grant and for the test mail', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    for (const template of ['access.granted', 'mail.check'] as const) {
      const subject = await load(template, user.id);
      expect(subject?.id).toBe(user.id);
      expect(subject?.role).toBe('submitter');
    }
  });

  it('reads the decision event and its point for the decision mails', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const reviewer = await world.seed.user({ role: 'reviewer' });
    const id = await start(author, 'pokyn');
    await moveTo(author, id, 'submitted');
    const input = { id, event: 'reject', expectedVersion: 2, note: 'Nepatří na poradu.' };
    expect((await world.run(decidePoint, world.as(reviewer), input)).ok).toBe(true);
    const [event] = (await snapshot(id)).events;
    const subject = { id: event!.id, pointId: id, event: 'reject', toState: 'rejected' };
    for (const template of ['point.returned', 'point.approved', 'point.rejected'] as const) {
      expect(await load(template, event!.id)).toEqual({
        event: subject,
        point: { id, authorId: author.id, state: 'rejected' },
      });
    }
    // The subject is the event, never the point it belongs to.
    expect(await load('point.rejected', id)).toBeNull();
  });

  it.each(TEMPLATE_NAMES)('gives null for a missing subject of %s', async (template) => {
    expect(await load(template, MISSING)).toBeNull();
  });

  it('does not read a user through a request template', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    expect(await load('access.approved', user.id)).toBeNull();
  });
});
