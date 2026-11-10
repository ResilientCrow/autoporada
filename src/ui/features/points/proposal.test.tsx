import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { calDate } from '@/domain/time';
import { cs } from '@/ui/copy';
import { Form } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { EDITOR_FORM_ID, EDITOR_FORM_STATE, proposalSpec } from './editor-form';
import { PointEditor } from './PointEditor';
import { PointScreen, type PointScreenModel } from './PointScreen';
import { PointReview } from './PointReview';
import { ProposalChooser } from './ProposalChooser';
import { ProposalFields } from './ProposalFields';
import type { ReportEdit } from './use-report-edit';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined }),
  usePathname: () => '/navrhy/novy',
  useSearchParams: () => new URLSearchParams(),
}));

const { points } = cs;
const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const never = () => Promise.reject(new Error('not called while rendering'));
const TODAY = calDate(2027, 3, 9);

const para = (text: string) => ({
  type: 'paragraph' as const,
  attrs: { indent: 0 },
  content: [{ type: 'text' as const, text }],
});

type Content = Parameters<typeof PointEditor>[0]['content'];
const PROPOSAL: Content = {
  title: 'Nové lavice do tříd',
  eventDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: '',
  openingEdited: false,
  body: { type: 'doc', content: [para('Navrhujeme zakoupit lavice.')] },
  bullets: [],
  statements: [],
};
const EMPTY: Content = { ...PROPOSAL, title: '', body: { type: 'doc', content: [] } };

/** Matches the label of a control to its tag, as the editor tests do. */
function controlOf(html: string, label: string): string {
  const id = new RegExp(
    `<label[^>]*\\sfor="([^"]+)"[^>]*>${label}(?: \\(nepovinné\\))?</label>`,
  ).exec(html)?.[1];
  if (id === undefined) throw new Error(`no label ${label}`);
  const tag = new RegExp(`<(?:input|textarea)[^>]*\\sid="${id}"[^>]*>`).exec(html)?.[0];
  if (tag === undefined) throw new Error(`no control for ${label}`);
  return tag;
}

describe('ProposalChooser', () => {
  const html = renderToStaticMarkup(
    <ProposalChooser kinds={['finance', 'pokyn']} createPoint={never} />,
  );

  it('has the page heading „Nový návrh“ as an upright heading', () => {
    expect(html).toMatch(new RegExp(`<h1 [^>]*>${points.proposal.title}</h1>`));
  });

  it('is a group named „Druh návrhu“ in a form of its own', () => {
    expect(html).toMatch(new RegExp(`<legend[^>]*>${points.proposal.legend}[^<]*</legend>`));
    expect(html).toMatch(/<form [^>]*id="novy-navrh"/);
  });

  it('offers one radio per kind, in the given order, named with the design’s words', () => {
    const radios = [...html.matchAll(/<input [^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
    expect(radios.map((r) => /value="([^"]*)"/.exec(r)?.[1])).toEqual(['finance', 'pokyn']);
    radios.forEach((radio) => expect(radio).toContain('name="kind"'));
    const names = [...html.matchAll(/type="radio"[^>]*\/?><span>([^<]*)<\/span>/g)].map(
      (m) => m[1],
    );
    expect(names).toEqual(['Hospodaření', 'Pokyn']);
  });

  it('checks the first kind, so a press always names one', () => {
    expect(html.match(/checked/g)).toHaveLength(1);
    const first = [...html.matchAll(/<input [^>]*>/g)]
      .map((m) => m[0])
      .find((i) => i.includes('value="finance"'));
    expect(first).toContain('checked');
  });

  it('has the „Začít“ button and no problem to start with', () => {
    expect(html).toMatch(
      new RegExp(`<button [^>]*type="submit"[^>]*>(?:<[^>]*>)*${points.chooser.start}`),
    );
    expect(html).not.toContain('role="alert"');
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('proposalSpec', () => {
  it('declares the title and „Text návrhu“, both asked for at the submit, and nothing else', () => {
    const spec = proposalSpec();
    expect(Object.keys(spec)).toEqual(['title', 'body']);
    expect(spec['title']).toMatchObject({ label: points.editor.title, required: true });
    expect(spec['body']).toMatchObject({ label: points.proposal.text, required: true });
  });
});

describe('ProposalFields', () => {
  const edit = (
    shown: ReportEdit['shown'] = null,
  ): Parameters<typeof ProposalFields>[0]['edit'] => ({
    content: PROPOSAL,
    shown,
    bodyInput: 'Navrhujeme zakoupit lavice.',
    change: () => undefined,
    changeBody: () => undefined,
  });
  const render = (readOnly = false, shown: ReportEdit['shown'] = null) =>
    renderToStaticMarkup(
      <Form id={EDITOR_FORM_ID} spec={proposalSpec()} state={EDITOR_FORM_STATE}>
        <ProposalFields edit={edit(shown)} readOnly={readOnly} onBlur={() => undefined} />
      </Form>,
    );

  it('is a title field and a „Text návrhu“ textarea holding the values', () => {
    const html = render();
    expect(controlOf(html, points.editor.title)).toContain('value="Nové lavice do tříd"');
    expect(controlOf(html, points.proposal.text)).toMatch(/^<textarea/);
    expect(html).toMatch(/<textarea[^>]*>Navrhujeme zakoupit lavice\.<\/textarea>/);
  });

  it('makes both read-only while the editor is locked', () => {
    const html = render(true);
    expect(controlOf(html, points.editor.title)).toContain('readOnly');
    expect(controlOf(html, points.proposal.text)).toContain('readOnly');
  });

  it('shows the message of a refused save under its field', () => {
    const html = render(false, {
      messages: { body: 'Text je příliš dlouhý.' },
      notice: null,
      problem: null,
    });
    expect(html).toContain('Text je příliš dlouhý.');
    expect(controlOf(html, points.proposal.text)).toContain('aria-invalid="true"');
    expect(controlOf(html, points.editor.title)).not.toContain('aria-invalid=');
  });
});

describe('PointEditor for a proposal', () => {
  const page = (kind: 'finance' | 'pokyn' = 'finance', content: Content = PROPOSAL) =>
    renderToStaticMarkup(
      <PointEditor
        kind={kind}
        id={ID}
        typeLabel={points.kind[kind]}
        version={3}
        content={content}
        spec={[]}
        titleGender={null}
        typeName={null}
        today={TODAY}
        readinessSchoolYear="2026/2027"
        previewSchoolYear="2026/2027"
        standing={null}
        moves={{ events: ['withdraw'], retractPoint: never, withdrawPoint: never }}
        recents={[]}
        directory="on"
        savePoint={never}
        submitPoint={never}
        pointStatus={never}
      />,
    );
  const form = (...args: Parameters<typeof page>) => {
    const html = page(...args);
    return html.slice(html.indexOf('<form'), html.indexOf('</form>') + '</form>'.length);
  };

  it.each(['finance', 'pokyn'] as const)('shows the %s by its kind, not as a control', (kind) => {
    expect(form(kind)).toMatch(
      new RegExp(`<dt[^>]*>${points.editor.type}</dt><dd[^>]*>${points.kind[kind]}</dd>`),
    );
  });

  it('has the title and the text, and none of the report’s fields', () => {
    const html = form();
    expect(controlOf(html, points.editor.title)).toContain('value="Nové lavice do tříd"');
    expect(controlOf(html, points.proposal.text)).toMatch(/^<textarea/);
    for (const absent of [
      points.facts.eventDate,
      points.facts.endDate,
      points.facts.timeFrom,
      points.facts.campus,
      points.facts.place,
      points.opening.label,
      points.statements.add,
      points.editor.body,
    ]) {
      expect(html).not.toContain(absent);
    }
  });

  it('starts with the autosave status line, before the fields', () => {
    const html = form();
    expect(html.indexOf('aria-live="off"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-live="off"')).toBeLessThan(html.indexOf('<label'));
  });

  it('is a form that never submits by itself, with the submit button at its end', () => {
    const html = form();
    expect(html).toMatch(/<form [^>]*id="bod"/);
    expect(html.indexOf(points.submit.button)).toBeGreaterThan(html.indexOf(points.proposal.text));
  });

  it('stands in the layout toggle, the form beside the preview pane', () => {
    const html = page();
    expect(html).toContain(`>${points.layout.preview}</span>`);
    expect(html.indexOf('<form')).toBeGreaterThan(html.indexOf(points.layout.legend));
  });

  it('lists what the submit still asks for: a title and a text, each leading to its field', () => {
    const html = form('finance', EMPTY);
    expect(html).toContain(points.readiness.problem('title-required', {}));
    expect(html).toContain(points.readiness.problem('body-required', {}));
    expect(html).toMatch(/href="#bod-title"/);
    expect(html).toMatch(/href="#bod-body"/);
    expect(html).not.toContain(points.readiness.problem('event-date-required', {}));
    expect(html).not.toContain(points.readiness.problem('opening-required', {}));
    expect(html).not.toContain(points.readiness.problem('statements-required', {}));
  });

  it('has nothing left to ask for once the title and the text are there', () => {
    expect(form()).toContain(points.readiness.ok);
  });

  it('is clean for the Content-Security-Policy', () => {
    const html = page();
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('PointScreen for a proposal', () => {
  const STANDING = {
    submitMonday: '2027-03-15',
    issues: [],
    now: '2027-03-09T10:00:00.000Z',
    rule: DEFAULT_DEADLINE,
  };
  const EDITOR = {
    version: 3,
    content: PROPOSAL,
    spec: [],
    titleGender: null,
    typeName: null,
    today: TODAY,
    readinessSchoolYear: '2026/2027',
    recents: [],
    directory: 'on' as const,
  };
  const NO_FACTS = {
    eventDate: null,
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
  };
  const POINT: PointScreenModel = {
    id: ID,
    kind: 'finance',
    state: 'draft',
    version: 3,
    standing: STANDING,
    moves: ['withdraw'],
    title: 'Nové lavice do tříd',
    typeName: null,
    facts: NO_FACTS,
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

  it.each(['finance', 'pokyn'] as const)(
    'shows the editor to the author of a draft %s, named by its kind',
    (kind) => {
      const html = screen({ kind });
      expect(html).toMatch(/<form [^>]*id="bod"/);
      expect(controlOf(html, points.proposal.text)).toMatch(/^<textarea/);
      expect(html).toMatch(
        new RegExp(`<dt[^>]*>${points.editor.type}</dt><dd[^>]*>${points.kind[kind]}</dd>`),
      );
      expect(html).not.toContain(points.facts.eventDate);
    },
  );

  const READ = {
    editor: null,
    standing: null,
    state: 'submitted' as const,
    read: { content: PROPOSAL, schoolYear: '2026/2027', timeline: [] },
  };

  it('prints a submitted proposal as the document will: the numbered title and its text', () => {
    const html = screen(READ);
    expect(html).toContain(points.read.label);
    expect(html).toContain('Nové lavice do tříd');
    expect(html).toContain('Navrhujeme zakoupit lavice.');
    // No editor form; the cancel form of the transitions is all there is.
    expect(html).not.toContain('id="bod"');
  });

  it('shows no facts for a proposal, which has no date or place to show', () => {
    expect(screen(READ)).not.toContain(points.facts.none);
  });

  it('prints nothing of the text for a proposal without a title', () => {
    const html = screen({ ...READ, read: { ...READ.read, content: EMPTY } });
    expect(html).not.toContain(points.read.label);
  });
});

describe('PointReview for a proposal', () => {
  const html = renderToStaticMarkup(
    <PointReview
      point={{
        kind: 'pokyn',
        state: 'submitted',
        title: 'Nový provozní řád',
        typeName: null,
        facts: {
          eventDate: null,
          endDate: null,
          timeFrom: null,
          timeTo: null,
          campus: null,
          place: null,
        },
        read: {
          content: { ...PROPOSAL, title: 'Nový provozní řád' },
          schoolYear: '2026/2027',
          timeline: [],
        },
      }}
    />,
  );

  it('prints the numbered point to the reviewer, with the author’s text', () => {
    expect(html).toContain(points.read.label);
    expect(html).toContain('Navrhujeme zakoupit lavice.');
  });

  it('shows no facts', () => {
    expect(html).not.toContain(points.facts.none);
  });
});
