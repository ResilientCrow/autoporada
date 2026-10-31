'use client';

import { useState } from 'react';

import { registry } from '@/ui/copy';
import { LiveStatus } from '@/ui/form';
import { ArrowLink, SlantLabel } from '@/ui/kit';

import type { AddEntriesAction, PreviewPasteAction } from './actions';
import { PasteForm, type PreviewRows } from './PasteForm';
import { PastePreview } from './PastePreview';

/** /registr/[klic]/vlozit: the list the rows will be added to. */
export interface PasteView {
  readonly list: { readonly id: string; readonly key: string; readonly title: string };
}

/**
 * The host of the two-step paste: the form, then the preview of what it would add. The pasted
 * text stays in the form and the rows in this state; after „Přidat vybrané“ both start afresh
 * (the form is keyed by the number of adds, the preview by the number of checks). Nothing is put in the URL.
 */
export function Paste({
  view,
  previewPaste,
  addEntries,
}: {
  readonly view: PasteView;
  readonly previewPaste: PreviewPasteAction;
  readonly addEntries: AddEntriesAction;
}) {
  const [preview, setPreview] = useState<{ rows: PreviewRows; checks: number } | null>(null);
  const [checks, setChecks] = useState(0);
  const [said, setSaid] = useState({ message: '', count: 0, adds: 0 });
  const { list } = view;
  return (
    <>
      <SlantLabel level={1}>{registry.paste.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>
          <ArrowLink href={`/registr/${list.key}`}>{registry.paste.back}</ArrowLink>
        </p>
        <LiveStatus message={said.message} count={said.count} />
        <PasteForm
          key={`form-${said.adds}`}
          action={previewPaste}
          listId={list.id}
          onRows={(rows) => {
            setChecks((n) => n + 1);
            setPreview({ rows, checks: checks + 1 });
          }}
        />
        {preview !== null && (
          <PastePreview
            key={preview.checks}
            action={addEntries}
            listId={list.id}
            rows={preview.rows}
            onAdded={(added) => {
              setPreview(null);
              setSaid((s) => ({
                message: registry.paste.added(added),
                count: s.count + 1,
                adds: s.adds + 1,
              }));
            }}
          />
        )}
      </div>
    </>
  );
}
