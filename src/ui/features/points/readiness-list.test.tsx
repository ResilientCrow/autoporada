import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { BulletSpec } from '@/domain/report';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import type { PointContentWire } from './fields';
import { readinessItems, readinessOf } from './readiness';
import { editorSpec } from './editor-form';
import { ReadinessList } from './ReadinessList';
import { SubmitPanel } from './SubmitPanel';

const { points, form } = cs;

const SPEC: readonly BulletSpec[] = [
  { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
];
const READY: PointContentWire = {
  title: 'Exkurze do Terezína',
  eventDate: '2027-01-14',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: 'Dne 14. ledna 2027 se uskuteční exkurze.',
  openingEdited: false,
  body: { type: 'doc', content: [] },
  bullets: [
    {
      key: 'ucastnici',
      label: 'Účastníci',
      kind: 'people',
      order: 'input',
      people: [{ salutation: 'pan', givenName: 'Petr', familyName: 'Novák' }],
    },
  ],
  statements: [
    {
      speaker: { salutation: 'pan', givenName: 'Petr', familyName: 'Novák' },
      speakerGenitive: 'Petra Nováka',
      affiliation: '',
      quote: 'Byla to dobrá cesta',
    },
  ],
};
const EMPTY: PointContentWire = { ...READY, title: '', eventDate: null, statements: [] };
const SPEAKER_OUT: PointContentWire = {
  ...READY,
  bullets: [{ key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [] }],
};

const list = (content: PointContentWire) =>
  renderToStaticMarkup(
    <ReadinessList kind="report" content={content} spec={SPEC} schoolYear="2026/2027" />,
  );

describe('ReadinessList', () => {
  it('links each problem to its field by the editor’s field id, in the form’s order', () => {
    const html = list(EMPTY);
    const links = [...html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(links).toEqual([
      ['#bod-title', 'Vyplňte název.'],
      ['#bod-eventDate', 'Vyplňte datum začátku.'],
    ]);
    // „Přidejte alespoň jedno vyjádření.“ names no control: plain text.
    expect(html).toContain('<li>Přidejte alespoň jedno vyjádření.</li>');
  });

  it('says so when nothing is missing, and shows no list', () => {
    const html = list(READY);
    expect(html).toContain(points.readiness.ok);
    expect(html).not.toContain('<ul');
  });

  it('shows a speaker who is no participant as a warning, not as a problem', () => {
    const html = list(SPEAKER_OUT);
    const warning = 'Mluvčí Petr Novák není mezi účastníky.';
    expect(html).toContain(warning);
    expect(html.indexOf(points.readiness.warnings)).toBeLessThan(html.indexOf(warning));
    expect(html.indexOf(points.readiness.problems)).toBeLessThan(
      html.indexOf(points.readiness.warnings),
    );
    expect(html).toContain('href="#bod-statements-0-speaker"');
  });

  it('carries no style attribute and is clean for the Content-Security-Policy', () => {
    expect(list(EMPTY)).not.toContain('style=');
    expect(cspMarkupProblems(list(EMPTY))).toEqual([]);
  });
});

describe('SubmitPanel', () => {
  const panel = (props: Partial<Parameters<typeof SubmitPanel>[0]> = {}) =>
    renderToStaticMarkup(
      <SubmitPanel
        kind="report"
        content={EMPTY}
        spec={SPEC}
        schoolYear="2026/2027"
        summary={null}
        attempt={0}
        pending={false}
        held={false}
        onSubmit={() => undefined}
        {...props}
      />,
    );

  it('offers „Odeslat ke kontrole“ although the point is not ready, never disabled', () => {
    for (const content of [EMPTY, READY]) {
      const html = panel({ content });
      expect(html).toMatch(/<button[^>]*>Odeslat ke kontrole<\/button>/);
      expect(html).not.toMatch(/<button[^>]* disabled[=> ]/);
      expect(html).not.toContain('data-disabled');
    }
  });

  it('is disabled only while a banner holds the editor', () => {
    expect(panel({ held: true })).toMatch(/<button[^>]* disabled[=> ]/);
  });

  it('leads with no summary before a press', () => {
    expect(panel()).not.toContain(form.summaryTitle);
  });

  it('shows the error summary with links to the fields after a press with problems', () => {
    const html = panel({
      attempt: 1,
      summary: [
        { id: 'bod-title', text: 'Vyplňte název.' },
        { id: null, text: 'Přidejte alespoň jedno vyjádření.' },
      ],
    });
    expect(html).toContain(form.summaryTitle);
    expect(html).toContain('<a href="#bod-title">Vyplňte název.</a>');
    expect(html.indexOf(form.summaryTitle)).toBeLessThan(html.indexOf(points.readiness.heading));
    expect(cspMarkupProblems(html)).toEqual([]);
    expect(html).not.toContain('style=');
  });

  it('marks the pending button while the submit is on its way', () => {
    expect(panel({ pending: true })).toContain('data-pending');
  });
});

describe('a row with two people who miss the same thing', () => {
  // Readiness folds every person of a row into the row's one control, so these two entries
  // share an id: the summary must still list both and render without a duplicate-key warning.
  const TWO: PointContentWire = {
    ...READY,
    bullets: [
      {
        key: 'ucastnici',
        label: 'Účastníci',
        kind: 'people',
        order: 'input',
        people: [
          { salutation: null, givenName: 'Petr', familyName: 'Novák' },
          { salutation: null, givenName: 'Jana', familyName: 'Svobodová' },
        ],
      },
    ],
    statements: [],
  };

  it('lists both in the summary, keyed apart', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { problems } = readinessItems(
        readinessOf('report', TWO, SPEC, '2026/2027'),
        editorSpec(TWO.bullets, SPEC, 0),
      );
      const salutations = problems.filter((p) => p.text.includes('zvolte oslovení'));
      expect(salutations.map((p) => p.id)).toEqual([
        'bod-bullets-0-people',
        'bod-bullets-0-people',
      ]);
      const html = renderToStaticMarkup(
        <SubmitPanel
          kind="report"
          content={TWO}
          spec={SPEC}
          schoolYear="2026/2027"
          summary={problems}
          attempt={1}
          pending={false}
          held={false}
          onSubmit={() => undefined}
        />,
      );
      expect(html.match(/zvolte oslovení/g)).toHaveLength(4); // the summary and the list
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
