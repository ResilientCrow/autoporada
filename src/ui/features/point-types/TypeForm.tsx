'use client';

import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';

import type { savePointTypeInput, savePointTypeOutput, ServerAction } from '@/contracts';
import { TITLE_GENDERS, type TitleGender } from '@/domain/cs';
import { POINT_LIMITS, type BulletSpec } from '@/domain/report';
import { pointTypes } from '@/ui/copy';
import {
  CheckboxField,
  Form,
  SelectField,
  SubmitButton,
  TextField,
  useActionForm,
  type FormSpec,
} from '@/ui/form';

import { BulletRows } from './BulletRows';
import { focusRow, focusSubmit } from './focus';
import { typeInput } from './inputs';
import {
  addRow,
  focusAfterAdd,
  focusAfterRemove,
  removeRow,
  rowsOf,
  setKind,
  type BulletRow,
  type RowFocus,
  type RowsState,
} from './rows';

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
  ...TITLE_GENDERS.map((value) => ({
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
    active: { label: fields.active.label },
    defaultBullets: {
      label: bullets.title,
      messages: { invalid: bullets.invalid, 'too-long': bullets.tooMany },
    },
    ...Object.fromEntries(
      rows.flatMap((bullet, i) => {
        const row = bullets.row(i + 1);
        return [
          [`defaultBullets.${i}.label`, { label: `${row}: ${bullets.label}`, required: true }],
          [`defaultBullets.${i}.required`, { label: `${row}: ${bullets.required}` }],
          [`defaultBullets.${i}.organisers`, { label: `${row}: ${bullets.organisers}` }],
          // A saved row's kind is fixed: it has no control.
          ...(bullet.key === ''
            ? ([
                [`defaultBullets.${i}.kind`, { label: `${row}: ${bullets.kind}`, required: true }],
              ] as const)
            : []),
        ] as const;
      }),
    ),
  };
}

/**
 * „Uložit“ of one type, or „Přidat typ“ without one. It sends the whole desired type; a saved type
 * is keyed by its version by the host, so a refreshed page starts the form again. The form that
 * starts again after its own save (`restoreFocus`) puts focus back on its submit button, and a
 * change of the rows moves focus to the row it concerns, so keyboard focus is never dropped.
 */
export function TypeForm({
  action,
  type,
  restoreFocus,
  onSaved,
}: {
  readonly action: SaveAction;
  readonly type?: TypeView;
  readonly restoreFocus: boolean;
  readonly onSaved: (changed: boolean) => void;
}) {
  const [rowState, setRows] = useState(() => rowsOf(type?.defaultBullets ?? []));
  const { rows } = rowState;
  const [focusing, setFocusing] = useState<{ target: RowFocus; n: number } | null>(null);
  const formId = type === undefined ? 'novy-typ' : `typ-${type.id}`;
  const locked = type?.locked === true;
  const restore = useRef(restoreFocus);
  useEffect(() => {
    if (restore.current) focusSubmit(formId);
  }, [formId]);
  useEffect(() => {
    if (focusing !== null) focusRow(formId, focusing.target);
  }, [formId, focusing]);
  const change = (update: (before: RowsState) => RowsState, target: RowFocus | null) => {
    setRows(update);
    if (target !== null) setFocusing((before) => ({ target, n: (before?.n ?? 0) + 1 }));
  };
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
        description={
          type === undefined ? fields.position.description : fields.position.descriptionSaved
        }
      />
      {locked ? (
        <p>{pointTypes.locked}</p>
      ) : (
        <CheckboxField name="active" optionalMark={false} defaultChecked={type?.active ?? true} />
      )}
      <BulletRows
        formId={formId}
        rows={rows}
        canAdd={rows.length < POINT_LIMITS.bullets}
        onAdd={() => change(addRow, focusAfterAdd(rowState))}
        onKind={(uid, kind) => change((s) => setKind(s, uid, kind), null)}
        onRemove={(uid) => change((s) => removeRow(s, uid), focusAfterRemove(rowState, uid))}
      />
      <SubmitButton>{type === undefined ? pointTypes.create.save : pointTypes.save}</SubmitButton>
    </Form>
  );
}
