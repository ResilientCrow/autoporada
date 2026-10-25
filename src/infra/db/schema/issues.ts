import { sql } from 'drizzle-orm';
import { check, date, integer, pgEnum, pgTable, text, unique } from 'drizzle-orm/pg-core';

import { at, createdAt, id } from './columns';

export const issueStatus = pgEnum('issue_status', ['open', 'generated', 'skipped']);

/**
 * One row per meeting Monday that someone submitted to or skipped (design
 * §3). The deadline is frozen when the row is made: a deadline already shown
 * never moves. Migration 0012 lets `version` rise only by one per update.
 */
export const issues = pgTable(
  'issues',
  {
    id: id(),
    monday: date({ mode: 'string' }).notNull(),
    /** The day the meeting is held; the Monday itself in M8 (ADR 0018 defers moving it). */
    meetingDate: date({ mode: 'string' }).notNull(),
    /** `schoolYear(monday)`, e.g. `2026/2027`. */
    schoolYear: text().notNull(),
    deadlineAt: at().notNull(),
    status: issueStatus().notNull().default('open'),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: at().notNull().defaultNow(),
  },
  (t) => [
    unique('issues_monday_key').on(t.monday),
    check('issues_is_monday', sql`extract(isodow from ${t.monday}) = 1`),
    check(
      'issues_meeting_in_week',
      sql`${t.meetingDate} >= ${t.monday} AND ${t.meetingDate} < ${t.monday} + 7`,
    ),
    check('issues_school_year', sql`${t.schoolYear} ~ '^\\d{4}/\\d{4}$'`),
  ],
);
