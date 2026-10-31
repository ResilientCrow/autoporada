import {
  ScopeViolation,
  StaleVersion,
  type IssueRecord,
  type IssueRepo,
  type TxContext,
} from '@/application/ports';
import { can } from '@/domain/policy';
import { compareDates, mondayOf, toIsoDate } from '@/domain/time';

import { guard } from './guards';
import { newId, type FakeTxState } from './state';

/** The issue repository over the fake state, by ISO Monday as issues_monday_key. */
export function fakeIssueRepo(tx: FakeTxState, ctx: TxContext): IssueRepo {
  const { principal } = ctx;
  const { issues } = tx.draft;
  const save = (issue: IssueRecord) => {
    issues.set(toIsoDate(issue.monday), issue);
    tx.written.push({ type: 'issue', id: issue.id });
    return issue;
  };

  const versioned = (id: string, expectedVersion: number, set: Partial<IssueRecord>) => {
    guard(tx, true);
    if (principal.kind === 'user' && !can(principal.actor, { action: 'issue.generate' })) {
      throw new ScopeViolation();
    }
    const issue = [...issues.values()].find((i) => i.id === id);
    if (!issue || issue.version !== expectedVersion) throw new StaleVersion();
    return save({ ...issue, ...set, version: issue.version + 1 });
  };

  return {
    async ensure(issue) {
      guard(tx, true);
      // As INSERT ... ON CONFLICT (monday) DO NOTHING; the mutex stands in for the index wait.
      const existing = issues.get(toIsoDate(issue.monday));
      if (existing) return { issue: existing, inserted: false };
      const created = save({ ...issue, id: newId(tx.draft), status: 'open', version: 1 });
      return { issue: created, inserted: true };
    },
    async between(from, to) {
      guard(tx, false);
      return [...issues.values()]
        .filter((i) => compareDates(i.monday, from) >= 0 && compareDates(i.monday, to) <= 0)
        .sort((a, b) => compareDates(a.monday, b.monday));
    },
    async calendar(today) {
      guard(tx, false);
      const week = mondayOf(today);
      return [...issues.values()]
        .filter((i) => compareDates(i.monday, week) >= 0 || compareDates(i.meetingDate, today) >= 0)
        .sort((a, b) => compareDates(a.monday, b.monday))
        .map(({ monday, meetingDate, deadlineAt, status }) => ({
          monday,
          meetingDate,
          deadlineAt,
          status,
        }));
    },
    setStatus: async (id, expectedVersion, status) => versioned(id, expectedVersion, { status }),
    reschedule: async (id, expectedVersion, to) => versioned(id, expectedVersion, to),
  };
}
