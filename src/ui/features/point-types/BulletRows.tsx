'use client';

import { pointTypes } from '@/ui/copy';
import { fieldId, SelectField, TextField } from '@/ui/form';
import { Button } from '@/ui/kit';

import { Check } from './Check';
import type { BulletRow } from './rows';

const { bullets: copy } = pointTypes;

const KIND_OPTIONS = [
  { value: 'people', label: copy.kinds.people },
  { value: 'text', label: copy.kinds.text },
];

/**
 * The bullets a type offers, one fieldset per row, named `defaultBullets.<i>.<field>`. The key
 * of a saved row travels in a hidden field; a new row has none yet. The fieldset takes the focus
 * the error summary links to for a problem with the list as a whole.
 */
export function BulletRows({
  formId,
  rows,
  canAdd,
  onAdd,
  onRemove,
}: {
  readonly formId: string;
  readonly rows: readonly BulletRow[];
  readonly canAdd: boolean;
  readonly onAdd: () => void;
  readonly onRemove: (uid: number) => void;
}) {
  return (
    <fieldset id={fieldId(formId, 'defaultBullets')} tabIndex={-1} className="space-y-4">
      <legend className="text-lg font-bold">{copy.title}</legend>
      {rows.length === 0 && <p>{copy.empty}</p>}
      {rows.map((row, i) => {
        const at = (field: string) => `defaultBullets.${i}.${field}`;
        return (
          <fieldset key={row.uid} className="space-y-3 rounded-brand border p-3">
            <legend className="px-1 font-bold">{copy.row(i + 1)}</legend>
            <input type="hidden" name={at('key')} value={row.key} />
            <TextField name={at('label')} defaultValue={row.label} />
            <SelectField name={at('kind')} options={KIND_OPTIONS} defaultValue={row.kind} />
            <Check
              id={fieldId(formId, at('required'))}
              name={at('required')}
              label={copy.required}
              defaultChecked={row.required}
            />
            <Check
              id={fieldId(formId, at('organisers'))}
              name={at('organisers')}
              label={copy.organisers}
              defaultChecked={row.organisers}
            />
            <Button variant="secondary" onPress={() => onRemove(row.uid)}>
              {copy.remove(i + 1)}
            </Button>
          </fieldset>
        );
      })}
      {canAdd ? (
        <Button variant="secondary" onPress={onAdd}>
          {copy.add}
        </Button>
      ) : (
        <p>{copy.tooMany}</p>
      )}
    </fieldset>
  );
}
