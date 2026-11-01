import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { FieldIssues } from '@/contracts';
import { fieldIssues, future } from '@/ui/copy';
import { Form, type FormState } from '@/ui/form';

import { FUTURE_FORM_ID, FUTURE_SPEC } from './edit';
import { ResponsibleFields } from './ResponsibleFields';

vi.mock('next/navigation', () => ({
  usePathname: () => '/akce/x',
  useSearchParams: () => new URLSearchParams(),
}));

const noop = () => undefined;
const state = (issues: FieldIssues | null): FormState => ({
  issues,
  problem: null,
  attempt: 0,
  submitting: null,
  onSubmit: noop,
});

function render(issues: FieldIssues | null, own: Record<string, string> = {}): string {
  return renderToStaticMarkup(
    <Form id={FUTURE_FORM_ID} spec={FUTURE_SPEC} state={state(issues)}>
      <ResponsibleFields
        value={{ verb: 'vede', behalfOf: '', people: [] }}
        issues={own}
        readOnly={false}
        picker={{ today: { year: 2026, month: 11, day: 4 }, recents: [], directory: 'off' }}
        onChange={noop}
        onBlur={noop}
      />
    </Form>,
  );
}

const fieldset = (html: string) => /<fieldset [^>]*>/.exec(html)?.[0] ?? '';
const describedBy = (html: string) => /aria-describedby="([^"]*)"/.exec(fieldset(html))?.[1] ?? '';

describe('ResponsibleFields', () => {
  it('ties the hint to the fieldset, so a screen reader entering the group hears it', () => {
    const html = render(null);
    const ids = describedBy(html).split(' ');
    expect(ids).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<p id="${ids[0]}">${future.editor.responsible.hint}</p>`));
  });

  it('shows the form’s refusal of the people under the legend and ties it to the fieldset', () => {
    const html = render({ 'responsible.people': 'required' });
    const ids = describedBy(html).split(' ');
    expect(ids).toHaveLength(2);
    expect(html).toMatch(new RegExp(`<div id="${ids[1]}"[^>]*>`));
    expect(html).toContain(fieldIssues.required);
  });

  it('prefers the autosave’s own message to the form’s', () => {
    const html = render(
      { 'responsible.people': 'required' },
      {
        'responsible.people': future.editor.tooMany,
      },
    );
    const inline = /<div id="akce-responsible-people-error".*?<\/div>/s.exec(html)?.[0] ?? '';
    expect(inline).toContain(future.editor.tooMany);
    expect(inline).not.toContain(fieldIssues.required);
  });
});
