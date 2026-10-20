import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../test/support/markup';

import { Form, TextField, type FormSpec } from './index';

const NOTE = 'Pomůže nám to.';
const OWN = 'Zadejte název vlastními slovy.';
const spec: FormSpec = {
  title: { label: 'Název', required: true, messages: { required: OWN } },
  note: { label: 'Poznámka' },
};
const noop = () => undefined;

function render(issues: Parameters<typeof Form>[0]['issues'] = null): string {
  return renderToStaticMarkup(
    <Form id="f" spec={spec} issues={issues} onSubmit={noop}>
      <TextField name="title" />
      <TextField name="note" description={NOTE} multiline />
    </Form>,
  );
}

describe('Form and TextField', () => {
  const html = render();

  it('is a POST form without browser validation or an action', () => {
    expect(html).toMatch(/<form [^>]*method="post"/);
    expect(html).toContain('noValidate=""');
    expect(html).not.toMatch(/<form [^>]*action=/);
  });

  it("points the label's for at the input id", () => {
    expect(html).toMatch(/<label [^>]*for="f-title"/);
    expect(html).toMatch(/<input [^>]*id="f-title"/);
  });

  it('marks only optional fields', () => {
    expect(html).toContain(`Poznámka ${cs.form.optional}`);
    expect(html).not.toContain(`Název ${cs.form.optional}`);
  });

  it('wires the description with aria-describedby', () => {
    const id = /<span [^>]*id="([^"]+)"[^>]*slot="description"/.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(html).toMatch(new RegExp(`<textarea [^>]*aria-describedby="[^"]*${id}`));
  });

  it('shows no error when there are no issues', () => {
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).not.toContain(cs.form.errorPrefix);
  });

  it('names an error with its own message and a hidden prefix', () => {
    const bad = render({ title: 'required', note: 'too-long' });
    expect(bad.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(bad).toContain(OWN);
    expect(bad).toContain(cs.fieldIssues['too-long']);
    expect(bad).toContain(cs.form.errorPrefix);
  });

  it('throws for a name the spec does not declare', () => {
    expect(() =>
      renderToStaticMarkup(
        <Form id="f" spec={spec} issues={null} onSubmit={noop}>
          <TextField name="typo" />
        </Form>,
      ),
    ).toThrow(/typo/);
  });

  it('renders markup the CSP accepts', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
    expect(cspMarkupProblems(render({ title: 'required' }))).toEqual([]);
  });
});
