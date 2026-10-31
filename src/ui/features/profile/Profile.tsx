'use client';

import { useRef, useState } from 'react';

import { profile } from '@/ui/copy';
import { LiveStatus, NoScriptNotice, useFocusOnRise } from '@/ui/form';
import { SlantLabel } from '@/ui/kit';

import { ReminderForm, type RemindersAction } from './ReminderForm';

/** What the page shows of the user's settings. */
interface ProfileView {
  readonly remindDeadline: boolean;
}

/**
 * The host of „Profil“. A save refreshes the page, which brings the saved state; the box is
 * uncontrolled, so it already shows what was asked for and the host only announces the answer.
 */
export function Profile({
  view,
  setReminders,
}: {
  readonly view: ProfileView;
  readonly setReminders: RemindersAction;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const say = (message: string) => setSaid((s) => ({ message, count: s.count + 1 }));
  useFocusOnRise(heading, said.count);
  return (
    <>
      <SlantLabel level={1}>{profile.title}</SlantLabel>
      <section className="mt-4 space-y-3">
        <h2 ref={heading} tabIndex={-1} className="text-xl">
          {profile.reminders.title}
        </h2>
        <ReminderForm
          key={`reminders-${view.remindDeadline}`}
          action={setReminders}
          remindDeadline={view.remindDeadline}
          onSaved={(changed) =>
            say(changed ? profile.reminders.said.changed : profile.reminders.said.unchanged)
          }
        />
      </section>
      <LiveStatus message={said.message} count={said.count} />
      <NoScriptNotice />
    </>
  );
}
