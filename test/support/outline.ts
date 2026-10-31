/**
 * Fixtures of the outline and issue-text tests: the headmaster, the Mondays of the open calendar at
 * the world's clock start, approved proposals, and the audit rows of the headmaster's edits.
 */
import { randomUUID } from 'node:crypto';

import { system, type UserRecord } from '@/application/ports';
import { addOutlineItem, readOutline } from '@/application/use-cases';
import { calDate, toIsoDate, type CalDate } from '@/domain/time';
import type { PointKind } from '@/domain/report';
import { SEED_OUTLINE } from '@/domain/outline';
import { deadline, DEFAULT_DEADLINE } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import type { IssueStatus } from '@/domain/review';

import { paragraph, doc, pointFixtures, FIRST_MONDAY } from './points';
import type { World } from './world';

/** Open Mondays at the clock start (Monday 19 October 2026): their deadlines are ahead. */
export const WEEK_1 = FIRST_MONDAY;
export const WEEK_2 = calDate(2026, 11, 2);
export const WEEK_3 = calDate(2026, 11, 9);
export const monday = (date: CalDate) => toIsoDate(date);

/** The seed's items by their fixed lineage numbers, to look up one slot without a literal id. */
const SEED_POKYNY = SEED_OUTLINE.pokyny;
export const slotRow = (slot: string) => SEED_POKYNY.find((r) => r.slot === slot)!;

export const richText = (text: string) => doc(paragraph(text));

export function outlineFixtures(world: World) {
  const points = pointFixtures(world);
  const headmaster = () => world.seed.user({ role: 'headmaster' });

  /** The audit rows of `action`s, in order. */
  const auditOf = async (...actions: string[]) =>
    (await world.inspect.audit()).filter((row) => actions.includes(row.action));

  /** Adds a one-off item through the use case; returns its lineage id. */
  async function addItem(
    by: UserRecord,
    day: CalDate,
    title: string,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const lineageId = randomUUID();
    const result = await world.run(addOutlineItem, world.as(by), {
      monday: monday(day),
      lineageId,
      section: 'pokyny',
      title,
      persistence: 'standing',
      ...over,
    });
    if (!result.ok) throw new Error(`add refused: ${JSON.stringify(result.error)}`);
    return lineageId;
  }

  /** An approved proposal due for `week` (a pokyn by default), by a fresh submitter. */
  async function approvedProposal(
    kind: Extract<PointKind, 'pokyn' | 'finance'> = 'pokyn',
    week: CalDate = WEEK_1,
  ): Promise<string> {
    const author = await world.seed.user({ role: 'submitter' });
    const id = await points.start(author, kind);
    await points.moveTo(author, id, 'approved', week);
    return id;
  }

  const readAs = (by: UserRecord, day: CalDate) =>
    world.run(readOutline, world.as(by), { monday: monday(day) });

  /** The issue row of a Monday as the system sees it. */
  const issueOf = (day: CalDate) =>
    world.tx(
      system('test.seed'),
      async (tx) => (await tx.issues.between(day, day))[0] ?? null,
      'read',
    );

  /** A row as the world holds it in `status`, reached through the repository (the week's deadline as the default rule). */
  const seedIssue = (day: CalDate, status: IssueStatus) =>
    world.tx(system('test.seed'), async (tx) => {
      const { issue } = await tx.issues.ensure({
        monday: day,
        meetingDate: day,
        schoolYear: schoolYear(day),
        deadlineAt: deadline(day, DEFAULT_DEADLINE),
      });
      return status === 'open' ? issue : tx.issues.setStatus(issue.id, issue.version, status);
    });

  return { ...points, seedIssue, headmaster, auditOf, addItem, approvedProposal, readAs, issueOf };
}
