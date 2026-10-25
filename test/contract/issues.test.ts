import { describe, expect, inject, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  StaleVersion,
  system,
  type IssueRecord,
  type NewIssue,
  type Principal,
  type Tx,
} from '@/application/ports';
import type { IssueStatus } from '@/domain/review';
import { calDate, type CalDate } from '@/domain/time';

import { UnauditedWrite } from '../support/world/fake/oracle';
import { setupWorld } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');

/** The issue of `monday`, with a deadline on the Friday before at 12.00 Prague time. */
const issueOf = (monday: CalDate, deadlineAt = new Date('2026-10-23T10:00:00.123Z')): NewIssue => ({
  monday,
  meetingDate: monday,
  schoolYear: '2026/2027',
  deadlineAt,
});
const MONDAY = calDate(2026, 10, 26);

/** Ensures the issue and, when it was created, names it in an audit event, as a use case would. */
const ensure = (issue: NewIssue, by: Principal = cli) =>
  world.tx(by, async (tx) => {
    const result = await tx.issues.ensure(issue);
    if (result.inserted) {
      await tx.audit.record({
        action: 'point.submit',
        target: null,
        related: [{ type: 'issue', id: result.issue.id }],
      });
    }
    return result;
  });

const setStatus = (
  row: IssueRecord,
  status: IssueStatus,
  version = row.version,
  by: Principal = cli,
) =>
  world.tx(by, async (tx) => {
    const after = await tx.issues.setStatus(row.id, version, status);
    await tx.audit.record({ action: 'issue.skip', target: { type: 'issue', id: row.id } });
    return after;
  });

const read = <T>(work: (tx: Tx) => Promise<T>) => world.tx(cli, work, 'read');

describe('IssueRepo (port contract)', () => {
  it('creates an open issue at version 1 the first time and returns that row ever after', async () => {
    const first = await ensure(issueOf(MONDAY));
    expect(first).toEqual({
      inserted: true,
      issue: {
        id: first.issue.id,
        monday: MONDAY,
        meetingDate: MONDAY,
        schoolYear: '2026/2027',
        deadlineAt: new Date('2026-10-23T10:00:00.123Z'),
        status: 'open',
        version: 1,
      },
    });
    // A later rule computes another deadline: the one already shown never moves.
    const again = await ensure(issueOf(MONDAY, new Date('2026-10-22T10:00:00Z')));
    expect(again).toEqual({ inserted: false, issue: first.issue });
    const rows = await read((tx) => tx.issues.between(MONDAY, MONDAY));
    expect(rows).toEqual([first.issue]);
  });

  it('keeps the frozen deadline as the exact instant it was given', async () => {
    const deadlineAt = new Date('2026-11-27T22:59:59.999Z');
    const monday = calDate(2026, 11, 30);
    await ensure(issueOf(monday, deadlineAt));
    const [row] = await read((tx) => tx.issues.between(monday, monday));
    expect(row?.deadlineAt.getTime()).toBe(deadlineAt.getTime());
  });

  it('lists the issues of a window of Mondays, both ends included, earliest first', async () => {
    const mondays = [calDate(2026, 11, 16), calDate(2026, 11, 2), calDate(2026, 11, 9)];
    for (const monday of [...mondays, calDate(2026, 10, 26), calDate(2026, 11, 23)]) {
      await ensure(issueOf(monday));
    }
    const rows = await read((tx) => tx.issues.between(calDate(2026, 11, 2), calDate(2026, 11, 16)));
    expect(rows.map((row) => row.monday)).toEqual([
      calDate(2026, 11, 2),
      calDate(2026, 11, 9),
      calDate(2026, 11, 16),
    ]);
    expect(
      await read((tx) => tx.issues.between(calDate(2027, 1, 4), calDate(2027, 1, 25))),
    ).toEqual([]);
  });

  it('changes the status against the expected version and raises it by one', async () => {
    const { issue } = await ensure(issueOf(MONDAY));
    const skipped = await setStatus(issue, 'skipped');
    expect(skipped).toEqual({ ...issue, status: 'skipped', version: 2 });
    expect(await read((tx) => tx.issues.between(MONDAY, MONDAY))).toEqual([skipped]);
    const reopened = await setStatus(skipped, 'open');
    expect(reopened).toMatchObject({ status: 'open', version: 3 });
  });

  it('refuses a status change on a stale version or an unknown issue', async () => {
    const { issue } = await ensure(issueOf(MONDAY));
    await setStatus(issue, 'skipped');
    await expect(setStatus(issue, 'open')).rejects.toBeInstanceOf(StaleVersion);
    await expect(
      setStatus({ ...issue, id: '00000000-0000-7000-8000-999999999999' }, 'open', 2),
    ).rejects.toBeInstanceOf(StaleVersion);
    expect(await read((tx) => tx.issues.between(MONDAY, MONDAY))).toMatchObject([
      { status: 'skipped', version: 2 },
    ]);
  });

  it('lets only someone who may run the meeting change its status', async () => {
    const author = await world.seed.user({ role: 'submitter' });
    const head = await world.seed.user({ role: 'headmaster' });
    const { issue } = await ensure(issueOf(MONDAY), world.as(author));
    await expect(
      setStatus(issue, 'skipped', issue.version, world.as(author)),
    ).rejects.toBeInstanceOf(ScopeViolation);
    expect(await setStatus(issue, 'skipped', issue.version, world.as(head))).toMatchObject({
      status: 'skipped',
    });
  });

  it('writes nothing in a read transaction', async () => {
    await expect(read((tx) => tx.issues.ensure(issueOf(MONDAY)))).rejects.toBeInstanceOf(
      DatabaseFailure,
    );
  });
});

describe.runIf(inject('world') === 'fake')('issue audit coverage in the fake world', () => {
  it('fails a commit that created an issue no audit event names', async () => {
    const unaudited = world.tx(cli, (tx) => tx.issues.ensure(issueOf(MONDAY)));
    await expect(unaudited).rejects.toBeInstanceOf(UnauditedWrite);
  });

  it('fails a commit that changed a status no audit event names', async () => {
    const { issue } = await ensure(issueOf(MONDAY));
    const unaudited = world.tx(cli, (tx) =>
      tx.issues.setStatus(issue.id, issue.version, 'skipped'),
    );
    await expect(unaudited).rejects.toBeInstanceOf(UnauditedWrite);
  });
});
