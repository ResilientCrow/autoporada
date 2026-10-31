import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { registry } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import type { AddEntriesAction } from './actions';
import { Entries, Lists, NewYear, Paste } from './index';
import { PastePreview } from './PastePreview';
import type { PreviewRows } from './PasteForm';

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const OTHER = '1c1d2e3f-4051-4263-8475-8697a8b9cadb';
const action = vi.fn(async () => ({ ok: true as const, data: {} })) as never;
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/[ \t\n]+/g, ' ');
const inputOf = (html: string, name: string) =>
  html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? '';

const list = (over: Record<string, unknown> = {}) => ({
  id: ID,
  key: 'aj-certifikat',
  version: 1,
  title: 'Anglický certifikát',
  docLabel: 'seznam AJ',
  active: true,
  purpose: 'point4' as const,
  entries: 12,
  fresh: 3,
  ...over,
});

const renderLists = (
  canEdit: boolean,
  lists = [list(), list({ id: OTHER, key: 'x', title: 'Druhý' })],
) => renderToStaticMarkup(<Lists view={{ lists, canEdit }} saveList={action} moveList={action} />);

describe('Lists', () => {
  it('shows each list with its counts and a link to its students', () => {
    const html = renderLists(false);
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${registry.title}.*</h1>`));
    expect(text(html)).toContain(registry.lists.counts(12, 3));
    expect(html).toContain('href="/registr/aj-certifikat"');
    expect(html).toContain('href="/registr/x"');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('gives a reviewer no way to change anything', () => {
    const html = renderLists(false);
    expect(html).not.toContain('<form');
    expect(html).not.toContain('novy-skolni-rok');
    expect(html).not.toContain(registry.lists.create.title);
  });

  it('gives the headmaster the order buttons, an edit form per list and the new-list form', () => {
    const html = renderLists(true);
    expect(html).toContain('href="/registr/novy-skolni-rok"');
    expect(html).toContain(`id="seznam-${ID}"`);
    expect(html).toContain(`id="poradi-${ID}"`);
    expect(html).toContain('id="novy-seznam"');
    expect(html).toContain(registry.lists.create.save);
  });

  it('marks a switched-off list and says an annex 1 list cannot be switched off', () => {
    const off = text(renderLists(true, [list({ active: false })]));
    expect(off).toContain(`Anglický certifikát (${registry.lists.off})`);
    const annex = text(renderLists(true, [list({ purpose: 'annex1' })]));
    expect(annex).toContain(registry.lists.fixed);
  });

  it('says so when there is no list', () => {
    expect(text(renderLists(false, []))).toContain(registry.lists.empty);
  });
});

const entry = (over: Record<string, unknown> = {}) => ({
  id: ID,
  givenName: 'Jana',
  familyName: 'Nováková',
  classCode: '1.A',
  version: 1,
  isNew: false,
  ...over,
});
const renderEntries = (canEdit: boolean, entries = [entry(), entry({ id: OTHER, isNew: true })]) =>
  renderToStaticMarkup(
    <Entries
      view={{
        list: { id: ID, key: 'aj-certifikat', title: 'Anglický certifikát' },
        entries,
        canEdit,
      }}
      addEntries={action}
      saveEntry={action}
      removeEntry={action}
    />,
  );

describe('Entries', () => {
  it('lists the students with their class and marks only the new one', () => {
    const html = renderEntries(false);
    expect(html).toMatch(/<h1 [^>]*>.*Anglický certifikát.*<\/h1>/);
    expect(text(html)).toContain('1.A Nováková Jana');
    expect(html.split(registry.new)).toHaveLength(2);
    expect(html).toContain('href="/registr"');
  });

  it('offers a reviewer nothing to change', () => {
    const html = renderEntries(false);
    expect(html).not.toContain('<form');
    expect(html).not.toContain('/vlozit');
    expect(html).not.toContain(registry.entries.remove);
  });

  it('gives the headmaster edit and remove per student, the paste link and the add form', () => {
    const html = renderEntries(true);
    expect(html).toContain('href="/registr/aj-certifikat/vlozit"');
    expect(html).toContain(`id="odebrat-${ID}"`);
    expect(html.match(new RegExp(`>${registry.entries.edit}<`, 'g'))).toHaveLength(2);
    expect(text(html)).toContain(registry.entries.add.title);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('says so when the list is empty', () => {
    expect(text(renderEntries(true, []))).toContain(registry.entries.empty);
  });
});

const row = (over: Record<string, unknown> = {}) => ({
  source: 'Jana Nováková (1.A)',
  givenName: 'Jana',
  familyName: 'Nováková',
  classCode: '1.A',
  problems: [] as string[],
  warnings: [] as { code: string; word: string }[],
  ...over,
});
const renderPreview = (rows: unknown[]) =>
  renderToStaticMarkup(
    <PastePreview
      action={action as AddEntriesAction}
      listId={ID}
      rows={rows as PreviewRows}
      onAdded={vi.fn()}
    />,
  );

describe('PastePreview', () => {
  it('ticks a clean row and counts it on the button', () => {
    const html = renderPreview([row()]);
    expect(inputOf(html, 'pick.0')).toContain('checked');
    expect(inputOf(html, 'pick.0')).not.toContain('disabled=""');
    expect(text(html)).toContain(registry.paste.preview.add(1));
  });

  it('leaves a row with a problem unticked and disabled, and says what is wrong', () => {
    const html = renderPreview([
      row(),
      row({ source: 'Petr', classCode: null, problems: ['class-missing'] }),
      row({ source: 'Eva (9.Z', classCode: null, problems: ['class-unknown'] }),
      row({ source: 'Jana Nováková', problems: ['duplicate'] }),
    ]);
    for (const i of [1, 2, 3]) {
      expect(inputOf(html, `pick.${i}`)).not.toContain('checked');
      expect(inputOf(html, `pick.${i}`)).toContain('disabled=""');
    }
    expect(inputOf(html, 'pick.0')).toContain('checked');
    const t = text(html);
    expect(t).toContain(registry.paste.problems['class-missing']);
    expect(t).toContain(registry.paste.problems['class-unknown']);
    expect(t).toContain(registry.paste.problems.duplicate);
    expect(t).toContain(registry.paste.preview.none);
    expect(t).toContain(registry.paste.preview.add(1));
  });

  it('keeps a warned row ticked and names the group word, also on a row that does not hold it', () => {
    const html = renderPreview([
      row({
        source: 'Jana Nováková',
        classCode: '2.B',
        warnings: [{ code: 'group-count', word: 'obě' }],
      }),
    ]);
    expect(inputOf(html, 'pick.0')).toContain('checked');
    expect(inputOf(html, 'pick.0')).not.toContain('disabled=""');
    expect(text(html)).toContain(registry.paste.groupCount('obě'));
  });

  it('counts none when nothing can be added', () => {
    const html = renderPreview([row({ classCode: null, problems: ['class-missing'] })]);
    expect(text(html)).toContain(registry.paste.preview.add(0));
  });

  it('says so when the text had no name', () => {
    expect(text(renderPreview([]))).toContain(registry.paste.preview.empty);
  });
});

describe('Paste', () => {
  it('has the form with the order and the way back, and no preview before a check', () => {
    const html = renderToStaticMarkup(
      <Paste
        view={{ list: { id: ID, key: 'aj-certifikat', title: 'x' } }}
        previewPaste={action}
        addEntries={action}
      />,
    );
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${registry.paste.title}.*</h1>`));
    expect(html).toContain('href="/registr/aj-certifikat"');
    expect(html).toContain('name="text"');
    expect(html).not.toContain('nahled-vlozeni');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('NewYear', () => {
  const view = {
    lists: [
      { id: ID, title: 'AJ', entries: 5 },
      { id: OTHER, title: 'NJ', entries: 0 },
    ],
    years: { options: ['2025/2026', '2026/2027'], initial: '2025/2026' },
  };
  const render = (freshAuth: boolean) =>
    renderToStaticMarkup(<NewYear view={view} freshAuth={freshAuth} newSchoolYear={action} />);

  it('asks for a fresh sign-in first and shows no form without it', () => {
    const html = render(false);
    expect(html).toContain('/auth/step-up?returnTo=%2Fregistr%2Fnovy-skolni-rok');
    expect(html).not.toContain('<form');
  });

  it('shows every list ticked, the years and the unticked confirm box after a fresh sign-in', () => {
    const html = render(true);
    expect(html).not.toContain('step-up');
    expect(inputOf(html, 'listIds')).toBeDefined();
    const t = text(html);
    expect(t).toContain(registry.newYear.list('AJ', 5));
    expect(t).toContain(registry.newYear.count(5));
    expect(t).toContain('2026/2027');
    expect(inputOf(html, 'confirmed')).not.toContain('checked');
    expect(t).toContain(registry.newYear.submit);
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
