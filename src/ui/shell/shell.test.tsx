import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Actor } from '@/domain/actor';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../test/support/markup';

import { Shell } from './index';

const html = renderToStaticMarkup(<Shell>{cs.gallery.intro}</Shell>);

describe('Shell', () => {
  it('starts with the skip link to the content', () => {
    // Branch arch-ui: React hoists the logo's preload link ahead of the frame.
    expect(html).toMatch(/^(?:<link [^>]*\/>)?<div [^>]*><a href="#obsah"[^>]*>/);
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
    // Branch arch-ui: the brand is the school logo, named for screen readers.
    expect(html).toMatch(
      new RegExp(`<a [^>]*href="/klasicke"[^>]*><img [^>]*alt="${cs.shell.school}, domů"`),
    );
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
    <Shell viewer={VIEWER} current="/klasicke">
      {cs.gallery.intro}
    </Shell>,
  );

  it('has a labelled navigation, marking the current page', () => {
    expect(signedIn.match(new RegExp(`<nav aria-label="${cs.nav.label}"`, 'g'))).toHaveLength(2);
    // The same href is current in the desktop row, the phone menu and the phone's bottom bar.
    expect(signedIn.match(/aria-current="page"/g)).toHaveLength(3);
    expect(
      signedIn.match(new RegExp(`aria-current="page"[^>]*>${cs.nav.overview}</a>`, 'g')),
    ).toHaveLength(2);
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

describe('Shell frame', () => {
  const classOf = (markup: string, tag: 'header' | 'footer') =>
    new RegExp(`<${tag} [^>]*>(?:<div class="([^"]*)")`).exec(markup)?.[1] ?? '';
  const mainOf = (markup: string) => /<main [^>]*class="([^"]*)"/.exec(markup)?.[1] ?? '';
  const columnOf = (markup: string) => /<main [^>]*><div class="([^"]*)"/.exec(markup)?.[1] ?? '';
  const wide = renderToStaticMarkup(<Shell width="wide">{cs.gallery.intro}</Shell>);

  it('gives header, main and footer the one frame, whatever the width', () => {
    for (const markup of [html, wide]) {
      expect(classOf(markup, 'header')).toContain('frame');
      expect(mainOf(markup)).toContain('frame');
      expect(classOf(markup, 'footer')).toContain('frame');
      expect(markup).not.toContain('lg:max-w-6xl');
    }
  });

  it('limits only the content column to text width, and spaces its blocks 32 px apart', () => {
    expect(columnOf(html)).toBe('flex flex-col gap-8 max-w-3xl');
    expect(columnOf(wide)).toBe('flex flex-col gap-8');
    expect(mainOf(html)).toContain('py-8 sm:py-10');
  });
});

describe('Shell menu', () => {
  const signedIn = renderToStaticMarkup(
    <Shell viewer={VIEWER} current="/klasicke">
      {cs.gallery.intro}
    </Shell>,
  );

  it('has one details with the Menu summary, closed, for phones', () => {
    expect(signedIn.match(/<details /g)).toHaveLength(1);
    expect(signedIn).toMatch(/<details class="lg:hidden"><summary [^>]*summary-plain[^>]*>/);
    expect(signedIn).toContain(`${cs.shell.menu}</summary>`);
    expect(signedIn).not.toMatch(/<details [^>]*open/);
  });

  it('shows the desktop row and the name with sign-out only from lg', () => {
    expect(signedIn).toContain('class="hidden lg:block"');
    expect(signedIn).toContain('class="hidden items-center gap-4 lg:flex"');
    expect(signedIn.match(new RegExp(`${cs.shell.signOut}</button>`, 'g'))).toHaveLength(2);
  });

  it('has no menu without a viewer', () => {
    expect(html).not.toContain('<details');
  });
});

describe('Shell without a viewer', () => {
  it('has neither navigation nor sign-out', () => {
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('<form');
  });
});
