import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Actor } from '@/domain/actor';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { AccountCard, Overview } from './index';

function actor(over: Partial<Actor>): Actor {
  return { id: 'u1', role: 'submitter', status: 'active', isStudent: false, ...over };
}

const render = (over: Partial<Actor>) =>
  renderToStaticMarkup(<AccountCard actor={actor(over)} home={{ kind: 'member' }} />);

const waiting = (standing: 'open' | 'pending' | 'cooldown' | 'blocked') =>
  renderToStaticMarkup(<Overview home={{ kind: 'pending', standing }} />);

const link = (html: string) => /<a [^>]*href="\/pristup"[^>]*>(.*?)<\/a>/.exec(html);

describe('Overview for a waiting user', () => {
  it.each([
    ['open', null, cs.home.request],
    ['pending', cs.status.access.pending, cs.home.showRequest],
    ['cooldown', cs.status.access.rejected, cs.home.showRequest],
    ['blocked', cs.status.access.blocked, cs.home.showRequest],
  ] as const)('with a %s standing shows the chip and the link', (standing, chip, text) => {
    const html = waiting(standing);
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${cs.home.title}.*</h1>`));
    expect(html).toContain(cs.home.pending);
    expect(link(html)?.[1]).toContain(text);
    for (const label of Object.values(cs.status.access)) {
      expect(html.includes(label)).toBe(label === chip);
    }
    expect(html).not.toContain(cs.status.account.active);
    expect(html).not.toContain(cs.status.role.pending);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('announces nothing: the notice is on the page at load', () => {
    expect(waiting('open')).not.toContain('role=');
  });

  it('leaves the account card to the page, which puts it last', () => {
    const html = waiting('open');
    expect(html).not.toContain(cs.home.account);
    expect(html).not.toContain(cs.home.signOutEverywhere);
  });

  it('still signs out of every device, in the account card', () => {
    const html = renderToStaticMarkup(
      <AccountCard
        actor={actor({ role: 'pending' })}
        home={{ kind: 'pending', standing: 'open' }}
      />,
    );
    expect(html).toContain(`${cs.home.signOutEverywhere}</button>`);
    expect(html).not.toContain(cs.status.role.pending);
  });
});

describe('Overview for a member', () => {
  it('is only the page title: the account card comes last on the page', () => {
    const html = renderToStaticMarkup(<Overview home={{ kind: 'member' }} />);
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${cs.home.title}.*</h1>`));
    expect(html).not.toContain(cs.home.account);
    expect(html).not.toContain(cs.status.role.submitter);
    expect(html).not.toContain(cs.home.signOutEverywhere);
  });
});

describe('AccountCard for a member', () => {
  it.each([
    ['submitter', cs.status.role.submitter],
    ['headmaster', cs.status.role.headmaster],
  ] as const)('shows a %s the role and the account chip', (role, label) => {
    const html = render({ role });
    expect(html).toContain(label);
    expect(html).toContain(cs.status.account.active);
    expect(html).not.toContain(cs.status.student);
    expect(html).not.toContain(cs.home.pending);
    expect(link(html)).toBeNull();
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('adds the student chip for a student', () => {
    const html = render({ isStudent: true });
    expect(html).toContain(cs.status.role.submitter);
    expect(html).toContain(cs.status.student);
  });

  it('shows the account status of a blocked member', () => {
    expect(render({ status: 'blocked' })).toContain(cs.status.account.blocked);
  });

  it('has no live region', () => {
    expect(render({})).not.toContain('role=');
  });

  it('signs out of every device by post', () => {
    const html = render({});
    expect(/<form [^>]*>/.exec(html)?.[0]).toContain('action="/auth/logout"');
    expect(/<button [^>]*>/.exec(html)?.[0]).toContain('value="all"');
    expect(html).toContain(`${cs.home.signOutEverywhere}</button>`);
  });
});
