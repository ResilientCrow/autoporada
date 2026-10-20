import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../test/support/markup';

import { Shell } from './index';

const html = renderToStaticMarkup(<Shell>{cs.gallery.intro}</Shell>);

describe('Shell', () => {
  it('starts with the skip link to the content', () => {
    expect(html).toMatch(/^<div [^>]*><a href="#obsah"[^>]*>/);
    expect(html).toContain(`${cs.shell.skipLink}</a>`);
    expect(html.indexOf('<a ')).toBeLessThan(html.indexOf('<header'));
  });

  it('has the banner, one main to skip to, and the footer', () => {
    expect(html).toMatch(/<header /);
    expect(html.match(/<main /g)).toHaveLength(1);
    expect(html).toMatch(/<main id="obsah" tabindex="-1"/);
    expect(html).toMatch(/<footer /);
    expect(html).toContain(cs.gallery.intro);
  });

  it('links the brand to the home page', () => {
    expect(html).toMatch(new RegExp(`<a [^>]*href="/"[^>]*>${cs.shell.brand}</a>`));
  });

  it('renders markup the CSP accepts', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
