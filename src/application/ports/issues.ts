import type { KnownIssue } from '@/domain/calendar';
import type { IssueStatus } from '@/domain/review';
import type { CalDate } from '@/domain/time';

/** An issue row: a meeting Monday with its frozen deadline. */
export interface IssueRecord extends KnownIssue {
  readonly id: string;
  readonly meetingDate: CalDate;
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
   * Version-checked (StaleVersion, also for an unknown id); the version rises
   * by one. ScopeViolation for a user who may not `issue.generate`. The
   * caller checks the move against ISSUE_MACHINE.
   */
  setStatus(id: string, expectedVersion: number, status: IssueStatus): Promise<IssueRecord>;
}
