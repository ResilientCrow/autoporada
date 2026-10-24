'use client';

import { gallery } from '@/ui/copy';
import { CheckboxField, Form, SelectField, type FormSpec } from '@/ui/form';
import { Button } from '@/ui/kit';

const { controls } = gallery.forms;

const SPEC: FormSpec = {
  role: { label: controls.role, required: true },
  agree: { label: controls.agree, required: true },
};

const OPTIONS = [
  { value: 'student', label: controls.options.student },
  { value: 'teacher', label: controls.options.teacher },
] as const;

function stay(event: { preventDefault: () => void }) {
  event.preventDefault();
}

/** A select and a checkbox, clean and then with an issue each (submitting does nothing). */
export function ControlDemos() {
  return (
    <div className="flex flex-col gap-6">
      <Form id="demo-controls" spec={SPEC} issues={null} attempt={0} onSubmit={stay}>
        <SelectField name="role" options={OPTIONS} description={controls.roleHint} />
        <CheckboxField name="agree" description={controls.agreeHint} defaultChecked />
        <div>
          <Button type="submit">{gallery.forms.submit}</Button>
        </div>
      </Form>
      <Form
        id="demo-controls-failed"
        spec={SPEC}
        issues={{ role: 'invalid', agree: 'required' }}
        attempt={0}
        onSubmit={stay}
      >
        <SelectField name="role" options={OPTIONS} defaultValue="teacher" />
        <CheckboxField name="agree" />
        <div>
          <Button type="submit">{gallery.forms.submit}</Button>
        </div>
      </Form>
    </div>
  );
}
