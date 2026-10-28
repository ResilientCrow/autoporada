import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { calDate } from '@/domain/time';
import { cs } from '@/ui/copy';

import { composePointPreview } from '@/document';
import { PaperBlocks } from '@/document/render-html';

import { pointContentOf } from './fields';
import { PointScreen, type PointScreenModel } from './PointScreen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined }),
  usePathname: () => '/body/x',
  useSearchParams: () => new URLSearchParams(),
}));

const { points } = cs;
const NB = '\u00a0';
const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const never = () => Promise.reject(new Error('not called while rendering'));

const STANDING = {
  submitMonday: '2027-03-15',
  issues: [],
  now: '2027-03-09T10:00:00.000Z',
  rule: DEFAULT_DEADLINE,
};
const EDITOR = {
  version: 3,
  content: {
    title: 'Exkurze',
    eventDate: '2027-01-14',
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
    opening: '',
    openingEdited: false,
    body: { type: 'doc' as const, content: [] },
    bullets: [],
    statements: [],
  },
  spec: [],
  titleGender: null,
  today: calDate(2027, 3, 9),
  readinessSchoolYear: '2026/2027',
  recents: [],
  directory: 'off' as const,
};
const POINT: PointScreenModel = {
  id: ID,
  kind: 'report',
  state: 'draft',
  version: 3,
  standing: STANDING,
  moves: ['withdraw'],
  title: 'Exkurze',
  typeName: 'Exkurze',
  facts: {
    eventDate: null,
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
  },
  read: { content: null, schoolYear: '2026/2027', timeline: [] },
  editor: EDITOR,
};

const screen = (point: Partial<PointScreenModel>) =>
  renderToStaticMarkup(
    <PointScreen
      point={{ ...POINT, ...point }}
      savePoint={never}
      submitPoint={never}
      pointStatus={never}
      retractPoint={never}
      withdrawPoint={never}
    />,
  );
const STANDING_TEXT = `Zařadíme do porady z${NB}15.${NB}3.`;

describe('the editor screen of a draft', () => {
  it('shows the standing line once, in the submit section of the editor, before the button', () => {
    const html = screen({});
    expect(html.split(STANDING_TEXT)).toHaveLength(2);
    expect(html.indexOf(STANDING_TEXT)).toBeGreaterThan(html.indexOf('<form'));
    expect(html.indexOf(STANDING_TEXT)).toBeLessThan(html.indexOf(points.submit.button));
  });

  it('offers „Zrušit bod“, and not „Stáhnout“, which the server did not allow', () => {
    const html = screen({});
    expect(html).toContain(points.transitions.withdraw.button);
    expect(html).not.toContain(points.transitions.retract.button);
  });

  it('shows no line and no move when the page gave none', () => {
    const html = screen({ standing: null, moves: [] });
    expect(html).not.toContain('Zařadíme');
    expect(html).not.toContain(points.transitions.withdraw.button);
  });
});

describe('the read view', () => {
  const READ = { editor: null, standing: null };

  it('gives the author of a submitted point „Stáhnout“ with its hint and „Zrušit bod“ with the box', () => {
    const html = screen({ ...READ, state: 'submitted', moves: ['retract', 'withdraw'] });
    expect(html).toContain(points.transitions.retract.button);
    expect(html).toContain(points.transitions.retract.hint);
    expect(html).toContain(points.transitions.withdraw.button);
    expect(html).toContain(points.transitions.withdraw.confirm);
    expect(html).not.toContain('Zařadíme');
  });

  it('gives anyone else no button', () => {
    const html = screen({ ...READ, state: 'submitted', moves: [] });
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
  });

  it('shows the standing line and „Zrušit bod“ on the read view of a draft or returned point', () => {
    const html = screen({ editor: null, kind: 'finance', state: 'returned', typeName: null });
    expect(html.split(STANDING_TEXT)).toHaveLength(2);
    expect(html.indexOf(STANDING_TEXT)).toBeLessThan(
      html.indexOf(points.transitions.withdraw.button),
    );
    expect(html).toContain(points.transitions.withdraw.button);
    expect(html).not.toContain(points.submit.button);
  });

  it('shows no standing line for a point that is already in', () => {
    expect(screen({ ...READ, state: 'approved', moves: [] })).not.toContain('Zařadíme');
  });
});

describe('the content of the read view', () => {
  const CONTENT = {
    ...EDITOR.content,
    title: 'Seminář',
    eventDate: '2027-02-10',
    opening: 'Ve středu proběhl seminář.',
    openingEdited: true,
    body: {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          attrs: { indent: 0 },
          content: [{ type: 'text' as const, text: 'Další odstavec.' }],
        },
      ],
    },
  };
  const SUBMITTED = {
    editor: null,
    standing: null,
    moves: [],
    state: 'submitted' as const,
    read: { content: CONTENT, schoolYear: '2026/2027', timeline: [] },
  };

  it('prints the opening and the paragraphs of a report', () => {
    const html = screen(SUBMITTED);
    expect(html).toContain('Ve středu proběhl seminář.');
    expect(html).toContain('Další odstavec.');
  });

  it('puts an h2 over the paper, whose point headings are h3', () => {
    const html = screen(SUBMITTED);
    expect(html).toContain(`<h2 id="bod-zneni" class="text-xl">${points.read.label}</h2>`);
    expect(html.indexOf('<h2 id="bod-zneni"')).toBeLessThan(html.indexOf('<h3'));
  });

  it('is the markup of the editor’s preview of the same content, to the character', () => {
    const { blocks } = composePointPreview(pointContentOf(CONTENT), { schoolYear: '2026/2027' });
    expect(screen(SUBMITTED)).toContain(renderToStaticMarkup(<PaperBlocks blocks={blocks} />));
  });

  it('sets the paper in the school year the page gives', () => {
    const paragraph = (text: string) => ({
      type: 'paragraph' as const,
      attrs: { indent: 0 },
      content: [{ type: 'text' as const, text }],
    });
    const content = {
      ...CONTENT,
      body: { type: 'doc' as const, content: [paragraph('Rok {skolniRok}.')] },
    };
    const html = screen({
      ...SUBMITTED,
      read: { ...SUBMITTED.read, content, schoolYear: '2031/2032' },
    });
    expect(html).toContain('Rok 2031/2032.');
  });

  it('comes after the facts and before the buttons and the timeline', () => {
    const entry = {
      event: 'approve' as const,
      note: null,
      editedFields: null,
      createdAt: '2027-02-01T09:00:00.000Z',
    };
    const html = screen({
      ...SUBMITTED,
      moves: ['retract', 'withdraw'],
      read: { ...SUBMITTED.read, timeline: [entry] },
    });
    const at = (text: string) => html.indexOf(text);
    expect(at('Datum začátku')).toBeLessThan(at('Ve středu proběhl'));
    expect(at('Ve středu proběhl')).toBeLessThan(at(points.transitions.retract.button));
    expect(at(points.transitions.retract.button)).toBeLessThan(at('Schváleno'));
  });

  it('is not the editor’s preview: no label, no empty-state text', () => {
    const html = screen(SUBMITTED);
    expect(html).not.toContain(points.preview.label);
    expect(html).not.toContain(points.preview.empty);
  });

  it('prints nothing for a report the preview cannot compose', () => {
    const html = screen({
      ...SUBMITTED,
      read: { ...SUBMITTED.read, content: { ...CONTENT, title: '', eventDate: null } },
    });
    expect(html).not.toContain(points.read.label);
    expect(html).not.toContain(points.preview.empty);
  });

  it.each(['finance', 'pokyn'] as const)(
    'prints no paper for a %s, which has no layout yet',
    (kind) => {
      const html = screen({ ...SUBMITTED, kind, typeName: null });
      expect(html).not.toContain('Ve středu proběhl');
      expect(html).not.toContain(points.read.label);
    },
  );
});

describe('the timeline of the screen', () => {
  const ENTRIES = [
    {
      event: 'return' as const,
      note: 'Doplňte název.',
      editedFields: null,
      createdAt: '2027-02-02T09:00:00.000Z',
    },
    {
      event: 'submit' as const,
      note: null,
      editedFields: null,
      createdAt: '2027-02-01T09:00:00.000Z',
    },
  ];
  const read = { ...POINT.read, timeline: ENTRIES };

  it('is below the read view', () => {
    const html = screen({ editor: null, standing: null, state: 'submitted', read });
    expect(html).toContain(`Vráceno k${NB}úpravě: Doplňte název.`);
    expect(html).toContain(`Odesláno ke kontrole 1.${NB}2. v${NB}10.00`);
  });

  it('is below the editor of a returned point, where the author reads the reviewer’s note', () => {
    const html = screen({ state: 'returned', read });
    expect(html.indexOf(`Vráceno k${NB}úpravě: Doplňte název.`)).toBeGreaterThan(
      html.indexOf(points.submit.button),
    );
  });

  it('is not there for a point with no history', () => {
    expect(screen({ editor: null, standing: null })).not.toContain('Průběh');
  });
});
