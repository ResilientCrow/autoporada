import type { IssueRow } from '@/domain/calendar';
import type { IssueStatus } from '@/domain/review';
import type { CalDate } from '@/domain/time';

import type { IssueTexts } from './issue-items';

/** An issue row: a meeting Monday with its meeting date and frozen deadline. */
export interface IssueRecord extends IssueRow {
  readonly id: string;
  readonly schoolYear: string;
  readonly version: number;
}

/** What `ensure` writes when the Monday has no row yet. */
export type NewIssue = Pick<IssueRecord, 'monday' | 'meetingDate' | 'schoolYear' | 'deadlineAt'>;

/** Meeting issues. Rows are not personal data: every principal may read them. */
export interface IssueRepo {
  /**
   * The Monday's row, made from `issue` if it has none (`inserted`). An
   * existing row comes back as it is, its deadline unchanged. A concurrent
   * caller waits for the first one to commit and then reads its row.
   */
  ensure(issue: NewIssue): Promise<{ readonly issue: IssueRecord; readonly inserted: boolean }>;
  /** The rows of the Mondays from `from` to `to`, both included, earliest first. */
  between(from: CalDate, to: CalDate): Promise<readonly IssueRecord[]>;
  /**
   * The calendar at `today` (a Prague date): the rows of the Mondays from this week's Monday on
   * and of any earlier Monday whose meeting is `today` or later (a porada moved past its week),
   * earliest Monday first. Only the columns the worker is granted (migrations 0024 and 0025), so jobs
   * read it too.
   */
  calendar(today: CalDate): Promise<readonly IssueRow[]>;
  /**
   * The rows of the Mondays from `from` to `to`, both included, earliest first, by the columns
   * `calendar` reads: what the soft reminder reads of the poradas before (ADR 0046).
   */
  calendarBetween(from: CalDate, to: CalDate): Promise<readonly IssueRow[]>;
  /**
   * Takes the issue row's lock (SELECT ... FOR UPDATE) until the transaction ends and returns the
   * row as it stands then, version unchanged. Whoever reads what a generation prints (the
   * placeholders) or writes it takes this first, so a write is never acknowledged after the
   * generation has read what it replaced. StaleVersion for an unknown id. The caller has read the
   * deadline rule first (lock order, row 12b).
   */
  lock(id: string): Promise<IssueRecord>;
  /**
   * Version-checked (StaleVersion, also for an unknown id); the version rises
   * by one. ScopeViolation for a user who may not `issue.generate`. The
   * caller checks the move against ISSUE_MACHINE.
   */
  setStatus(id: string, expectedVersion: number, status: IssueStatus): Promise<IssueRecord>;
  /**
   * Takes the issue's version for an outline write: version-checked, the version rises by one
   * (StaleVersion, also for an unknown id). ScopeViolation for a user who may not `issue.edit`.
   * The caller has read the deadline rule first (lock order, row 12b).
   */
  touch(id: string, expectedVersion: number): Promise<IssueRecord>;
  /**
   * Writes the given texts (a key left out stays as it is; an empty string or an empty doc is a
   * value) in one version-checked UPDATE, as `touch` does: the version rises by one, StaleVersion,
   * ScopeViolation for a user who may not `issue.edit`. The `issues_texts` CHECK refuses an
   * over-long text as `db.constraint.issues_texts`. The caller has read the deadline rule first.
   */
  setTexts(id: string, expectedVersion: number, texts: Partial<IssueTexts>): Promise<IssueRecord>;
  /**
   * Sets the meeting date and the frozen deadline, as `setStatus` sets the status: version-checked,
   * the version rises by one, ScopeViolation for a user who may not `issue.generate`. A new
   * deadline rule refreezes rows nobody was shown with it (ADR 0032); the caller checks the rest.
   */
  reschedule(
    id: string,
    expectedVersion: number,
    to: Pick<IssueRecord, 'meetingDate' | 'deadlineAt'>,
  ): Promise<IssueRecord>;
}
