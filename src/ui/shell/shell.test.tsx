import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Actor } from '@/domain/actor';
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

const VIEWER = {
  displayName: 'Jana Nováková',
  actor: { id: 'u1', role: 'submitter', status: 'active', isStudent: false } satisfies Actor,
};

describe('Shell with a viewer', () => {
  const signedIn = renderToStaticMarkup(
    <Shell viewer={VIEWER} current="/">
      {cs.gallery.intro}
    </Shell>,
  );

  it('has a labelled navigation, marking the current page', () => {
    expect(signedIn).toContain(`<nav aria-label="${cs.nav.label}">`);
    expect(signedIn.match(/aria-current="page"/g)).toHaveLength(1);
    expect(signedIn).toMatch(new RegExp(`aria-current="page"[^>]*>${cs.nav.overview}</a>`));
  });

  it('marks no page as current elsewhere', () => {
    const elsewhere = renderToStaticMarkup(
      <Shell viewer={VIEWER} current="/jinde">
        {cs.gallery.intro}
      </Shell>,
    );
    expect(elsewhere).not.toContain('aria-current');
  });

  it('names the viewer and signs out this device only', () => {
    expect(signedIn).toContain(VIEWER.displayName);
    const form = /<form [^>]*>/.exec(signedIn)?.[0];
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/auth/logout"');
    const button = /<button [^>]*>/.exec(signedIn)?.[0];
    expect(button).toContain('name="scope"');
    expect(button).toContain('value="this"');
    expect(signedIn).toContain(`${cs.shell.signOut}</button>`);
  });

  it('renders markup the CSP accepts', () => {
    expect(cspMarkupProblems(signedIn)).toEqual([]);
  });
});

describe('Shell width', () => {
  const containers = (markup: string) => {
    const header = /<header [^>]*><div class="([^"]*)"/.exec(markup)?.[1] ?? '';
    const main = /<main [^>]*class="([^"]*)"/.exec(markup)?.[1] ?? '';
    const footer = /<footer [^>]*><div class="([^"]*)"/.exec(markup)?.[1] ?? '';
    return { header, main, footer };
  };

  it('is text width by default: header, main and footer stop at max-w-3xl', () => {
    for (const classes of Object.values(containers(html))) {
      expect(classes).toContain('max-w-3xl');
      expect(classes).not.toContain('lg:max-w-6xl');
    }
  });

  it('is wide on request: header, main and footer widen together from lg', () => {
    const wide = renderToStaticMarkup(<Shell width="wide">{cs.gallery.intro}</Shell>);
    const found = containers(wide);
    expect(Object.keys(found)).toHaveLength(3);
    for (const classes of Object.values(found)) {
      expect(classes).toContain('max-w-3xl');
      expect(classes).toContain('lg:max-w-6xl');
    }
  });
});

describe('Shell without a viewer', () => {
  it('has neither navigation nor sign-out', () => {
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('<form');
  });
});
