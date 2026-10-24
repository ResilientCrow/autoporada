import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { cs, users } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { UserAdmin, UsersList } from './index';
import type { QueueItemView } from './Queue';
import type { UserView } from './UserAdmin';
import type { UsersView } from './UsersList';

const person = (id: string, over: Partial<UsersView['users'][number]> = {}) => ({
  id,
  displayName: `Jméno ${id}`,
  email: `${id}@skola.example`,
  role: 'submitter' as const,
  status: 'active' as const,
  isStudent: false,
  ...over,
});

const view = (over: Partial<UsersView> = {}): UsersView => ({
  queue: [],
  users: [person('a'), person('b', { role: 'pending', isStudent: true, status: 'blocked' })],
  total: 2,
  q: '',
  group: 'all',
  ...over,
});

const decide = vi.fn(async () => ({ ok: true as const, data: { state: 'approved' as const } }));
const render = (v: UsersView) => renderToStaticMarkup(<UsersList view={v} decideAccess={decide} />);

describe('UsersList', () => {
  it('has the page title, the „Lidé“ section and clean markup', () => {
    const html = render(view());
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${users.title}.*</h1>`));
    expect(html).toContain(`<h2 class="text-xl">${users.people.title}</h2>`);
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('links every group, keeps the search and marks the current one', () => {
    const html = render(view({ group: 'headmaster', q: 'nov' }));
    const nav = /<nav [^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
    const links = [...nav.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)];
    expect(links.map((l) => l[2])).toEqual(Object.values(users.people.groups));
    for (const [, attrs] of links) expect(attrs).toContain('hledat=nov');
    const current = links.filter((l) => l[1]?.includes('aria-current="page"'));
    expect(current).toHaveLength(1);
    expect(current[0]?.[2]).toBe(users.people.groups.headmaster);
    expect(current[0]?.[1]).toContain('skupina=reditele');
  });

  it('keeps the group in the search form', () => {
    const html = render(view({ group: 'inactive', q: 'x' }));
    expect(html).toContain('role="search"');
    expect(html).toContain(users.people.searchLabel);
    expect(html).toMatch(/name="skupina"[^>]*value="neaktivni"/);
    expect(html).toContain('value="x"');
  });

  it('lists each person with the e-mail and the chips', () => {
    const html = render(view());
    const items = html.match(/<li [^>]*>.*?<\/li>/g) ?? [];
    expect(items.filter((i) => i.includes('@skola.example'))).toHaveLength(2);
    expect(items[0]).toContain('Jméno a');
    expect(items[0]).toContain('break-all');
    expect(items[0]).toContain(cs.status.role.submitter);
    expect(items[0]).toContain(cs.status.account.active);
    expect(items[0]).not.toContain(cs.status.student);
    expect(items[1]).toContain(cs.status.role.pending);
    expect(items[1]).toContain(cs.status.student);
    expect(items[1]).toContain(cs.status.account.blocked);
    expect(html).not.toContain('<table');
  });

  it('counts the people found, without the cap message', () => {
    const html = render(view());
    expect(html).toContain(users.people.found(2));
    expect(html).not.toContain('Upřesněte');
  });

  it('says when the list is capped', () => {
    const html = render(view({ total: 250 }));
    expect(html).toContain(users.people.found(250));
    expect(html).toContain(users.people.capped(2, 250));
  });

  it('says when nobody was found', () => {
    const html = render(view({ users: [], total: 0 }));
    expect(html).toContain(users.people.empty);
    expect(html).not.toContain('<ul class="space-y-2"');
  });

  it('writes a missing e-mail out as nothing', () => {
    const html = render(view({ users: [person('c', { email: null })], total: 1 }));
    expect(html).not.toContain('break-all');
  });
});

const waiting = (id: string, over: Partial<QueueItemView> = {}): QueueItemView => ({
  requestId: id,
  userId: `u-${id}`,
  version: 1,
  displayName: `Žadatel ${id}`,
  jobTitle: 'Učitelka',
  department: 'Druhý stupeň',
  reason: 'Chci posílat zprávy.\nDěkuji.',
  submitted: '1. října 2026',
  events: ['approve', 'reject'],
  ...over,
});

describe('the queue of requests', () => {
  const { queue } = users;
  const html = render(view({ queue: [waiting('r1'), waiting('r2', { events: ['reject'] })] }));
  const items = html.match(/<li class="space-y-2[^>]*>[\s\S]*?<\/li>/g) ?? [];

  it('comes above „Lidé“ with a focusable heading and an empty status region', () => {
    expect(html).toContain(`${queue.title}</h2>`);
    expect(html).toMatch(/<h2 [^>]*tabindex="-1"[^>]*>/);
    expect(html.indexOf(queue.title)).toBeLessThan(html.indexOf(users.people.title));
    expect(html).toContain('<div role="status"></div>');
    expect(html.match(/<noscript>/g)).toHaveLength(1);
  });

  it('shows who asked, what and when, with the reason keeping its line breaks', () => {
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Žadatel r1');
    expect(items[0]).toContain('Učitelka');
    expect(items[0]).toContain('Druhý stupeň');
    expect(items[0]).toContain(queue.submitted('1. října 2026'));
    expect(items[0]).toContain(queue.reason);
    expect(items[0]).toMatch(
      /class="[^"]*whitespace-pre-line[^"]*break-words|class="[^"]*break-words[^"]*whitespace-pre-line/,
    );
  });

  it('offers the allowed decisions, off until hydrated', () => {
    expect(items[0]).toContain(`>${queue.approveStaff}</button>`);
    expect(items[0]).toContain(`>${queue.approveStudent}</button>`);
    expect(items[0]).toContain(`>${queue.reject}</button>`);
    expect(items[0]).toContain(queue.studentHint);
    expect(items[0]?.match(/<button [^>]*name="decision"/g)).toHaveLength(3);
    for (const button of items[0]?.match(/<button [^>]*>/g) ?? []) {
      expect(button).toContain('disabled');
    }
    expect(items[0]).toContain('value="approve-staff"');
    expect(items[0]).toContain('value="approve-student"');
    expect(items[0]).toContain('value="reject"');
  });

  it('offers only the decisions the item allows', () => {
    expect(items[1]).toContain(`>${queue.reject}</button>`);
    expect(items[1]).not.toContain(queue.approveStaff);
    expect(items[1]).not.toContain(queue.approveStudent);
    expect(items[1]).not.toContain(queue.studentHint);
  });

  it('leaves out missing job title and department', () => {
    const bare = render(view({ queue: [waiting('r3', { jobTitle: null, department: null })] }));
    expect(bare).not.toContain('Učitelka');
  });

  it('says when nothing waits, without forms or a no-script notice', () => {
    const empty = render(view({ queue: [] }));
    expect(empty).toContain(queue.empty);
    expect(empty).not.toContain('id="rozhodnuti');
    expect(empty).not.toContain('<noscript>');
  });

  it('has clean markup', () => {
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('the links to the detail', () => {
  it('turns each name into a link, not prefetched', () => {
    const html = render(view());
    expect(html).toContain('href="/uzivatele/a"');
    expect(html).toContain('href="/uzivatele/b"');
  });

  it('offers „Podrobnosti“ on every queue item', () => {
    const html = render(view({ queue: [waiting('r1')] }));
    expect(html).toContain('href="/uzivatele/u-r1"');
    expect(html).toContain(users.detail.details);
  });
});

const detail = (over: Partial<UserView> = {}): UserView => ({
  user: {
    displayName: 'Jana Nová',
    email: 'jana@skola.example',
    role: 'pending',
    status: 'active',
    isStudent: false,
    since: '1. října 2026',
  },
  request: {
    requestId: 'r1',
    version: 2,
    state: 'pending',
    reason: 'Chci posílat zprávy.\nDěkuji.',
    submitted: '2. října 2026',
    decided: null,
  },
  requestEvents: ['approve', 'reject', 'block'],
  ...over,
});

const renderDetail = (v: UserView) =>
  renderToStaticMarkup(<UserAdmin view={v} decideAccess={decide} />);

describe('UserAdmin', () => {
  it('shows the name as the one h1 and the facts as a description list', () => {
    const html = renderDetail(detail());
    expect(html.match(/<h1 /g)).toHaveLength(1);
    expect(html).toMatch(/<h1 [^>]*>.*Jana Nová.*<\/h1>/);
    expect(html).toContain(`<dt class="font-bold">${users.detail.email}</dt>`);
    expect(html).toContain('jana@skola.example');
    expect(html).toContain(cs.status.role.pending);
    expect(html).toContain(cs.status.account.active);
    expect(html).not.toContain(`</svg>${cs.status.student}</span>`);
    expect(html).toContain(users.detail.since('1. října 2026'));
  });

  it('marks a student and a blocked account', () => {
    const html = renderDetail(
      detail({ user: { ...detail().user, isStudent: true, status: 'blocked' }, request: null }),
    );
    expect(html).toContain(`</svg>${cs.status.student}</span>`);
    expect(html).toContain(cs.status.account.blocked);
  });

  it('leaves the request section out when there is no request', () => {
    const html = renderDetail(detail({ request: null, requestEvents: [] }));
    expect(html).not.toContain(users.detail.request);
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<noscript>');
    expect(html).toContain('<div role="status"></div>');
  });

  it('shows a waiting request with its reason and the decisions, off until hydrated', () => {
    const html = renderDetail(detail());
    expect(html).toMatch(/<h2 [^>]*tabindex="-1"[^>]*>/);
    expect(html).toContain(`${users.detail.request}</h2>`);
    expect(html).toContain(cs.status.access.pending);
    expect(html).toContain(users.queue.submitted('2. října 2026'));
    expect(html).toContain('Chci posílat zprávy.');
    expect(html).toContain(`>${users.queue.approveStaff}</button>`);
    expect(html).toContain(`>${users.queue.approveStudent}</button>`);
    expect(html).toContain(`>${users.queue.reject}</button>`);
    expect(html).not.toContain('value="block"');
    for (const button of html.match(/<button [^>]*>/g) ?? []) expect(button).toContain('disabled');
    expect(html.match(/<noscript>/g)).toHaveLength(1);
  });

  it('shows a rejected request with the block section only', () => {
    const html = renderDetail(
      detail({
        request: { ...detail().request!, state: 'rejected', decided: '3. října 2026' },
        requestEvents: ['block'],
      }),
    );
    expect(html).toContain(cs.status.access.rejected);
    expect(html).toContain(users.detail.decided('3. října 2026'));
    expect(html).not.toContain('name="decision"');
    expect(html).not.toContain(users.queue.studentHint);
    expect(html).toContain(users.detail.block.title);
    expect(html.match(/<noscript>/g)).toHaveLength(1);
  });

  it('shows the confirmed block below the decisions of a pending request', () => {
    const html = renderDetail(detail());
    const block = html.slice(html.indexOf('<h3'));
    expect(html.indexOf(users.queue.reject)).toBeLessThan(html.indexOf('<h3'));
    expect(html).toContain('border-t-2 border-ink pt-4');
    expect(html).toContain(`${users.detail.block.title}</h3>`);
    expect(block).toContain(users.detail.block.text);
    expect(block).toMatch(/<input [^>]*type="checkbox"[^>]*name="confirmed"/);
    expect(block).toContain(users.detail.block.confirm);
    expect(block).toContain(`>${users.detail.block.submit}</button>`);
    expect(block.match(/<button /g)).toHaveLength(1);
  });

  it.each(['approved', 'blocked', 'cancelled'] as const)(
    'offers no block for a %s request',
    (state) => {
      const html = renderDetail(
        detail({
          request: { ...detail().request!, state, decided: '3. října 2026' },
          requestEvents: [],
        }),
      );
      expect(html).not.toContain('<h3');
      expect(html).not.toContain('<form');
      expect(html).not.toContain('<noscript>');
    },
  );

  it('has clean markup in every variant', () => {
    for (const v of [
      detail(),
      detail({ request: null, requestEvents: [] }),
      detail({ requestEvents: ['block'] }),
    ]) {
      const html = renderDetail(v);
      expect(html).not.toContain('style=');
      expect(cspMarkupProblems(html)).toEqual([]);
    }
  });
});
