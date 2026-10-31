'use client';

import { pointTypes } from '@/ui/copy';
import { CheckboxField, FieldGroup, SelectField, TextField, fieldId } from '@/ui/form';
import { Button } from '@/ui/kit';

import type { BulletRow } from './rows';

const { bullets: copy } = pointTypes;

const KINDS = ['people', 'text'] as const;
const KIND_OPTIONS = KINDS.map((value) => ({ value, label: copy.kinds[value] }));

/**
 * The bullets a type offers, one fieldset per row, named `defaultBullets.<i>.<field>`. The key
 * of a saved row travels in a hidden field, and so does its kind, which is fixed (started points
 * read the bullet by key); a new row has no key yet and chooses its kind. Only a people row can
 * name the organisers. The fieldset takes the focus the error summary links to for a problem
 * with the list as a whole; its direct children are the rows, then the add button (`focus.ts`).
 */
export function BulletRows({
  formId,
  rows,
  canAdd,
  onAdd,
  onKind,
  onRemove,
}: {
  readonly formId: string;
  readonly rows: readonly BulletRow[];
  readonly canAdd: boolean;
  readonly onAdd: () => void;
  readonly onKind: (uid: number, kind: BulletRow['kind']) => void;
  readonly onRemove: (uid: number) => void;
}) {
  return (
    <FieldGroup id={fieldId(formId, 'defaultBullets')} legend={copy.title}>
      {rows.length === 0 && <p>{copy.empty}</p>}
      {rows.map((row, i) => {
        const at = (field: string) => `defaultBullets.${i}.${field}`;
        return (
          <FieldGroup key={row.uid} legend={copy.row(i + 1)}>
            <input type="hidden" name={at('key')} value={row.key} />
            <TextField name={at('label')} defaultValue={row.label} />
            {row.key === '' ? (
              <SelectField
                name={at('kind')}
                options={KIND_OPTIONS}
                value={row.kind}
                onChange={(kind) => onKind(row.uid, KINDS.find((k) => k === kind) ?? row.kind)}
              />
            ) : (
              <>
                <input type="hidden" name={at('kind')} value={row.kind} />
                <p>{copy.kindFixed(copy.kinds[row.kind])}</p>
              </>
            )}
            <CheckboxField
              name={at('required')}
              label={copy.required}
              optionalMark={false}
              defaultChecked={row.required}
            />
            {row.kind === 'people' && (
              <CheckboxField
                name={at('organisers')}
                label={copy.organisers}
                optionalMark={false}
                defaultChecked={row.organisers}
              />
            )}
            <Button variant="secondary" onPress={() => onRemove(row.uid)}>
              {copy.remove(i + 1)}
            </Button>
          </FieldGroup>
        );
      })}
      {canAdd ? (
        <Button variant="secondary" onPress={onAdd}>
          {copy.add}
        </Button>
      ) : (
        <p>{copy.tooMany}</p>
      )}
    </FieldGroup>
  );
}
