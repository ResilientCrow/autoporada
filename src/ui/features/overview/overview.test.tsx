import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Actor } from '@/domain/actor';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { Overview } from './index';

function actor(over: Partial<Actor>): Actor {
  return { id: 'u1', role: 'submitter', status: 'active', isStudent: false, ...over };
}

const render = (over: Partial<Actor>) => renderToStaticMarkup(<Overview actor={actor(over)} />);

describe('Overview', () => {
  it('shows a waiting user the notice and a waiting chip, no member chips', () => {
    const html = render({ role: 'pending' });
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${cs.home.title}.*</h1>`));
    expect(html).toContain(cs.home.statusPending);
    expect(html).not.toContain(cs.status.account.active);
    expect(html).not.toContain(cs.status.role.pending);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it.each([
    ['submitter', cs.status.role.submitter],
    ['headmaster', cs.status.role.headmaster],
  ] as const)('shows a %s the role and the account chip', (role, label) => {
    const html = render({ role });
    expect(html).toContain(label);
    expect(html).toContain(cs.status.account.active);
    expect(html).not.toContain(cs.status.student);
    expect(html).not.toContain(cs.home.statusPending);
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

  it('announces the waiting state once, and only while waiting', () => {
    const waiting = render({ role: 'pending' });
    expect(waiting.match(/role="status"/g)).toHaveLength(1);
    expect(waiting).toContain(`>${cs.home.pending}</div>`);
    expect(render({})).not.toContain('role=');
  });

  it('signs out of every device by post', () => {
    const html = render({});
    expect(/<form [^>]*>/.exec(html)?.[0]).toContain('action="/auth/logout"');
    expect(/<button [^>]*>/.exec(html)?.[0]).toContain('value="all"');
    expect(html).toContain(`${cs.home.signOutEverywhere}</button>`);
  });
});
