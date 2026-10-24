import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { Gallery } from './index';

describe('Gallery', () => {
  const html = renderToStaticMarkup(<Gallery />);

  it('has its heading', () => {
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${cs.gallery.title}.*</h1>`));
  });

  it.each([
    cs.gallery.statuses.title,
    cs.gallery.buttons.title,
    cs.gallery.notices.title,
    cs.gallery.forms.title,
    cs.gallery.forms.controls.title,
  ])('has the section %s', (title) => {
    expect(html).toMatch(new RegExp(`<h2 [^>]*>${title}</h2>`));
  });

  it('shows all five chips and both notices, none of them live', () => {
    for (const label of Object.values(cs.gallery.statuses).slice(1)) expect(html).toContain(label);
    expect(html).toContain(cs.gallery.notices.info);
    expect(html).toContain(cs.gallery.notices.problem);
    expect(html).not.toContain('role="status"');
  });

  it('shows the error form with its issues and the plain form without', () => {
    expect(html).toContain(cs.gallery.forms.failed.reasonTooLong);
    expect(html).toContain(cs.fieldIssues.required);
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(4);
    expect(html.match(/role="alert"/g)).toHaveLength(2);
    expect(html).toContain(cs.form.summaryTitle);
  });

  it('shows a select and a checkbox, clean and with an issue each', () => {
    const { controls } = cs.gallery.forms;
    expect(html.match(/<select /g)).toHaveLength(2);
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toContain(controls.roleHint);
    expect(html).toContain(cs.fieldIssues.invalid);
    expect(html).toMatch(/<select [^>]*aria-invalid="true"/);
    expect(html).toMatch(/<input [^>]*type="checkbox"[^>]*aria-invalid="true"/);
  });

  it('has the live form, quiet until submitted', () => {
    expect(html).toContain(cs.gallery.forms.live.name);
    expect(html).not.toContain(cs.gallery.forms.live.sent);
  });

  it('renders markup the CSP accepts', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
