'use client';

import { gallery } from '@/ui/copy';
import {
  CheckboxField,
  Form,
  RadioGroupField,
  SelectField,
  type FormSpec,
  type FormState,
} from '@/ui/form';
import { Button } from '@/ui/kit';

const { controls } = gallery.forms;

const SPEC: FormSpec = {
  role: { label: controls.role, required: true },
  agree: { label: controls.agree, required: true },
  shift: { label: controls.shift, required: true },
};

const OPTIONS = [
  { value: 'student', label: controls.options.student },
  { value: 'teacher', label: controls.options.teacher },
] as const;

const SHIFTS = [
  { value: 'morning', label: controls.shifts.morning },
  { value: 'afternoon', label: controls.shifts.afternoon },
] as const;

function stay(event: { preventDefault: () => void }) {
  event.preventDefault();
}

const IDLE: FormState = {
  issues: null,
  problem: null,
  attempt: 0,
  submitting: null,
  onSubmit: stay,
};
const FAILED: FormState = {
  ...IDLE,
  issues: { role: 'invalid', agree: 'required', shift: 'required' },
};

/** A select, a checkbox and a radio group, clean and then with an issue each (submitting does nothing). */
export function ControlDemos() {
  return (
    <div className="flex flex-col gap-6">
      <Form id="demo-controls" spec={SPEC} state={IDLE}>
        <SelectField name="role" options={OPTIONS} description={controls.roleHint} />
        <CheckboxField name="agree" description={controls.agreeHint} defaultChecked />
        <RadioGroupField name="shift" options={SHIFTS} defaultValue="morning" />
        <div>
          <Button type="submit">{gallery.forms.submit}</Button>
        </div>
      </Form>
      <Form id="demo-controls-failed" spec={SPEC} state={FAILED}>
        <SelectField name="role" options={OPTIONS} defaultValue="teacher" />
        <CheckboxField name="agree" />
        <RadioGroupField name="shift" options={SHIFTS} />
        <div>
          <Button type="submit">{gallery.forms.submit}</Button>
        </div>
      </Form>
    </div>
  );
}
