import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FAILURE_CAUSES } from '@/contracts';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { SignInPanel } from './index';

const BASE = {
  error: null,
  aadsts: null,
  cause: null,
  technical: null,
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

  it('shows an error as the only alert, and never a code', () => {
    const bad = render({ error: 'cancelled' });
    expect(roles(bad)).toEqual(['alert']);
    expect(bad).toContain(cs.signIn.errors.cancelled);
    expect(bad).not.toContain('<code>');
    expect(bad).not.toContain('Kód chyby');
  });

  it.each(FAILURE_CAUSES)('says the sign-in failed and why for %s', (cause) => {
    const bad = render({ error: cause });
    expect(bad).toContain(`Přihlášení se nepodařilo. ${cs.failures[cause]}`);
  });

  it('names the AADSTS number of a refusal', () => {
    expect(render({ error: 'idp-refused', aadsts: 'AADSTS50011' })).toContain(
      'Microsoft přihlášení odmítl (kód AADSTS50011). Dejte to prosím vědět správci.',
    );
    expect(render({ error: 'idp-refused' })).toContain(
      'Microsoft přihlášení odmítl. Dejte to prosím vědět správci.',
    );
  });

  it.each([
    ['idp-invalid', 'Odpověď přihlašovací služby Microsoftu se nedala ověřit.'],
    ['claims', 'Microsoft neposlal údaje, které aplikace potřebuje (jméno nebo e-mail).'],
  ] as const)('says what Entra did for %s', (error, text) => {
    expect(render({ error })).toContain(text);
  });

  it('adds the cause to a failed sign-out', () => {
    const out = render({ error: 'signout-failed', cause: 'database-down' });
    expect(out).toContain(`${cs.signIn.errors['signout-failed']} ${cs.failures['database-down']}`);
    expect(render({ error: 'signout-failed' })).toContain(cs.signIn.errors['signout-failed']);
  });

  it('shows the technical line under the error, as a form problem does', () => {
    const out = render({
      error: 'unavailable',
      technical: 'OIDC issuer http://localhost:8080/ssps',
    });
    expect(out).toContain(
      `<p class="font-mono text-sm break-words">${cs.app.technical} OIDC issuer http://localhost:8080/ssps</p>`,
    );
    expect(render({ error: 'unavailable' })).not.toContain(cs.app.technical);
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
      error: 'idp-refused',
      aadsts: 'AADSTS50011',
      technical: 'x',
      loggedOut: 'here',
      sharedComputerHint: true,
    });
    expect(cspMarkupProblems(html)).toEqual([]);
    expect(cspMarkupProblems(all)).toEqual([]);
  });
});
