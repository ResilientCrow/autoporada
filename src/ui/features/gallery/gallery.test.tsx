import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { Gallery } from './index';

describe('Gallery', () => {
  const html = renderToStaticMarkup(<Gallery />);

  it('has its heading', () => {
    expect(html).toContain(`<h1>${cs.gallery.title}</h1>`);
  });

  it('renders markup the CSP accepts', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
