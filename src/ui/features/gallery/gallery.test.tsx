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

  it.each([cs.gallery.statuses.title, cs.gallery.buttons.title, cs.gallery.notices.title])(
    'has the section %s',
    (title) => {
      expect(html).toMatch(new RegExp(`<h2 [^>]*>${title}</h2>`));
    },
  );

  it('shows all five chips and both notices, none of them live', () => {
    for (const label of Object.values(cs.gallery.statuses).slice(1)) expect(html).toContain(label);
    expect(html).toContain(cs.gallery.notices.info);
    expect(html).toContain(cs.gallery.notices.problem);
    expect(html).not.toMatch(/role="(status|alert)"/);
  });

  it('renders markup the CSP accepts', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
