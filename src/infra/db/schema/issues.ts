import { sql } from 'drizzle-orm';
import { check, date, integer, jsonb, pgEnum, pgTable, text, unique } from 'drizzle-orm/pg-core';

import type { RichDoc } from '@/domain/richtext';

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
    /** The day the meeting is held: the Monday until the headmaster moves the porada to any date (`issues.move`, ADR 0034); the meeting order is checked in TS. */
    meetingDate: date({ mode: 'string' }).notNull(),
    /** `schoolYear(monday)`, e.g. `2026/2027`. */
    schoolYear: text().notNull(),
    deadlineAt: at().notNull(),
    /** Přítomni and Hosté as the headmaster wrote them; null = carried from an earlier issue (D8). */
    presentText: text(),
    guestsText: text(),
    /** Příloha 2; null = carried, an empty doc = removed (D8). */
    annex2: jsonb().$type<RichDoc>(),
    status: issueStatus().notNull().default('open'),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: at().notNull().defaultNow(),
  },
  (t) => [
    unique('issues_monday_key').on(t.monday),
    check('issues_is_monday', sql`extract(isodow from ${t.monday}) = 1`),
    check('issues_school_year', sql`${t.schoolYear} ~ '^\\d{4}/\\d{4}$'`),
    check(
      'issues_texts',
      sql`char_length(coalesce(${t.presentText},'')) <= 2000 AND char_length(coalesce(${t.guestsText},'')) <= 2000 AND octet_length(coalesce(${t.annex2}::text,'')) <= 65536`,
    ),
  ],
);
