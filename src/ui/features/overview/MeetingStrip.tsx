'use client';

import { useRef, useState } from 'react';

import type { IssueStatus } from '@/domain/review';
import { issues, porada } from '@/ui/copy';
import { LiveStatus, useFocusOnRise } from '@/ui/form';
import { Card } from '@/ui/kit';
import { Chip, ISSUE_LOOK } from '@/ui/status';

import { AddPorada, type AddAction, type AddCalendar } from './AddPorada';

/** One porada as the page knows it; `version` is null where it has no row yet. */
export interface MeetingDay {
  readonly monday: string;
  /** The meeting date as people read it, „9. 11. 2026“. */
  readonly label: string;
  /** The deadline of a porada moved off its Monday, written out; null otherwise. */
  readonly held: { readonly weekday: string; readonly date: string; readonly time: string } | null;
  readonly status: IssueStatus;
  readonly version: number | null;
}

/**
 * „Nejbližší porady“ for the headmaster: the next poradas with their status, and „Přidat poradu“
 * (ADR 0054 item 9). Moving and dropping a porada are on its own page. The title is the focus
 * target after an add; the write refreshes the page, which lists the new porada, and the status
 * region says what happened.
 */
export function MeetingStrip({
  days,
  addIssue,
  calendar,
}: {
  readonly days: readonly MeetingDay[];
  readonly addIssue: AddAction;
  readonly calendar: AddCalendar;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const say = (message: string) => setSaid((s) => ({ message, count: s.count + 1 }));
  useFocusOnRise(heading, said.count);
  return (
    <Card
      title={issues.strip.title}
      headingRef={heading}
      aside={<AddPorada action={addIssue} calendar={calendar} onDone={say} />}
    >
      <ul className="space-y-4">
        {days.map((day) => (
          <li key={day.monday}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold">{day.label}</h3>
              <Chip look={ISSUE_LOOK[day.status]} />
            </div>
            {day.held !== null && <p>{porada.heldOn(day.label, day.held)}</p>}
          </li>
        ))}
      </ul>
      <LiveStatus message={said.message} count={said.count} />
    </Card>
  );
}
