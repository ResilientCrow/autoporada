import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import { contentWire } from '@/contracts';
import type { PointKind } from '@/domain/report';
import { calDate } from '@/domain/time';

import { pointFixtures, readyProposal, readyReport } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { reviewEditPoint, submitPoint } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = pointFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });

/** The point's stored content as the editor sends it back, with `over` changed. */
async function edited(id: string, over: Record<string, unknown> = {}) {
  const { point } = await snapshot(id);
  return { ...contentWire(point!.content), ...over };
}
const edit = (by: UserRecord, id: string, content: unknown, expectedVersion = 2) =>
  world.run(reviewEditPoint, world.as(by), { id, expectedVersion, content });

/**
 * A point the author handed in through the submit (version 2), approved past the use cases when
 * asked (version 3); one report per test, as its type's name is unique. Its stored content is the
 * ready report (the empty optional bullet dropped) or the ready proposal.
 */
async function handedIn(
  author: UserRecord,
  state: 'submitted' | 'approved' = 'submitted',
  kind: PointKind = 'report',
) {
  const id = await start(author, kind);
  const content = kind === 'report' ? readyReport() : readyProposal();
  const submitted = await world.run(submitPoint, world.as(author), {
    id,
    expectedVersion: 1,
    content,
  });
  if (!submitted.ok) throw new Error(`submit refused: ${submitted.error.code}`);
  if (state === 'approved') await moveTo(author, id, state);
  return id;
}

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}
/**
 * A handed-in report from before ADR 0071: its Účastníci row has people with a salutation each and
 * no address, which the submit now refuses; written past the use cases.
 */
async function withOlderParticipants(author: UserRecord, id: string) {
  await world.tx(world.as(author), async (tx) => {
    const point = (await tx.points.loadForWrite(id))!;
    const row = {
      key: 'participants',
      label: 'Účastníci',
      kind: 'people' as const,
      order: 'input' as const,
      people: [
        { salutation: 'pani' as const, givenName: 'Eva', familyName: 'Malá' },
        { salutation: 'pan' as const, givenName: 'Jan', familyName: 'Novák' },
      ],
    };
    await tx.points.update(id, point.version, {
      content: { ...point.content, bullets: [...point.content.bullets, row] },
    });
    await tx.audit.record({ action: 'point.seeded', target: { type: 'point', id } });
  });
}
const notEditable = { code: 'rule', rule: 'point-not-editable' };
const forbidden = { code: 'forbidden' };

describe('points.reviewEdit', () => {
  describe('editing', () => {
    it('lets a reviewer change a colleague’s submitted point, keeping the old values', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      const content = await edited(id, { title: 'Školní ples', eventDate: '2026-10-16' });
      expect(await edit(reviewer, id, content)).toEqual({
        ok: true,
        value: { version: 3, changed: true },
      });
      const { point, events } = await snapshot(id);
      expect(point).toMatchObject({ state: 'submitted', version: 3 });
      expect(point?.content).toMatchObject({
        title: 'Školní ples',
        eventDate: calDate(2026, 10, 16),
      });
      expect(events[0]).toMatchObject({
        event: 'edit',
        fromState: 'submitted',
        toState: 'submitted',
        actorId: reviewer.id,
        note: null,
        editedFields: ['title', 'eventDate'],
        before: { title: 'Den otevřených dveří', eventDate: calDate(2026, 10, 15) },
      });
    });

    it('audits the field names only, never the values', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      await edit(reviewer, id, await edited(id, { title: 'Tajný název', place: 'v aule' }));
      const { audit } = await snapshot(id);
      expect(audit.at(-1)).toEqual({
        actorId: reviewer.id,
        action: 'point.edited',
        targetType: 'point',
        targetId: id,
        data: { meta: { fields: ['title', 'place'] } },
        requestId: 'test',
      });
    });

    it('appends one event per edit, bumping the version once each time', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      await edit(reviewer, id, await edited(id, { title: 'První' }));
      expect(await edit(reviewer, id, await edited(id, { opening: 'Jiná věta.' }), 3)).toEqual({
        ok: true,
        value: { version: 4, changed: true },
      });
      const { point, events } = await snapshot(id);
      expect(point?.version).toBe(4);
      expect(events.filter((e) => e.event === 'edit').map((e) => e.before)).toEqual([
        { opening: 'Ve čtvrtek se konal den otevřených dveří.' },
        { title: 'Den otevřených dveří' },
      ]);
    });

    it('writes nothing for an edit that changes nothing, and says so', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      const before = await snapshot(id);
      expect(await edit(reviewer, id, await edited(id))).toEqual({
        ok: true,
        value: { version: 2, changed: false },
      });
      expect(await snapshot(id)).toEqual(before);
    });

    it('lets the headmaster change an approved point, and a reviewer a colleague’s', async () => {
      const headmaster = await user('headmaster');
      const reviewer = await user('reviewer');
      const first = await handedIn(await user(), 'approved');
      const second = await handedIn(await user(), 'approved', 'pokyn');
      expect((await edit(headmaster, first, await edited(first, { title: 'A' }), 3)).ok).toBe(true);
      expect((await edit(reviewer, second, await edited(second, { title: 'B' }), 3)).ok).toBe(true);
      expect((await snapshot(first)).point).toMatchObject({ state: 'approved', version: 4 });
    });
  });

  describe('who and when', () => {
    it('refuses the author, on their submitted point and on their own draft', async () => {
      const author = await user('reviewer');
      const submitted = await handedIn(author);
      await refuses(
        submitted,
        async () => edit(author, submitted, await edited(submitted, { title: 'X' })),
        notEditable,
      );
      const draft = await start(author, 'pokyn');
      await refuses(
        draft,
        async () => edit(author, draft, await edited(draft, { title: 'X' }), 1),
        notEditable,
      );
    });

    it('refuses a reviewer their own approved point as the author', async () => {
      const reviewer = await user('reviewer');
      const id = await handedIn(reviewer, 'approved');
      await refuses(
        id,
        async () => edit(reviewer, id, await edited(id, { title: 'X' }), 3),
        notEditable,
      );
    });

    it.each(['returned', 'rejected', 'withdrawn'] as const)(
      'forbids the headmaster a %s point they can see',
      async (state) => {
        const author = await user();
        const id = await start(author);
        await moveTo(author, id, 'submitted');
        await moveTo(author, id, state);
        const reviewer = await user('headmaster');
        await refuses(
          id,
          async () => edit(reviewer, id, await edited(id, { title: 'X' }), 3),
          forbidden,
        );
      },
    );

    it('hides a colleague’s draft from a reviewer as not found', async () => {
      const id = await start(await user());
      const reviewer = await user('reviewer');
      await refuses(id, async () => edit(reviewer, id, await edited(id), 1), { code: 'not-found' });
    });

    it('answers a stale version with conflict before the author or the state', async () => {
      const author = await user('reviewer');
      const id = await handedIn(author);
      const reviewer = await user('reviewer');
      await refuses(id, async () => edit(reviewer, id, await edited(id), 1), { code: 'conflict' });
      await refuses(id, async () => edit(author, id, await edited(id), 1), { code: 'conflict' });
    });
  });

  describe('content', () => {
    it('refuses what the save refuses, with the same field issues', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      await refuses(
        id,
        async () => edit(reviewer, id, await edited(id, { endDate: '2027-01-01' })),
        { code: 'invalid-input', fields: { 'content.endDate': 'invalid' } },
      );
      const textAsPeople = { key: 'organisers', label: 'Organizátoři', kind: 'text', text: 'x' };
      await refuses(
        id,
        async () => edit(reviewer, id, await edited(id, { bullets: [textAsPeople] })),
        { code: 'invalid-input', fields: { 'content.bullets': 'invalid' } },
      );
    });

    it('refuses a submitted report left without a title, an opening or an event date', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      await refuses(
        id,
        async () =>
          edit(reviewer, id, await edited(id, { title: ' ', opening: '', eventDate: null })),
        {
          code: 'invalid-input',
          fields: {
            'content.title': 'required',
            'content.eventDate': 'required',
            'content.opening': 'required',
          },
        },
      );
    });

    it('stores the content as the submit does, without an empty optional bullet', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      const { bullets } = await edited(id);
      const withEmpty = [
        ...(bullets as object[]),
        { key: 'results', label: 'Výsledky', kind: 'text', text: '' },
      ];
      const before = await snapshot(id);
      expect(await edit(reviewer, id, await edited(id, { bullets: withEmpty }))).toEqual({
        ok: true,
        value: { version: 2, changed: false },
      });
      expect(await snapshot(id)).toEqual(before);
      expect(
        await edit(reviewer, id, await edited(id, { title: 'Jiný', bullets: withEmpty })),
      ).toEqual({
        ok: true,
        value: { version: 3, changed: true },
      });
      const { point, events } = await snapshot(id);
      expect(point?.content.bullets.map((b) => b.key)).toEqual(['organisers']);
      expect(events[0]?.editedFields).toEqual(['title']);
    });
    describe('the participants’ address (ADR 0071)', () => {
      const addressed = async (id: string, over: Record<string, unknown>) => {
        const { bullets } = await edited(id);
        return (bullets as { key: string }[]).map((b) =>
          b.key === 'participants' ? { ...b, ...over } : b,
        );
      };

      it('lets a reviewer edit a report whose participants were handed in with no address', async () => {
        const author = await user();
        const id = await handedIn(author);
        await withOlderParticipants(author, id);
        const reviewer = await user('reviewer');
        const result = await edit(reviewer, id, await edited(id, { title: 'Jiný název' }), 3);
        expect(result).toEqual({ ok: true, value: { version: 4, changed: true } });
        const { point } = await snapshot(id);
        const row = point?.content.bullets.find((b) => b.key === 'participants');
        expect(row).toMatchObject({ people: [{ salutation: 'pani' }, { salutation: 'pan' }] });
        expect(row).not.toHaveProperty('address', expect.anything());
      });

      it('still asks for an address on a participants row the point did not have', async () => {
        const author = await user();
        const id = await handedIn(author);
        const reviewer = await user('reviewer');
        const row = {
          key: 'participants',
          label: 'Účastníci',
          kind: 'people',
          order: 'input',
          people: [{ salutation: 'pani', givenName: 'Eva', familyName: 'Malá' }],
        };
        const { bullets } = await edited(id);
        await refuses(
          id,
          async () =>
            edit(reviewer, id, await edited(id, { bullets: [...(bullets as object[]), row] })),
          { code: 'invalid-input', fields: { 'content.bullets.1.address': 'required' } },
        );
      });

      it('refuses „slečny a pánové“ for one person, even on an older row', async () => {
        const author = await user();
        const id = await handedIn(author);
        await withOlderParticipants(author, id);
        const reviewer = await user('reviewer');
        const one = [{ salutation: 'pani', givenName: 'Eva', familyName: 'Malá' }];
        await refuses(
          id,
          async () =>
            edit(
              reviewer,
              id,
              await edited(id, {
                bullets: await addressed(id, { people: one, address: 'slecny-a-panove' }),
              }),
              3,
            ),
          { code: 'invalid-input', fields: { 'content.bullets.1.address': 'several' } },
        );
      });
    });
  });
});
