'use client';

import { useState } from 'react';

import { registry } from '@/ui/copy';
import { LiveStatus, StepUpNotice } from '@/ui/form';
import { ArrowLink, SlantLabel } from '@/ui/kit';

import type { NewSchoolYearAction } from './actions';
import { NewYearForm, type NewYearList } from './NewYearForm';

/** /registr/novy-skolni-rok. */
export interface NewYearView {
  readonly lists: readonly NewYearList[];
  readonly years: { readonly options: readonly string[]; readonly initial: string };
}

/** The host of „Nový školní rok“: a fresh sign-in first, then the form. */
export function NewYear({
  view,
  freshAuth,
  newSchoolYear,
}: {
  readonly view: NewYearView;
  readonly freshAuth: boolean;
  readonly newSchoolYear: NewSchoolYearAction;
}) {
  const [said, setSaid] = useState({ message: '', count: 0 });
  return (
    <>
      <SlantLabel level={1}>{registry.newYear.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>
          <ArrowLink href="/registr">{registry.newYear.back}</ArrowLink>
        </p>
        <LiveStatus message={said.message} count={said.count} />
        {freshAuth ? (
          <NewYearForm
            key={said.count}
            action={newSchoolYear}
            lists={view.lists}
            years={view.years}
            onDone={(archived, deleted) =>
              setSaid((s) => ({
                message: registry.newYear.done(archived, deleted),
                count: s.count + 1,
              }))
            }
          />
        ) : (
          <StepUpNotice returnTo="/registr/novy-skolni-rok" />
        )}
      </div>
    </>
  );
}
