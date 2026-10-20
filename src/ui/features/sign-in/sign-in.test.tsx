import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { SignInPanel } from './index';

const BASE = {
  error: null,
  code: null,
  loggedOut: null,
  sharedComputerHint: false,
  loginHref: '/auth/login?returnTo=%2F',
  switchHref: '/auth/login?returnTo=%2F&account=select',
} as const;
const render = (over: Partial<Parameters<typeof SignInPanel>[0]> = {}) =>
  renderToStaticMarkup(<SignInPanel {...BASE} {...over} />);
const roles = (html: string) => [...html.matchAll(/role="(\w+)"/g)].map((m) => m[1]);

describe('SignInPanel', () => {
  const html = render();

  it('has the heading, the intro, no notices and no roles', () => {
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${cs.signIn.title}.*</h1>`));
    expect(html).toContain(cs.signIn.intro);
    expect(roles(html)).toEqual([]);
  });

  it('tells about the data and the account rule before the button', () => {
    const at = (text: string) => {
      const index = html.indexOf(text);
      expect(index, `"${text}" is on the page`).toBeGreaterThan(-1);
      return index;
    };
    expect(at(cs.signIn.data)).toBeLessThan(at(cs.signIn.privacyLink));
    expect(at(cs.signIn.privacyLink)).toBeLessThan(at(cs.signIn.button));
    expect(at(cs.signIn.accounts)).toBeLessThan(at(cs.signIn.button));
    expect(at(cs.signIn.button)).toBeLessThan(at(cs.signIn.redirect));
    expect(html).toMatch(/<a [^>]*href="\/ochrana-osobnich-udaju"/);
  });

  it('links to the sign-in with plain anchors at the given hrefs', () => {
    expect(html).toContain(`<a href="${BASE.loginHref}"`);
    expect(html).toContain(`>${cs.signIn.button}</a>`);
    expect(html).toContain(
      `<a href="${BASE.switchHref.replace('&', '&amp;')}">${cs.signIn.switchAccount}</a>`,
    );
    expect(html).not.toContain('data-rac');
  });

  it('shows an error as the only alert, with the code to report', () => {
    const bad = render({ error: 'failed', code: 'abcdef12-3456' });
    expect(roles(bad)).toEqual(['alert']);
    expect(bad).toContain(cs.signIn.errors.failed);
    expect(bad).toContain(`${cs.app.errorCode} <code>abcdef12-3456</code>`);
  });

  it('shows an error without a code when there is none', () => {
    const bad = render({ error: 'cancelled' });
    expect(bad).toContain(cs.signIn.errors.cancelled);
    expect(bad).not.toContain('<code>');
  });

  it.each([
    ['here', cs.signIn.loggedOut.here],
    ['everywhere', cs.signIn.loggedOut.everywhere],
  ] as const)('announces being signed out %s as the one status', (loggedOut, text) => {
    const out = render({ loggedOut });
    expect(roles(out)).toEqual(['status']);
    expect(out).toContain(text);
  });

  it('shows the shared-computer hint without a role', () => {
    const hint = render({ sharedComputerHint: true });
    expect(hint).toContain(cs.signIn.loggedOut.sharedComputer);
    expect(roles(hint)).toEqual([]);
  });

  it('renders markup the CSP accepts', () => {
    const all = render({
      error: 'failed',
      code: 'abc',
      loggedOut: 'here',
      sharedComputerHint: true,
    });
    expect(cspMarkupProblems(html)).toEqual([]);
    expect(cspMarkupProblems(all)).toEqual([]);
  });
});
