'use client';

import { points } from '@/ui/copy';
import type { FormSpec } from '@/ui/form';

import { startInput } from './inputs';
import { StartChooser, type CreatePointAction } from './StartChooser';

const SPEC: FormSpec = {
  typeId: {
    label: points.chooser.legend,
    required: true,
    messages: { required: points.chooser.required, invalid: points.chooser.invalid },
  },
};

/** /body/novy: the heading and the type to start a report on (design section 6). */
export function TypeChooser({
  types,
  createPoint,
}: {
  readonly types: readonly { readonly id: string; readonly name: string }[];
  readonly createPoint: CreatePointAction;
}) {
  return (
    <StartChooser
      heading={points.title.new}
      formId="novy-bod"
      spec={SPEC}
      field="typeId"
      options={types.map((type) => ({ value: type.id, label: type.name }))}
      toInput={startInput}
      createPoint={createPoint}
    />
  );
}
