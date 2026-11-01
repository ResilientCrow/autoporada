import {
  ScopeViolation,
  StaleVersion,
  type IssueRecord,
  type IssueRepo,
  type TxContext,
} from '@/application/ports';
import { can } from '@/domain/policy';
import { compareDates, mondayOf, toIsoDate } from '@/domain/time';

import { guard, refusedBy } from './guards';
import { newId, type FakeTxState } from './state';

/** The issue repository over the fake state, by ISO Monday as issues_monday_key. */
export function fakeIssueRepo(tx: FakeTxState, ctx: TxContext): IssueRepo {
  const { principal } = ctx;
  const { issues, issueTexts } = tx.draft;
  const save = (issue: IssueRecord) => {
    issues.set(toIsoDate(issue.monday), issue);
    tx.written.push({ type: 'issue', id: issue.id });
    return issue;
  };

  const versioned = (
    id: string,
    expectedVersion: number,
    set: Partial<IssueRecord>,
    action: 'issue.generate' | 'issue.edit' = 'issue.generate',
  ) => {
    guard(tx, true);
    if (principal.kind === 'user' && !can(principal.actor, { action })) {
      throw new ScopeViolation();
    }
    const issue = [...issues.values()].find((i) => i.id === id);
    if (!issue || issue.version !== expectedVersion) throw new StaleVersion();
    return save({ ...issue, ...set, version: issue.version + 1 });
  };
  /** The calendar's rows that `keep`, by the columns the worker is granted, earliest Monday first. */
  const calendarRows = (keep: (issue: IssueRecord) => boolean) =>
    [...issues.values()]
      .filter(keep)
      .sort((a, b) => compareDates(a.monday, b.monday))
      .map(({ monday, meetingDate, deadlineAt, status }) => ({
        monday,
        meetingDate,
        deadlineAt,
        status,
      }));

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
      return calendarRows(
        (i) => compareDates(i.monday, week) >= 0 || compareDates(i.meetingDate, today) >= 0,
      );
    },
    async calendarBetween(from, to) {
      guard(tx, false);
      return calendarRows(
        (i) => compareDates(i.monday, from) >= 0 && compareDates(i.monday, to) <= 0,
      );
    },
    touch: async (id, expectedVersion) => versioned(id, expectedVersion, {}, 'issue.edit'),
    setTexts: async (id, expectedVersion, texts) => {
      const done = versioned(id, expectedVersion, {}, 'issue.edit');
      const key = toIsoDate(done.monday);
      const merged = {
        ...(issueTexts.get(key) ?? { present: null, guests: null, annex2: null }),
        ...Object.fromEntries(Object.entries(texts).filter(([, value]) => value !== undefined)),
      };
      // The issues_texts CHECK of migration 0033.
      const long = (text: string | null) => [...(text ?? '')].length > 2000;
      const bytes = Buffer.byteLength(merged.annex2 === null ? '' : JSON.stringify(merged.annex2));
      if (long(merged.present) || long(merged.guests) || bytes > 65536) {
        throw refusedBy('issues_texts');
      }
      issueTexts.set(key, structuredClone(merged));
      return done;
    },
    setStatus: async (id, expectedVersion, status) => versioned(id, expectedVersion, { status }),
    reschedule: async (id, expectedVersion, to) => versioned(id, expectedVersion, to),
  };
}
