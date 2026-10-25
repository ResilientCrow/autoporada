'use client';

import { useRef, useState } from 'react';

import type { IssueStatus } from '@/domain/review';
import { issues } from '@/ui/copy';
import { LiveStatus, NoScriptNotice, useFocusOnRise } from '@/ui/form';
import { Card } from '@/ui/kit';
import { Chip, ISSUE_LOOK } from '@/ui/status';

import { dateId } from './inputs';
import { SkipForm, type SkipAction } from './SkipForm';

/** One Monday as the page knows it; `version` is null where it has no row yet. */
export interface MeetingDay {
  readonly monday: string;
  /** The date as people read it, „9. 11. 2026“. */
  readonly label: string;
  readonly status: IssueStatus;
  readonly version: number | null;
}

/** An issue that can still be skipped or brought back, and the event that does it. */
const EVENT = { open: 'skip', skipped: 'unskip' } as const;

/**
 * „Nejbližší porady“ for the headmaster: the next Mondays with their status,
 * and for each one that is not yet generated the confirmed button that skips
 * the meeting or brings it back. A generated Monday has no form (M9). The
 * title is the focus target after a change; the write refreshes the page, which
 * flips the status, and the status region says what happened.
 */
export function MeetingStrip({
  days,
  setSkipped,
}: {
  readonly days: readonly MeetingDay[];
  readonly setSkipped: SkipAction;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const say = (message: string) => setSaid((s) => ({ message, count: s.count + 1 }));
  useFocusOnRise(heading, said.count);
  return (
    <Card title={issues.strip.title} headingRef={heading}>
      <ul className="space-y-4">
        {days.map((day) => (
          <li key={day.monday}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={dateId(day.monday)} tabIndex={-1} className="font-bold">
                {day.label}
              </h3>
              <Chip look={ISSUE_LOOK[day.status]} />
            </div>
            {day.status !== 'generated' && (
              <SkipForm
                key={day.status}
                action={setSkipped}
                monday={day.monday}
                label={day.label}
                labelledBy={dateId(day.monday)}
                version={day.version}
                event={EVENT[day.status]}
                onDone={(event) => say(issues.strip.said[event](day.label))}
              />
            )}
          </li>
        ))}
      </ul>
      <LiveStatus message={said.message} count={said.count} />
      {days.some((day) => day.status !== 'generated') && <NoScriptNotice />}
    </Card>
  );
}
