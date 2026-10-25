import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { cs } from '@/ui/copy';
import { Form, RadioGroupField, type FormSpec, type FormState } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { TypeChooser } from './index';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined }),
  usePathname: () => '/body/novy',
  useSearchParams: () => new URLSearchParams(),
}));

const { points } = cs;
const TYPES = [
  { id: '5d0c1d2e-3f40-4152-8364-758697a8b9c1', name: 'Seminář' },
  { id: '5d0c1d2e-3f40-4152-8364-758697a8b9c2', name: 'Exkurze' },
  { id: '5d0c1d2e-3f40-4152-8364-758697a8b9c3', name: 'Jiné' },
];
const never = () => Promise.reject(new Error('not called while rendering'));

describe('TypeChooser', () => {
  const html = renderToStaticMarkup(<TypeChooser types={TYPES} createPoint={never} />);

  it('has the page heading „Nový bod“ as a slanted label', () => {
    expect(html).toMatch(
      new RegExp(`<h1 [^>]*-skew-x-12[^>]*><span [^>]*>${points.title.new}</span></h1>`),
    );
  });

  it('is a group named „Typ bodu“', () => {
    expect(html).toMatch(new RegExp(`<legend[^>]*>${points.chooser.legend}[^<]*</legend>`));
    expect(html).toMatch(/<fieldset /);
  });

  it('offers one radio per type, in the given order, each with its label', () => {
    const radios = [...html.matchAll(/<input [^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
    expect(radios).toHaveLength(TYPES.length);
    radios.forEach((radio, i) => {
      expect(radio).toContain(`value="${TYPES[i]!.id}"`);
      expect(radio).toContain('name="typeId"');
    });
    const names = [...html.matchAll(/type="radio"[^>]*\/?><span>([^<]*)<\/span>/g)].map(
      (m) => m[1],
    );
    expect(names).toEqual(TYPES.map((type) => type.name));
  });

  it('preselects nothing', () => {
    expect(html).not.toContain('checked');
  });

  it('has the „Začít“ button, and no problem to start with', () => {
    expect(html).toMatch(
      new RegExp(`<button [^>]*type="submit"[^>]*>(?:<[^>]*>)*${points.chooser.start}`),
    );
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-invalid');
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('RadioGroupField', () => {
  const spec: FormSpec = {
    choice: { label: 'Volba', required: true, messages: { required: 'Vyberte volbu.' } },
  };
  const idle = (issues: FormState['issues']): FormState => ({
    issues,
    problem: null,
    attempt: 0,
    submitting: null,
    onSubmit: () => undefined,
  });
  const render = (issues: FormState['issues'], description?: string) =>
    renderToStaticMarkup(
      <Form id="f" spec={spec} state={idle(issues)}>
        <RadioGroupField
          name="choice"
          description={description}
          options={[
            { value: 'a', label: 'První' },
            { value: 'b', label: 'Druhá' },
          ]}
        />
      </Form>,
    );

  it('gives the group the spec’s id, and no description or error by default', () => {
    const html = render(null);
    expect(html).toMatch(/<fieldset [^>]*id="f-choice"/);
    expect(html).not.toContain('aria-describedby');
    expect(html).not.toContain('aria-invalid');
  });

  it('points aria-describedby at the error when the field is invalid', () => {
    const html = render({ choice: 'required' });
    expect(html).toMatch(/<fieldset [^>]*aria-describedby="f-choice-error"/);
    expect(html).toMatch(/<fieldset [^>]*aria-invalid="true"/);
    expect(html).toMatch(/<div id="f-choice-error"[^>]*>.*Vyberte volbu\./);
  });

  it('points aria-describedby at the description first, then the error', () => {
    const html = render({ choice: 'required' }, 'Vyberte jednu.');
    expect(html).toMatch(/<span id="f-choice-description">Vyberte jednu\.<\/span>/);
    expect(html).toMatch(/aria-describedby="f-choice-description f-choice-error"/);
  });

  it('marks a group that is not required as optional in its legend', () => {
    const html = renderToStaticMarkup(
      <Form id="f" spec={{ choice: { label: 'Volba' } }} state={idle(null)}>
        <RadioGroupField name="choice" options={[{ value: 'a', label: 'První' }]} />
      </Form>,
    );
    expect(html).toContain(`Volba ${cs.form.optional}`);
  });

  it('checks the default value, and only that one', () => {
    const html = renderToStaticMarkup(
      <Form id="f" spec={spec} state={idle(null)}>
        <RadioGroupField
          name="choice"
          defaultValue="b"
          options={[
            { value: 'a', label: 'První' },
            { value: 'b', label: 'Druhá' },
          ]}
        />
      </Form>,
    );
    expect(html.match(/checked/g)).toHaveLength(1);
    const second = [...html.matchAll(/<input [^>]*>/g)]
      .map((m) => m[0])
      .find((i) => i.includes('value="b"'));
    expect(second).toContain('checked');
  });
});
