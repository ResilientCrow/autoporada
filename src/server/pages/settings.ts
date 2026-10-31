import type { z } from 'zod';

import { readSettings } from '@/application/use-cases';
import { toDeadlineRule, type settingsReadOutput } from '@/contracts';
import { deadline, ruleFrom } from '@/domain/calendar';
import { formatNumericDate, formatTime, weekdayName } from '@/domain/cs';
import { can } from '@/domain/policy';
import { instantToWallClock, parseIsoDate } from '@/domain/time';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { readWindow } from './standing';
import { getViewer, requestId } from './viewer';

/** What saving a new deadline rule leaves alone and where it starts, written out for the effect line. */
interface DeadlineEffect {
  /** The porada people are shown now, „9. 11. 2026“. */
  readonly keep: string;
  /** The weekday and time its deadline stays at, „sobota“ and „20.00“. */
  readonly day: string;
  readonly time: string;
  /** The first porada the new rule applies to. */
  readonly from: string;
}

/** /nastaveni: each setting with the version its form must name, and the deadline's effect. */
export interface SettingsPageModel {
  readonly deadline: {
    readonly rule: z.output<typeof settingsReadOutput>['deadline']['value'];
    readonly version: number;
  };
  readonly reminders: z.output<typeof settingsReadOutput>['reminders'];
  readonly annex1: z.output<typeof settingsReadOutput>['texts.annex1'];
  readonly effect: DeadlineEffect;
}

/**
 * The effect of a new rule, from the calendar `issues.window` gives: the same `keep` (the Monday
 * a hand-in goes to now) and `ruleFrom` the save uses, and the deadline frozen on that porada's
 * row, or the one the rule in force counts for a Monday without a row. The wire has no meeting
 * date until M9 row 35: a porada meets on its Monday.
 */
function effectOf(window: NonNullable<Awaited<ReturnType<typeof readWindow>>>): DeadlineEffect {
  const keep = parseIsoDate(window.submitMonday);
  const row = window.issues.find((issue) => issue.monday === window.submitMonday);
  const deadlineAt = row ? new Date(row.deadlineAt) : deadline(keep, toDeadlineRule(window.rule));
  const { date, time } = instantToWallClock(deadlineAt);
  return {
    keep: formatNumericDate(keep),
    day: weekdayName(date),
    time: formatTime(time),
    from: formatNumericDate(ruleFrom(keep)),
  };
}

/** The settings page, or null for a visitor or anyone but the headmaster (404). */
export async function settingsPage(): Promise<SettingsPageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'settings.manage' })) return null;
  const read = orNotFound(
    'settings.read',
    await runRegistered(getContainer(), readSettings, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  );
  const window = await readWindow(viewer);
  if (read === null || window === null) return null;
  return {
    deadline: { rule: read.deadline.value, version: read.deadline.version },
    reminders: read.reminders,
    annex1: read['texts.annex1'],
    effect: effectOf(window),
  };
}
