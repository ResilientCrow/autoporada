'use client';

import { useState } from 'react';
import type { z } from 'zod';

import type { savePointTypeInput, savePointTypeOutput, ServerAction } from '@/contracts';
import type { TitleGender } from '@/domain/cs';
import { POINT_LIMITS, type BulletSpec } from '@/domain/report';
import { pointTypes } from '@/ui/copy';
import {
  Form,
  SelectField,
  SubmitButton,
  TextField,
  useActionForm,
  type FormSpec,
} from '@/ui/form';

import { BulletRows } from './BulletRows';
import { Check } from './Check';
import { TITLE_GENDER_VALUES, typeInput } from './inputs';
import { addRow, removeRow, rowsOf, type BulletRow } from './rows';

export type SaveAction = ServerAction<
  z.input<typeof savePointTypeInput>,
  z.output<typeof savePointTypeOutput>
>;

/** A type as the form starts from it. */
export interface TypeView {
  readonly id: string;
  readonly name: string;
  readonly titleGender: TitleGender | null;
  readonly defaultBullets: readonly BulletSpec[];
  readonly active: boolean;
  readonly locked: boolean;
  readonly position: number;
  readonly version: number;
}

const { fields, bullets } = pointTypes;

const GENDER_OPTIONS = [
  { value: '', label: fields.titleGender.options.none },
  ...TITLE_GENDER_VALUES.map((value) => ({
    value,
    label: fields.titleGender.options[value],
  })),
];

/** One entry per field name, the bullet rows' after the fixed fields (page order). */
function specFor(rows: readonly BulletRow[]): FormSpec {
  return {
    name: {
      label: fields.name.label,
      required: true,
      messages: { 'too-long': fields.name.tooLong },
    },
    titleGender: { label: fields.titleGender.label, required: true },
    position: { label: fields.position.label },
    defaultBullets: {
      label: bullets.title,
      messages: { invalid: bullets.invalid, 'too-long': bullets.tooMany },
    },
    ...Object.fromEntries(
      rows.flatMap((_, i) => {
        const row = bullets.row(i + 1);
        return [
          [`defaultBullets.${i}.label`, { label: `${row}: ${bullets.label}`, required: true }],
          [`defaultBullets.${i}.kind`, { label: `${row}: ${bullets.kind}`, required: true }],
        ] as const;
      }),
    ),
  };
}

/**
 * „Uložit“ of one type, or „Přidat typ“ without one. It sends the whole desired type; a saved type
 * is keyed by its version by the host, so a refreshed page starts the form again.
 */
export function TypeForm({
  action,
  type,
  onSaved,
}: {
  readonly action: SaveAction;
  readonly type?: TypeView;
  readonly onSaved: (changed: boolean) => void;
}) {
  const [{ rows }, setRows] = useState(() => rowsOf(type?.defaultBullets ?? []));
  const formId = type === undefined ? 'novy-typ' : `typ-${type.id}`;
  const locked = type?.locked === true;
  const state = useActionForm({
    action,
    toInput: (data) =>
      typeInput({ ...(type && { id: type.id, version: type.version }), locked }, data),
    onSuccess: (value) => onSaved(value.changed),
  });
  return (
    <Form id={formId} spec={specFor(rows)} state={state}>
      <TextField name="name" defaultValue={type?.name ?? ''} />
      <SelectField
        name="titleGender"
        options={GENDER_OPTIONS}
        defaultValue={type?.titleGender ?? ''}
        description={fields.titleGender.description}
      />
      <TextField
        name="position"
        type="number"
        defaultValue={type === undefined ? '' : String(type.position)}
        description={fields.position.description}
      />
      {locked ? (
        <p>{pointTypes.locked}</p>
      ) : (
        <Check
          id={`${formId}-active`}
          name="active"
          label={fields.active.label}
          defaultChecked={type?.active ?? true}
        />
      )}
      <BulletRows
        formId={formId}
        rows={rows}
        canAdd={rows.length < POINT_LIMITS.bullets}
        onAdd={() => setRows(addRow)}
        onRemove={(uid) => setRows((s) => removeRow(s, uid))}
      />
      <SubmitButton>{type === undefined ? pointTypes.create.save : pointTypes.save}</SubmitButton>
    </Form>
  );
}
