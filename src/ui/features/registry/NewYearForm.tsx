'use client';

import { useState } from 'react';

import { registry } from '@/ui/copy';
import {
  CheckboxField,
  Form,
  SelectField,
  SubmitButton,
  useActionForm,
  type FormSpec,
} from '@/ui/form';

import type { NewSchoolYearAction } from './actions';
import { newYearInput } from './inputs';

const { newYear } = registry;

/** One list of the form with the number of its active students. */
export interface NewYearList {
  readonly id: string;
  readonly title: string;
  readonly entries: number;
}

/**
 * The lists to empty (all ticked), the school year they are archived under and the confirm box.
 * The count under the lists follows the ticks. Saving refreshes the page, so the counts fall to
 * zero; the host keys the form by the number of runs, which also unticks the confirm box.
 */
export function NewYearForm({
  action,
  lists,
  years,
  onDone,
}: {
  readonly action: NewSchoolYearAction;
  readonly lists: readonly NewYearList[];
  readonly years: { readonly options: readonly string[]; readonly initial: string };
  readonly onDone: (archived: number, deleted: number) => void;
}) {
  const [ticked, setTicked] = useState(() => new Set(lists.map((list) => list.id)));
  const state = useActionForm({
    action,
    toInput: newYearInput(
      lists.map((list) => list.id),
      years.options,
    ),
    onSuccess: (value) => onDone(value.archived, value.deleted),
  });
  const spec: FormSpec = {
    listIds: { label: newYear.lists.label, messages: { 'too-short': newYear.issues.listIds } },
    ...Object.fromEntries(
      lists.map((list) => [`list.${list.id}`, { label: newYear.list(list.title, list.entries) }]),
    ),
    year: { label: newYear.year.label, required: true },
    confirmed: {
      label: newYear.confirm,
      required: true,
      messages: { required: newYear.issues.confirmed },
    },
  };
  const total = lists.filter((list) => ticked.has(list.id)).reduce((n, l) => n + l.entries, 0);
  const toggle = (id: string, on: boolean) =>
    setTicked((before) => {
      const next = new Set(before);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <Form id="novy-skolni-rok" spec={spec} state={state}>
      <p>{newYear.intro}</p>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-bold">{newYear.lists.label}</legend>
        {lists.map((list) => (
          <CheckboxField
            key={list.id}
            name={`list.${list.id}`}
            optionalMark={false}
            defaultChecked
            onChange={(on) => toggle(list.id, on)}
          />
        ))}
      </fieldset>
      <p>{newYear.count(total)}</p>
      <SelectField
        name="year"
        options={years.options.map((value) => ({ value, label: value }))}
        defaultValue={years.initial}
        description={newYear.year.description}
      />
      <CheckboxField name="confirmed" optionalMark={false} />
      <SubmitButton>{newYear.submit}</SubmitButton>
    </Form>
  );
}
