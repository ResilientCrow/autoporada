import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { RecentPerson } from '@/domain/people';
import { people } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import type { Notice } from './directory-state';
import { SearchBox } from './SearchBox';
import { SearchNotice } from './SearchNotice';

const LABEL = 'Přidat osobu';

const RECENTS: readonly RecentPerson[] = [
  {
    salutation: 'pani',
    givenName: 'Jana',
    familyName: 'Nováková',
    lastUsed: '2026-10-20T10:00:00.000Z',
  },
];

const box = (directory: 'on' | 'off', recents: readonly RecentPerson[] = RECENTS) =>
  renderToStaticMarkup(
    <SearchBox label={LABEL} recents={recents} directory={directory} count={0} onAdd={() => {}} />,
  );

describe('SearchBox on the server', () => {
  it.each(['on', 'off'] as const)('renders markup the CSP accepts with the directory %s', (d) => {
    const html = box(d);
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('wires the label to the combobox input', () => {
    const html = box('on');
    const input = /<input [^>]*>/.exec(html)?.[0] ?? '';
    expect(input).toMatch(/role="combobox"/);
    const labelId = /<label [^>]*id="([^"]+)"/.exec(html)?.[1];
    expect(labelId).toBeDefined();
    expect(input).toContain(`aria-labelledby="${labelId}`);
    expect(html).toMatch(new RegExp(`<label [^>]*>${LABEL}</label>`));
  });

  it('caps the input at what the route takes, and turns browser autocomplete off', () => {
    const input = /<input [^>]*>/.exec(box('on'))?.[0] ?? '';
    expect(input).toContain('maxLength="64"');
    expect(input).toContain('autoComplete="off"');
  });

  it('starts closed and quiet: no listbox, no option, no empty state, an empty status', () => {
    const html = box('on', []);
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('role="option"');
    expect(html).toMatch(/<p id="[^"]+" role="status" data-live-announcer="true"><\/p>/);
  });

  it('points the box at the notice, which stays reachable while the list hides the page', () => {
    const html = box('off');
    const noticeId = /<p id="([^"]+)" role="status" data-live-announcer="true">/.exec(html)?.[1];
    expect(noticeId).toBeDefined();
    expect(html).toMatch(new RegExp(`<input[^>]*aria-describedby="[^"]*${noticeId}`));
  });

  it('says the directory is off beside the box when it is, in a status', () => {
    const html = box('off');
    expect(html).toMatch(
      new RegExp(
        `<p id="[^"]+" role="status" data-live-announcer="true">${people.search.notice.off}</p>`,
      ),
    );
    expect(html).not.toContain('role="listbox"');
  });

  it('keeps the add announcement apart from the notice, both live regions that the open list leaves exposed', () => {
    const html = box('on');
    expect(html.match(/role="status"/g)).toHaveLength(2);
    // Both are marked, so the open list does not hide them from assistive technology.
    expect(html).toContain('<div data-live-announcer="true"><div role="status"></div></div>');
  });
});

describe('SearchNotice', () => {
  const COPY: readonly (readonly [Notice, string])[] = [
    ['off', people.search.notice.off],
    ['down', people.search.notice.down],
    ['rate-limited', people.search.notice.rateLimited],
    ['signed-out', people.search.notice.signedOut],
  ];

  it.each(COPY)('shows %s as a status with its copy', (notice, copy) => {
    expect(renderToStaticMarkup(<SearchNotice notice={notice} />)).toBe(
      `<p role="status" data-live-announcer="true">${copy}</p>`,
    );
  });

  it('is an empty status region when there is nothing to say', () => {
    expect(renderToStaticMarkup(<SearchNotice notice={null} />)).toBe(
      '<p role="status" data-live-announcer="true"></p>',
    );
  });

  it('has four different texts, none of them a listbox empty state', () => {
    expect(new Set(COPY.map(([, copy]) => copy)).size).toBe(4);
    for (const [notice] of COPY) {
      expect(renderToStaticMarkup(<SearchNotice notice={notice} />)).not.toMatch(/listbox|option/);
    }
  });

  it('says the copy of the design, word for word', () => {
    const nbsp = '\u00A0';
    expect(people.search.notice.off).toBe(
      `Hledání v${nbsp}adresáři školy zatím není zapnuté. Osobu vyberte z${nbsp}dříve použitých nebo ji zadejte ručně.`,
    );
    expect(people.search.notice.down).toBe(
      'Adresář školy teď neodpovídá. Osobu můžete zadat ručně.',
    );
    expect(people.search.notice.rateLimited).toBe(
      'Hledáte příliš rychle. Zkuste to za chvíli, nebo osobu zadejte ručně.',
    );
    expect(people.search.notice.signedOut).toBe(
      `Byli jste odhlášeni. Hledání v${nbsp}adresáři bude fungovat po novém přihlášení.`,
    );
    expect(people.search.recents).toBe('Dříve použité');
    expect(people.search.directory).toBe(`Z${nbsp}adresáře školy`);
    expect(people.search.manual('Jan Novák')).toBe('Přidat ručně: Jan Novák');
  });
});
