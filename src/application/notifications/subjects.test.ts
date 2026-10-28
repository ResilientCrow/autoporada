import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { TEMPLATE_NAMES, type TemplateName } from '@/notify';

import { setupWorld } from '../../../test/support/world';
import { loadSubject } from './index';

const world = setupWorld();
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

  it.each(TEMPLATE_NAMES)('gives null for a missing subject of %s', async (template) => {
    expect(await load(template, MISSING)).toBeNull();
  });

  it('does not read a user through a request template', async () => {
    const user = await world.seed.user({ role: 'submitter' });
    expect(await load('access.approved', user.id)).toBeNull();
  });
});
