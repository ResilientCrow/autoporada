import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs, users } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { UsersList } from './index';
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
  users: [person('a'), person('b', { role: 'pending', isStudent: true, status: 'blocked' })],
  total: 2,
  q: '',
  group: 'all',
  ...over,
});

const render = (v: UsersView) => renderToStaticMarkup(<UsersList view={v} />);

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
    const links = [...html.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)];
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
