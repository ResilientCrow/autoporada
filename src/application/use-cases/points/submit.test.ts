import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { deadline, DEFAULT_DEADLINE } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import { addDays, calDate, parseIsoDate, toIsoDate } from '@/domain/time';

import {
  doc,
  FIRST_MONDAY,
  START,
  paragraph,
  person,
  pointFixtures,
  readyProposal,
  readyReport,
  wire,
} from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { savePoint, submitPoint } from './index';

const world = setupWorld();
const { start, moveTo, get, snapshot } = pointFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const submit = (by: UserRecord, id: string, content: unknown, expectedVersion = 1) =>
  world.run(submitPoint, world.as(by), { id, expectedVersion, content });

/** Expects the submit to fail with `error` and to change nothing anywhere. */
async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}
const invalid = (fields: Record<string, string>) => ({ code: 'invalid-input', fields });
const forbidden = { code: 'forbidden' };

describe('points.submit', () => {
  describe('a first submit', () => {
    it('hands in the sent content, minus empty optional bullets, for the first open Monday', async () => {
      const author = await user();
      const id = await start(author);
      const draft = { id, expectedVersion: 1, content: wire({ title: 'Koncept' }) };
      expect((await world.run(savePoint, world.as(author), draft)).ok).toBe(true);
      expect(await submit(author, id, readyReport(), 2)).toEqual({
        ok: true,
        value: { version: 3 },
      });

      const sent = readyReport();
      expect(await get(author, id)).toMatchObject({
        state: 'submitted',
        version: 3,
        earliestMonday: FIRST_MONDAY,
        handInMonday: FIRST_MONDAY,
        submittedAt: world.clock.now(),
        content: {
          ...sent,
          eventDate: parseIsoDate('2027-01-14'),
          bullets: [sent.bullets[0]],
        },
      });
    });

    it('makes the Monday’s issue with its deadline frozen and names it in the audit event', async () => {
      const author = await user();
      const id = await start(author);
      await submit(author, id, readyReport());
      const { audit, events, issues } = await snapshot(id);
      const [issue] = issues;
      expect(issues).toHaveLength(1);
      expect(issue).toMatchObject({
        monday: FIRST_MONDAY,
        status: 'open',
        schoolYear: schoolYear(FIRST_MONDAY),
        deadlineAt: deadline(FIRST_MONDAY, DEFAULT_DEADLINE),
      });
      expect(audit.at(-1)).toEqual({
        actorId: author.id,
        action: 'point.submitted',
        targetType: 'point',
        targetId: id,
        data: {
          diff: {
            state: { from: 'draft', to: 'submitted' },
            earliestMonday: { from: null, to: '2026-10-26' },
            submittedAt: { from: null, to: world.clock.now().toISOString() },
            handInMonday: { from: null, to: '2026-10-26' },
          },
          meta: { kind: 'report' },
          related: [{ type: 'issue', id: issue!.id }],
        },
        requestId: 'test',
      });
      expect(events).toMatchObject([
        { event: 'submit', fromState: 'draft', toState: 'submitted', actorId: author.id },
      ]);
    });

    it('does not name an issue another point already made', async () => {
      const first = await user();
      await submit(first, await start(first, 'pokyn'), readyProposal());
      const author = await user();
      const id = await start(author, 'pokyn');
      expect((await submit(author, id, readyProposal())).ok).toBe(true);
      const { audit, issues, point } = await snapshot(id);
      expect(issues).toHaveLength(1);
      expect(point?.earliestMonday).toEqual(FIRST_MONDAY);
      expect(audit.at(-1)?.data).not.toHaveProperty('related');
    });

    it.each([
      ['a minute before', '2026-10-24T17:59:00Z', FIRST_MONDAY],
      ['at', '2026-10-24T18:00:00Z', calDate(2026, 11, 2)],
    ])('submitted %s the Saturday 20.00 deadline, lands on %s', async (_when, now, monday) => {
      world.clock.set(new Date(now));
      const author = await user();
      const id = await start(author, 'pokyn');
      await submit(author, id, readyProposal());
      expect(await get(author, id)).toMatchObject({ earliestMonday: monday, handInMonday: monday });
    });

    it('steps over a skipped Monday: the first Monday is the next open one', async () => {
      await world.tx(system('test.seed'), async (tx) => {
        const { issue } = await tx.issues.ensure({
          monday: FIRST_MONDAY,
          meetingDate: FIRST_MONDAY,
          schoolYear: schoolYear(FIRST_MONDAY),
          deadlineAt: deadline(FIRST_MONDAY, DEFAULT_DEADLINE),
        });
        await tx.issues.setStatus(issue.id, issue.version, 'skipped');
      });
      const author = await user();
      const id = await start(author, 'pokyn');
      await submit(author, id, readyProposal());
      const next = addDays(FIRST_MONDAY, 7);
      expect(await get(author, id)).toMatchObject({ earliestMonday: next, handInMonday: next });
    });
  });

  describe('a report about a late event', () => {
    // The event ends Sunday 2026-11-01 21.00: due 23.00, after the Saturday 20.00 deadline.
    const lateDates = { eventDate: '2026-11-01', timeFrom: '18:00', timeTo: '21:00' };
    const lateEvent = readyReport(lateDates);
    const NEXT = calDate(2026, 11, 2);

    it('lands in the porada before it, as hand-in and earliest Monday, until its close', async () => {
      world.clock.set(new Date('2026-11-01T21:59:00Z'));
      const author = await user();
      const id = await start(author);
      expect((await submit(author, id, lateEvent)).ok).toBe(true);
      expect(await get(author, id)).toMatchObject({ earliestMonday: NEXT, handInMonday: NEXT });
      expect((await snapshot(id)).issues.map((issue) => toIsoDate(issue.monday))).toEqual([
        '2026-11-02',
      ]);
    });

    it('goes to the porada after that once its close has passed', async () => {
      world.clock.set(new Date('2026-11-01T22:00:00Z'));
      const author = await user();
      const id = await start(author);
      expect((await submit(author, id, lateEvent)).ok).toBe(true);
      const after = addDays(NEXT, 7);
      expect(await get(author, id)).toMatchObject({ earliestMonday: after, handInMonday: after });
    });

    it('is placed by the same rule again when it is handed in after a return', async () => {
      world.clock.set(new Date('2026-11-01T20:00:00Z'));
      const author = await user();
      const id = await start(author);
      await submit(author, id, lateEvent);
      await moveTo(author, id, 'returned');
      world.clock.set(new Date('2026-11-01T22:30:00Z'));
      expect((await submit(author, id, lateEvent, 3)).ok).toBe(true);
      expect(await get(author, id)).toMatchObject({
        earliestMonday: NEXT,
        handInMonday: addDays(NEXT, 7),
      });
    });

    it.each([
      ['a proposal dated like the late event', 'pokyn', readyProposal(lateDates)],
      [
        'a report about an event that ended Friday',
        'report',
        readyReport({ eventDate: '2026-10-30', timeFrom: '13:00', timeTo: '15:00' }),
      ],
    ] as const)('gives %s no extra time', async (_name, kind, content) => {
      world.clock.set(new Date('2026-11-01T20:00:00Z'));
      const author = await user();
      const id = await start(author, kind);
      expect((await submit(author, id, content)).ok).toBe(true);
      expect(await get(author, id)).toMatchObject({ handInMonday: addDays(NEXT, 7) });
    });
  });

  describe('a resubmit', () => {
    it.each(['returned', 'draft'] as const)(
      'from %s keeps the first Monday and makes no issue',
      async (state) => {
        const author = await user();
        const id = await start(author, 'pokyn');
        await submit(author, id, readyProposal());
        await moveTo(author, id, state);
        world.clock.set(new Date('2026-11-03T10:00:00Z'));
        expect(await submit(author, id, readyProposal({ title: 'Znovu' }), 3)).toEqual({
          ok: true,
          value: { version: 4 },
        });
        const { point, issues, audit, events } = await snapshot(id);
        expect(point).toMatchObject({
          state: 'submitted',
          earliestMonday: FIRST_MONDAY,
          handInMonday: calDate(2026, 11, 9),
          submittedAt: world.clock.now(),
          content: { title: 'Znovu' },
        });
        expect(issues.map((issue) => toIsoDate(issue.monday))).toEqual(['2026-10-26']);
        expect(audit.at(-1)?.data).toEqual({
          diff: {
            state: { from: state, to: 'submitted' },
            submittedAt: {
              from: '2026-10-19T08:00:00.000Z',
              to: '2026-11-03T10:00:00.000Z',
            },
            handInMonday: { from: '2026-10-26', to: '2026-11-09' },
          },
          meta: { kind: 'pokyn' },
        });
        expect(events[0]).toMatchObject({
          event: 'submit',
          fromState: state,
          toState: 'submitted',
        });
      },
    );
  });

  describe('readiness', () => {
    it('refuses an unfinished report with one field issue per missing field', async () => {
      const author = await user();
      const id = await start(author);
      await refuses(
        id,
        () => submit(author, id, wire()),
        invalid({
          'content.title': 'required',
          'content.eventDate': 'required',
          'content.bullets': 'required',
          'content.opening': 'required',
          'content.statements': 'required',
        }),
      );
    });

    it('refuses a time that ends before it starts and a person without a salutation', async () => {
      const author = await user();
      const id = await start(author);
      const nameless = { ...person, salutation: null };
      const bullets = [
        {
          key: 'organisers',
          label: 'Organizátoři',
          kind: 'people',
          order: 'input',
          people: [nameless],
        },
      ];
      await refuses(
        id,
        () => submit(author, id, readyReport({ timeFrom: '10:00', timeTo: '9:00', bullets })),
        invalid({
          'content.timeTo': 'invalid',
          'content.bullets.0.people.0.salutation': 'required',
        }),
      );
    });

    it.each(['finance', 'pokyn'] as const)('asks a %s for a title and a text', async (kind) => {
      const author = await user();
      const id = await start(author, kind);
      await refuses(
        id,
        () => submit(author, id, wire()),
        invalid({ 'content.title': 'required', 'content.body': 'required' }),
      );
    });

    /** The ready report with its organiser's class confirmed for `year`. */
    const classOf = (year: string) =>
      readyReport({
        bullets: [
          {
            key: 'organisers',
            label: 'Organizátoři',
            kind: 'people',
            order: 'input',
            people: [{ ...person, affiliation: '3.B', affiliationYear: year }],
          },
        ],
      });

    it('refuses a class confirmed for an earlier school year', async () => {
      const author = await user();
      const id = await start(author);
      await refuses(
        id,
        () => submit(author, id, classOf('2025/2026')),
        invalid({ 'content.bullets.0.people.0.affiliation': 'invalid' }),
      );
    });

    it.each([
      ['in October', START.toISOString(), '2026/2027'],
      ['at 0.30 on 1 September in Prague', '2026-08-31T22:30:00Z', '2026/2027'],
      ['on 31 August, its Monday in September', '2026-08-31T10:00:00Z', '2025/2026'],
    ])('takes the school year of the day it is submitted: %s', async (_when, now, year) => {
      world.clock.set(new Date(now));
      const author = await user();
      const id = await start(author);
      expect(await submit(author, id, classOf(year))).toEqual({
        ok: true,
        value: { version: 2 },
      });
    });

    it('submits despite a warning: a speaker who is not a participant', async () => {
      const author = await user();
      const id = await start(author);
      const stranger = { ...person, givenName: 'Jana', familyName: 'Nová' };
      const statements = [{ speaker: stranger, speakerGenitive: 'paní Jany Nové', quote: 'Ano.' }];
      expect((await submit(author, id, readyReport({ statements }))).ok).toBe(true);
    });

    it('applies the save’s kind checks first', async () => {
      const author = await user();
      const report = await start(author);
      const outline = doc(paragraph('Úvod'), paragraph('bod', 2));
      await refuses(
        report,
        () => submit(author, report, readyReport({ body: outline })),
        invalid({ 'content.body': 'invalid' }),
      );
      const pokyn = await start(author, 'pokyn');
      await refuses(
        pokyn,
        () => submit(author, pokyn, readyProposal({ statements: readyReport().statements })),
        invalid({ 'content.statements': 'invalid' }),
      );
    });
  });

  describe('version, author and state', () => {
    it('answers a stale version with conflict whatever the state', async () => {
      const author = await user();
      const id = await start(author, 'pokyn');
      await moveTo(author, id, 'approved');
      await refuses(id, () => submit(author, id, readyProposal(), 1), { code: 'conflict' });
    });

    it.each(['submitted', 'approved', 'rejected', 'withdrawn', 'published'] as const)(
      'refuses the author’s %s point',
      async (state) => {
        const author = await user();
        const id = await start(author, 'pokyn');
        await moveTo(author, id, state);
        await refuses(id, () => submit(author, id, readyProposal(), 2), forbidden);
      },
    );

    it('refuses a reviewer who is not the author of a returned point', async () => {
      const author = await user();
      const id = await start(author, 'pokyn');
      await moveTo(author, id, 'returned');
      const reviewer = await user('reviewer');
      await refuses(id, () => submit(reviewer, id, readyProposal(), 2), forbidden);
    });

    it('does not find a colleague’s draft', async () => {
      const author = await user();
      const id = await start(author, 'pokyn');
      const headmaster = await user('headmaster');
      await refuses(id, () => submit(headmaster, id, readyProposal()), {
        code: 'not-found',
      });
    });

    it('cannot run for the system', async () => {
      const input = { id: randomUUID(), expectedVersion: 1, content: readyProposal() };
      await expect(world.run(submitPoint, system('cli:test'), input)).rejects.toThrow(
        'points.submit: runs as a signed-in user',
      );
    });
  });
});
