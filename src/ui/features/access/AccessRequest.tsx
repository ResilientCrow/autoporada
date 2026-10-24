'use client';

import { useRef, useState } from 'react';

import { access } from '@/ui/copy';
import { LiveStatus, NoScriptNotice, useFocusOnRise } from '@/ui/form';
import { SlantLabel } from '@/ui/kit';

import { headingOf, hasForm, Standing, type AccessView } from './Standing';

/**
 * The host of „Žádost o přístup“. The h2 is one persistent element, the focus
 * target after a success; the status region and the no-JavaScript notice sit
 * outside the part that changes with the state.
 */
export function AccessRequest({ view }: { readonly view: AccessView }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [said] = useState({ message: '', count: 0 });
  useFocusOnRise(heading, said.count);
  return (
    <>
      <SlantLabel level={1}>{access.title}</SlantLabel>
      <h2 ref={heading} tabIndex={-1} className="mt-4 mb-2 text-xl">
        {headingOf(view)}
      </h2>
      <div className="space-y-3">
        <Standing view={view} />
      </div>
      <LiveStatus message={said.message} count={said.count} />
      {hasForm(view) && <NoScriptNotice />}
    </>
  );
}
