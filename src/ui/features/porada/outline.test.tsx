import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { richDocFromText, type RichDoc } from '@/domain/richtext';
import { porada } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';
import { MeetingStrip } from '../overview';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { Annex2Page, DetailsPage, ItemEditor, OutlinePage } from './index';
import { annex2Input, detailsInput, removeAnnex2Input } from './issue-texts';
import { newInput, saveInput, statementOf, type ItemContext, type ItemView } from './item-editor';
import { addInput, moveInput, removeInput, type OutlineRowView, type OutlineView } from './outline';
import type { OutlineOriginView } from './OriginBanner';

const MONDAY = '2026-11-09';
const L1 = '0b0c1d2e-3f40-4152-8364-758697a8b9c1';
const L2 = '0b0c1d2e-3f40-4152-8364-758697a8b9c2';
const L3 = '0b0c1d2e-3f40-4152-8364-758697a8b9c3';
const POINT = '0b0c1d2e-3f40-4152-8364-758697a8b9c4';
const action = vi.fn();
const actions = { add: action, move: action, remove: action, save: action };

const row = (over: Partial<OutlineRowView> = {}): OutlineRowView => ({
  lineageId: L1,
  slot: null,
  persistence: 'once',
  title: 'Jednorázový bod',
  proposal: null,
  ...over,
});
const outlineOf = (over: Partial<OutlineView> = {}): OutlineView => ({
  monday: MONDAY,
  version: 5,
  pokyny: [
    row({ lineageId: L1, title: 'Schůzky', slot: 'meetings', persistence: 'standing' }),
    row({ lineageId: L2, title: 'Vlastní bod' }),
    row({
      lineageId: L3,
      title: 'Návrh kolegy',
      proposal: { pointId: POINT, isNew: true },
    }),
  ],
  hospodareni: [],
  ...over,
});
const page = (view: OutlineView, origin: OutlineOriginView = { kind: 'stored' }) =>
  renderToStaticMarkup(
    <OutlinePage
      model={{ meeting: 'pondělí 9. listopadu 2026', origin, view }}
      actions={actions}
    />,
  );

/** The list item of one row, found by its title. */
const itemOf = (html: string, title: string) =>
  (html.match(/<li class="space-y-3[\s\S]*?<\/li>/g) ?? []).find((li) => li.includes(title)) ?? '';

describe('OutlinePage', () => {
  it('names the porada, both sections in order and the way back, with clean markup', () => {
    const html = page(outlineOf());
    expect(html).toContain(porada.meeting('pondělí 9. listopadu 2026'));
    expect(html.indexOf(porada.outline.sections.pokyny)).toBeLessThan(
      html.indexOf(porada.outline.sections.hospodareni),
    );
    expect(html).toContain(`href="/porada/${MONDAY}"`);
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('says a section is empty and still offers to add to it', () => {
    const html = page(outlineOf());
    expect(html.match(new RegExp(porada.outline.empty, 'g'))).toHaveLength(1);
    expect(html.match(new RegExp(`>${porada.outline.add.title}</summary>`, 'g'))).toHaveLength(2);
  });

  it('prints the origin banner for a derived or seeded list and none for a stored one', () => {
    expect(page(outlineOf(), { kind: 'derived', from: '2. 11. 2026' })).toContain(
      porada.origin.derived('2. 11. 2026'),
    );
    expect(page(outlineOf(), { kind: 'seed' })).toContain(porada.origin.seed);
    const stored = page(outlineOf());
    expect(stored).not.toContain(porada.origin.seed);
    expect(stored).not.toContain('Obsah převzatý');
  });

  it('marks a slot, and shows a chip for how long an ordinary item stays', () => {
    const html = page(
      outlineOf({
        pokyny: [
          row({ lineageId: L1, title: 'Schůzky', slot: 'meetings', persistence: 'standing' }),
          row({ lineageId: L2, title: 'Stálý bod', persistence: 'standing' }),
          row({ lineageId: L3, title: 'Jednorázový' }),
        ],
      }),
    );
    expect(itemOf(html, 'Schůzky')).toContain(porada.outline.slot);
    expect(itemOf(html, 'Stálý bod')).toContain(porada.outline.chip.standing);
    expect(itemOf(html, 'Stálý bod')).not.toContain(porada.outline.slot);
    expect(itemOf(html, 'Jednorázový')).toContain(porada.outline.chip.once);
  });

  it('links an own item to its editor and a proposal to its review, flagged new or placed', () => {
    const html = page(
      outlineOf({
        pokyny: [
          row({ lineageId: L2, title: 'Vlastní bod' }),
          row({ lineageId: L3, title: 'Nový návrh', proposal: { pointId: POINT, isNew: true } }),
          row({ lineageId: L1, title: 'Zařazený', proposal: { pointId: POINT, isNew: false } }),
        ],
      }),
    );
    expect(itemOf(html, 'Vlastní bod')).toContain(`href="/porada/${MONDAY}/pokyny/${L2}"`);
    const fresh = itemOf(html, 'Nový návrh');
    expect(fresh).toContain(`href="/kontrola/${POINT}"`);
    expect(fresh).toContain(porada.outline.proposal.new);
    expect(fresh).not.toContain(`/pokyny/${L3}`);
    expect(itemOf(html, 'Zařazený')).toContain(porada.outline.proposal.placed);
  });

  it('offers Odebrat only for an ordinary item of the headmaster, not a slot or a proposal', () => {
    const html = page(outlineOf());
    expect(itemOf(html, 'Schůzky')).not.toContain(`>${porada.outline.remove}<`);
    expect(itemOf(html, 'Vlastní bod')).toContain(`>${porada.outline.remove}<`);
    expect(itemOf(html, 'Návrh kolegy')).not.toContain(`>${porada.outline.remove}<`);
  });

  it('gives every row an up and a down button in a group named after its title', () => {
    const html = page(outlineOf());
    for (const title of ['Schůzky', 'Vlastní bod', 'Návrh kolegy']) {
      const item = itemOf(html, title);
      expect(item).toContain(`aria-label="${porada.outline.move.label(title)}"`);
      expect(item).toContain('name="direction"');
      expect(item).toContain(`>${porada.outline.move.up}<`);
      expect(item).toContain(`>${porada.outline.move.down}<`);
    }
  });
});

describe('outline inputs', () => {
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  };

  it('sends the version only for a Monday with a row', () => {
    expect(moveInput(MONDAY, 5, L1)(form({ direction: 'down' }))).toEqual({
      monday: MONDAY,
      lineageId: L1,
      direction: 'down',
      expectedVersion: 5,
    });
    expect(moveInput(MONDAY, null, L1)(form({ direction: 'up' }))).not.toHaveProperty(
      'expectedVersion',
    );
    expect(removeInput(MONDAY, 5, L1)()).toEqual({
      monday: MONDAY,
      lineageId: L1,
      expectedVersion: 5,
    });
    expect(removeInput(MONDAY, null, L1)()).toEqual({ monday: MONDAY, lineageId: L1 });
  });

  it('adds with the id made once for the form, the title and how long it stays', () => {
    expect(
      addInput(MONDAY, null, 'hospodareni', L2)(form({ title: 'Nový', persistence: 'standing' })),
    ).toEqual({
      monday: MONDAY,
      lineageId: L2,
      section: 'hospodareni',
      title: 'Nový',
      persistence: 'standing',
    });
  });
});

const CONTEXT: ItemContext = {
  meeting: 'pondělí 9. listopadu 2026',
  monday: MONDAY,
  version: 5,
  schoolYear: '2026/2027',
};
const item = (over: Partial<ItemView> = {}): ItemView => ({
  lineageId: L2,
  section: 'pokyny',
  slot: null,
  persistence: 'once',
  title: 'Vlastní bod',
  body: richDocFromText('Text bodu.'),
  quotes: [],
  ...over,
});
const editor = (view: ItemView | null, section: 'pokyny' | 'hospodareni' = 'pokyny') =>
  renderToStaticMarkup(
    <ItemEditor context={CONTEXT} section={section} item={view} actions={actions} />,
  );

describe('ItemEditor', () => {
  it('starts a new item empty, with the add button and the choice of how long it stays', () => {
    const html = editor(null);
    expect(html).toContain('name="title"');
    expect(html).not.toMatch(/name="title"[^>]*value="[^"]+"/);
    expect(html).toContain(`>${porada.outline.editor.add}<`);
    expect(html).not.toContain(`>${porada.outline.editor.save}<`);
    expect(html).toContain(porada.outline.persistence.standing);
    expect(html).toContain(porada.outline.persistence.once);
    expect(html).toContain(`href="/porada/${MONDAY}/pokyny"`);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('starts an existing item from its title and text, with Uložit and its preview', () => {
    const html = editor(item());
    expect(html).toContain('value="Vlastní bod"');
    expect(html).toContain(`>${porada.outline.editor.save}<`);
    expect(html).not.toContain(`>${porada.outline.editor.add}<`);
    expect(html).toContain(porada.outline.editor.previewLabel);
    expect(html).toContain('Text bodu.');
  });

  it('shows the preview empty text for an item without a title', () => {
    expect(editor(null)).toContain(porada.outline.editor.previewEmpty);
  });

  it('keeps a slot standing: no choice of how long it stays', () => {
    const html = editor(item({ slot: 'media', persistence: 'standing', title: 'Ohlasy' }));
    expect(html).not.toContain(porada.outline.persistence.once);
  });

  it('edits the quotes of the partners slot instead of a text', () => {
    const html = editor(
      item({
        slot: 'partners',
        persistence: 'standing',
        title: 'Partneři',
        quotes: [{ speakerGenitive: 'pana Nováka', affiliation: 'Firma', quote: 'Díky.' }],
      }),
    );
    expect(html).toContain(porada.outline.editor.quotes.group(1));
    expect(html).toContain('name="quotes.0.speakerGenitive"');
    expect(html).toContain('value="pana Nováka"');
    expect(html).toContain('value="Firma"');
    expect(html).not.toContain('name="body"');
  });

  it.each(['meetings', 'events'] as const)(
    'has nothing to edit in the %s slot, which the document makes itself',
    (slot) => {
      const html = editor(item({ slot, persistence: 'standing' }));
      expect(html).toContain(porada.outline.editor.generated);
      expect(html).toContain(`href="/porada/${MONDAY}/pokyny"`);
      expect(html).not.toContain('<form');
    },
  );
});

describe('item inputs', () => {
  const data = (entries: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(entries)) d.set(k, v);
    return d;
  };
  const BODY = JSON.stringify(richDocFromText('Nový text.'));

  it('saves an ordinary item with its persistence and text, and the version', () => {
    const sent = saveInput(
      CONTEXT,
      5,
      item(),
      [],
    )(data({ title: 'Nový název', persistence: 'standing', body: BODY }));
    expect(sent).toMatchObject({
      monday: MONDAY,
      lineageId: L2,
      title: 'Nový název',
      persistence: 'standing',
      expectedVersion: 5,
    });
    expect(sent).toHaveProperty('body');
    expect(sent).not.toHaveProperty('quotes');
  });

  it('saves a slot without a persistence and the partners slot with quotes, not a text', () => {
    const slot = saveInput(
      CONTEXT,
      null,
      item({ slot: 'media' }),
      [],
    )(data({ title: 'Ohlasy', body: BODY }));
    expect(slot).not.toHaveProperty('persistence');
    expect(slot).not.toHaveProperty('expectedVersion');
    const partners = saveInput(CONTEXT, 5, item({ slot: 'partners' }), [
      { speakerGenitive: 'pana Nováka', affiliation: '  ', quote: 'Díky.' },
    ])(data({ title: 'Partneři' }));
    expect(partners).toMatchObject({
      quotes: [{ speakerGenitive: 'pana Nováka', quote: 'Díky.' }],
    });
    expect(partners).not.toHaveProperty('body');
    expect((partners as { quotes: object[] }).quotes[0]).not.toHaveProperty('affiliation');
  });

  it('drops an empty affiliation from a quote and keeps a written one', () => {
    expect(statementOf({ speakerGenitive: 'a', affiliation: '', quote: 'b' })).toEqual({
      speakerGenitive: 'a',
      quote: 'b',
    });
    expect(statementOf({ speakerGenitive: 'a', affiliation: 'c', quote: 'b' })).toHaveProperty(
      'affiliation',
      'c',
    );
  });

  it('adds with the id made once and the section', () => {
    expect(
      newInput(
        CONTEXT,
        'hospodareni',
        L3,
      )(data({ title: 'Nový', persistence: 'once', body: BODY })),
    ).toMatchObject({
      monday: MONDAY,
      lineageId: L3,
      section: 'hospodareni',
      title: 'Nový',
      persistence: 'once',
      expectedVersion: 5,
    });
  });
});

const detailsPage = (carried: { present: boolean; guests: boolean }) =>
  renderToStaticMarkup(
    <DetailsPage
      model={{
        meeting: 'pondělí 9. listopadu 2026',
        monday: MONDAY,
        version: 2,
        present: 'Jana Nováková',
        guests: 'Host',
        carried,
      }}
      action={action}
    />,
  );

describe('DetailsPage (Údaje)', () => {
  it('shows the stored texts, the way back and no carried notice for a saved porada', () => {
    const html = detailsPage({ present: false, guests: false });
    expect(html).toContain('Jana Nováková');
    expect(html).toContain('Host');
    expect(html).toContain(`href="/porada/${MONDAY}"`);
    expect(html).not.toContain(porada.details.carried);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('tells the texts are carried from the last porada when either is', () => {
    expect(detailsPage({ present: true, guests: false })).toContain(porada.details.carried);
    expect(detailsPage({ present: false, guests: true })).toContain(porada.details.carried);
  });

  it('sends both texts and the version only for a Monday with a row', () => {
    const d = new FormData();
    d.set('present', 'A');
    d.set('guests', 'B');
    expect(detailsInput(MONDAY, 2)(d)).toEqual({
      monday: MONDAY,
      present: 'A',
      guests: 'B',
      expectedVersion: 2,
    });
    expect(detailsInput(MONDAY, null)(d)).not.toHaveProperty('expectedVersion');
  });
});

const annexPage = (annex2: RichDoc, carried: boolean) =>
  renderToStaticMarkup(
    <Annex2Page
      model={{
        meeting: 'pondělí 9. listopadu 2026',
        monday: MONDAY,
        version: 2,
        annex2,
        carried: { annex2: carried },
      }}
      action={action}
    />,
  );

describe('Annex2Page (Příloha 2)', () => {
  it('shows the text with Uložit and Odebrat přílohu', () => {
    const html = annexPage(richDocFromText('Text přílohy.'), false);
    expect(html).toContain('Text přílohy.');
    expect(html).toContain(`>${porada.annex2.save}<`);
    expect(html).toContain(`>${porada.annex2.remove}<`);
    expect(html).not.toContain(porada.annex2.none);
    expect(html).not.toContain(porada.annex2.carried);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('says the porada has no annex when the text is empty', () => {
    expect(annexPage({ type: 'doc', content: [] }, false)).toContain(porada.annex2.none);
  });

  it('says a carried text is saved with the first save, and does not claim there is none', () => {
    const html = annexPage({ type: 'doc', content: [] }, true);
    expect(html).toContain(porada.annex2.carried);
    expect(html).not.toContain(porada.annex2.none);
  });

  it('Odebrat přílohu sends an empty document, Uložit the editor document', () => {
    expect(removeAnnex2Input(MONDAY, 2)()).toEqual({
      monday: MONDAY,
      body: { type: 'doc', content: [] },
      expectedVersion: 2,
    });
    expect(removeAnnex2Input(MONDAY, null)()).not.toHaveProperty('expectedVersion');
    const d = new FormData();
    d.set('body', JSON.stringify(richDocFromText('Nová příloha.')));
    expect(annex2Input(MONDAY, 2)(d)).toMatchObject({ monday: MONDAY, expectedVersion: 2 });
  });
});

describe('MeetingStrip for a moved porada', () => {
  it('prints the meeting date and the deadline of a porada held on another day', () => {
    const html = renderToStaticMarkup(
      <MeetingStrip
        days={[
          {
            monday: '2026-11-09',
            label: '11. 11. 2026',
            held: { weekday: 'sobota', date: '7.\u00a011.', time: '20.00' },
            status: 'open',
            version: 2,
          },
          {
            monday: '2026-11-16',
            label: '16. 11. 2026',
            held: null,
            status: 'open',
            version: null,
          },
        ]}
        addIssue={vi.fn()}
        calendar={{
          issues: [],
          now: '2026-11-03T10:00:00.000Z',
          rule: DEFAULT_DEADLINE,
          plannedThrough: '2026-11-02',
        }}
      />,
    );
    expect(html).toContain(
      porada.heldOn('11. 11. 2026', { weekday: 'sobota', date: '7.\u00a011.', time: '20.00' }),
    );
    expect(html.match(/Porada se koná/g)).toHaveLength(1);
  });
});
