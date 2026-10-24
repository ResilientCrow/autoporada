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

  it('names each item by its heading and ties the decisions and the link to it', () => {
    for (const [i, id] of ['r1', 'r2'].entries()) {
      const item = items[i] ?? '';
      expect(item).toContain(`<h3 id="zadatel-${id}" class="font-bold">Žadatel ${id}</h3>`);
      expect(item).toMatch(
        new RegExp(
          `role="group"[^>]*aria-labelledby="zadatel-${id}"|aria-labelledby="zadatel-${id}"[^>]*role="group"`,
        ),
      );
      expect(item).toMatch(new RegExp(`<a [^>]*aria-describedby="zadatel-${id}"`));
    }
    expect(html.match(/<h3 /g)).toHaveLength(2);
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
    id: 'u9',
    version: 3,
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
  isSelf: false,
  choices: { roles: [], statuses: [] },
  ...over,
});

const change = vi.fn(async () => ({ ok: true as const, data: { changed: true } }));
const renderDetail = (v: UserView, freshAuth = true) =>
  renderToStaticMarkup(
    <UserAdmin view={v} freshAuth={freshAuth} decideAccess={decide} changeUserAccess={change} />,
  );

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

  it('lets focus be sent to the title, the last place it can fall back to', () => {
    expect(renderDetail(detail())).toMatch(/<h1 [^>]*tabindex="-1"/);
    expect(render(view())).not.toMatch(/<h1 [^>]*tabindex/);
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

  it('says a cancelled request was cancelled, not decided', () => {
    const html = renderDetail(
      detail({
        request: { ...detail().request!, state: 'cancelled', decided: '3. října 2026' },
        requestEvents: [],
      }),
    );
    expect(html).toContain(users.detail.cancelled('3. října 2026'));
    expect(html).not.toContain(users.detail.decided('3. října 2026'));
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

describe('the role section', () => {
  const { access, accountStatus: account } = users.detail;
  const noRequest = { request: null, requestEvents: [] };
  const colleague = (over: Partial<UserView> = {}) =>
    detail({
      ...noRequest,
      user: { ...detail().user, role: 'reviewer' },
      choices: { roles: ['submitter', 'reviewer', 'headmaster'], statuses: ['active', 'blocked'] },
      ...over,
    });

  it('offers the roles and the audience with the current values, after a fresh sign-in', () => {
    const html = renderDetail(colleague());
    expect(html).toContain(`${access.title}</h2>`);
    expect(html).toMatch(/<h2 [^>]*tabindex="-1"[^>]*>Role a/);
    const role = /<select [^>]*name="role"[^>]*>[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
    expect(role.match(/<option /g)).toHaveLength(3);
    expect(role).toMatch(/<option value="reviewer" selected/);
    expect(role).toContain(cs.status.role.headmaster);
    expect(role).not.toContain('value="pending"');
    const audience = /<select [^>]*name="audience"[^>]*>[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
    expect(audience).toMatch(/<option value="staff" selected/);
    expect(audience).toContain(access.audience.student);
    expect(html).toContain(`>${access.save}</button>`);
    expect(html.slice(0, html.indexOf(account.title))).not.toContain('name="confirmed"');
    expect(html).not.toContain('/auth/step-up');
    expect(html.match(/<noscript>/g)).toHaveLength(1);
  });

  it('selects the student audience for a student', () => {
    const html = renderDetail(
      colleague({ user: { ...detail().user, role: 'submitter', isStudent: true } }),
    );
    expect(html).toMatch(/<option value="student" selected/);
  });

  it('offers a user without access the role “without access” as the current one', () => {
    const html = renderDetail(
      detail({
        ...noRequest,
        choices: { roles: ['pending', 'submitter', 'reviewer', 'headmaster'], statuses: [] },
      }),
    );
    expect(html).toMatch(/<option value="pending" selected/);
  });

  it('asks to sign in again instead, when the sign-in is stale, with no role form', () => {
    const html = renderDetail(colleague(), false);
    expect(html).toContain(cs.stepUpNotice.title);
    expect(html).toContain(`href="/auth/step-up?returnTo=%2Fuzivatele%2Fu9"`);
    expect(html).not.toContain('<select');
    expect(html).not.toContain(access.title);
    expect(html).not.toContain('<noscript>');
  });

  it('shows the own account a notice and neither the form nor the step-up', () => {
    const html = renderDetail(
      detail({ ...noRequest, isSelf: true, choices: { roles: [], statuses: [] } }),
      false,
    );
    expect(html).toContain(users.detail.own);
    expect(html).not.toContain('<select');
    expect(html).not.toContain('/auth/step-up');
  });

  it('points to the decision while a request is pending, with no role form', () => {
    const html = renderDetail(detail());
    expect(html).toContain(access.pendingRequest);
    expect(html).not.toContain('<select');
  });

  it('asks nothing of a user whose access cannot be changed', () => {
    const html = renderDetail(
      detail({ ...noRequest, choices: { roles: [], statuses: [] } }),
      false,
    );
    expect(html).not.toContain('/auth/step-up');
  });

  it('has clean markup', () => {
    for (const html of [renderDetail(colleague()), renderDetail(colleague(), false)]) {
      expect(html).not.toContain('style=');
      expect(cspMarkupProblems(html)).toEqual([]);
    }
  });
});

describe('the account section', () => {
  const { accountStatus: account } = users.detail;
  const person = (status: 'active' | 'blocked' | 'deactivated', over: Partial<UserView> = {}) =>
    detail({
      request: null,
      requestEvents: [],
      user: { ...detail().user, role: 'reviewer', status },
      choices: {
        roles: ['submitter', 'reviewer', 'headmaster'],
        statuses:
          status === 'deactivated' ? ['active', 'blocked', 'deactivated'] : ['active', 'blocked'],
      },
      ...over,
    });
  const section = (html: string) => html.slice(html.indexOf(`${account.title}</h2>`));

  it('blocks an active account behind a ticked confirmation', () => {
    const html = renderDetail(person('active'));
    expect(html).toMatch(/<h2 [^>]*tabindex="-1"[^>]*>Stav účtu/);
    const form = section(html);
    expect(form).toContain(account.blockText);
    expect(form).toMatch(/<input [^>]*type="checkbox"[^>]*name="confirmed"/);
    expect(form).toContain(account.confirm);
    expect(form).toContain(`>${account.block}</button>`);
    expect(form).toContain('border-t-2 border-ink pt-4');
    expect(form).not.toContain(account.unblock);
  });

  it('unblocks a blocked account without a confirmation', () => {
    const form = section(renderDetail(person('blocked')));
    expect(form).toContain(`>${account.unblock}</button>`);
    expect(form).not.toContain('name="confirmed"');
    expect(form).not.toContain(account.block);
  });

  it('restores a deactivated account, and never offers to deactivate', () => {
    const html = renderDetail(person('deactivated'));
    const form = section(html);
    expect(form).toContain(`>${account.restore}</button>`);
    expect(form).not.toContain('name="confirmed"');
    expect(html).not.toContain(cs.status.account.deactivated + '</button>');
  });

  it('is there for a user with a pending request, whose role waits for the decision', () => {
    const html = renderDetail(detail({ choices: { roles: [], statuses: ['active', 'blocked'] } }));
    expect(html).toContain(users.detail.access.pendingRequest);
    expect(html).toContain(`>${account.block}</button>`);
  });

  it('is left out on the own account and when nothing can change', () => {
    expect(renderDetail(person('active', { isSelf: true }))).not.toContain(account.title);
    expect(renderDetail(person('active', { choices: { roles: [], statuses: [] } }))).not.toContain(
      account.title,
    );
  });

  it('gives way to one step-up notice, for both sections, when the sign-in is stale', () => {
    const html = renderDetail(person('active'), false);
    expect(html).not.toContain(account.title);
    expect(html).not.toContain('name="confirmed"');
    expect(html.match(/\/auth\/step-up/g)).toHaveLength(1);
  });

  it('has clean markup', () => {
    for (const status of ['active', 'blocked', 'deactivated'] as const) {
      const html = renderDetail(person(status));
      expect(html).not.toContain('style=');
      expect(cspMarkupProblems(html)).toEqual([]);
    }
  });
});
