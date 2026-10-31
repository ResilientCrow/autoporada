'use client';

import { useState } from 'react';

import { registry } from '@/ui/copy';
import { CheckboxField, Form, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';
import { Notice } from '@/ui/kit';

import type { AddEntriesAction } from './actions';
import { addPickedInput } from './inputs';
import type { PreviewRows } from './PasteForm';

const { paste } = registry;

/** A row with a problem cannot be added; the headmaster fixes the text and checks again. */
const canAdd = (row: PreviewRows[number]) => row.problems.length === 0 && row.classCode !== null;

/** The group word of a `group-count` warning, read from the item as written: „obě“ of „(obě 2.B)“. */
const groupWord = (source: string) => /\(\s*([^\s)]+)/.exec(source)?.[1] ?? '';

/**
 * What the paste would add: a row per name with its class and problems. A row with a problem is
 * unticked and cannot be ticked; a warning leaves the row ticked. „Přidat vybrané“ sends the
 * ticked rows, which the server validates again.
 */
export function PastePreview({
  action,
  listId,
  rows,
  onAdded,
}: {
  readonly action: AddEntriesAction;
  readonly listId: string;
  readonly rows: PreviewRows;
  readonly onAdded: (added: number) => void;
}) {
  const [picked, setPicked] = useState(() => rows.map(canAdd));
  const state = useActionForm({
    action,
    toInput: addPickedInput(listId, rows),
    onSuccess: (value) => onAdded(value.added),
  });
  const spec: FormSpec = Object.fromEntries(
    rows.map((row, i) => [`pick.${i}`, { label: paste.preview.pickLabel(row.source) }]),
  );
  const count = picked.filter(Boolean).length;
  if (rows.length === 0) return <p>{paste.preview.empty}</p>;
  return (
    <Form id="nahled-vlozeni" spec={spec} state={state}>
      <h2 className="text-xl">{paste.preview.title}</h2>
      <table className="w-full text-left">
        <caption className="sr-only">{paste.preview.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{paste.preview.pick}</th>
            <th scope="col">{paste.preview.givenName}</th>
            <th scope="col">{paste.preview.familyName}</th>
            <th scope="col">{paste.preview.classCode}</th>
            <th scope="col">{paste.preview.notes}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <CheckboxField
                  name={`pick.${i}`}
                  optionalMark={false}
                  defaultChecked={canAdd(row)}
                  disabled={!canAdd(row)}
                  onChange={(checked) => setPicked((p) => p.map((v, j) => (j === i ? checked : v)))}
                />
              </td>
              <td>{row.givenName}</td>
              <td>{row.familyName}</td>
              <td>{row.classCode ?? paste.preview.none}</td>
              <td>
                {row.problems.map((problem) => (
                  <p key={problem}>{paste.problems[problem]}</p>
                ))}
                {row.warnings.map((warning) => (
                  <Notice key={warning} tone="info" live={false}>
                    {paste.groupCount(groupWord(row.source))}
                  </Notice>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SubmitButton isDisabled={count === 0}>{paste.preview.add(count)}</SubmitButton>
    </Form>
  );
}
