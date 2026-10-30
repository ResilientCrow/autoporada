import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { POINT_LIMITS, type BulletSpec } from '@/domain/report';
import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { calDate } from '@/domain/time';
import { cs } from '@/ui/copy';
import { Form } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { BodyField, ReportFields } from './ReportFields';
import { EDITOR_FORM_ID, EDITOR_FORM_STATE, editorSpec } from './editor-form';
import { PointEditor } from './PointEditor';
import { PointScreen } from './PointScreen';
import type { StandingInput } from './standing';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined }),
  usePathname: () => '/body/x',
  useSearchParams: () => new URLSearchParams(),
}));

const { points } = cs;
type Content = Parameters<typeof PointEditor>[0]['content'];

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const never = () => Promise.reject(new Error('not called while rendering'));

const CONTENT: Content = {
  title: 'Exkurze do Terezína',
  eventDate: '2027-01-14',
  endDate: null,
  timeFrom: '07:30',
  timeTo: null,
  campus: 'radlice',
  place: 'v\u00a0učebně S206',
  opening: '',
  openingEdited: false,
  body: {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text: 'První' }] },
      { type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text: 'Druhý' }] },
    ],
  },
  bullets: [],
  statements: [],
};

const SPEC: readonly BulletSpec[] = [
  { key: 'organizatori', label: 'Organizátoři', kind: 'people', required: false },
  { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
];
const TODAY = calDate(2026, 10, 27);

/** The whole editor: the layout toggle around the form and the preview. */
const editorPage = (
  content: Content = CONTENT,
  typeLabel = 'Exkurze',
  spec: readonly BulletSpec[] = SPEC,
  directory: 'on' | 'off' = 'on',
  standing: StandingInput | null = null,
) =>
  renderToStaticMarkup(
    <PointEditor
      id={ID}
      kind="report"
      typeLabel={typeLabel}
      version={3}
      content={content}
      spec={spec}
      titleGender="f"
      today={TODAY}
      readinessSchoolYear="2026/2027"
      previewSchoolYear="2026/2027"
      standing={standing}
      moves={{ events: ['withdraw'], retractPoint: never, withdrawPoint: never }}
      recents={[]}
      directory={directory}
      savePoint={never}
      submitPoint={never}
      pointStatus={never}
    />,
  );

/** The form alone: the layout toggle's own radios stay out of the checks on the form's fields. */
const editor = (...args: Parameters<typeof editorPage>) => {
  const page = editorPage(...args);
  return page.slice(page.indexOf('<form'), page.indexOf('</form>') + '</form>'.length);
};

const fields = (
  readOnly = false,
  content: Content = CONTENT,
  issues: Record<string, string> = {},
) =>
  renderToStaticMarkup(
    <Form id={EDITOR_FORM_ID} spec={editorSpec([], [])} state={EDITOR_FORM_STATE}>
      <ReportFields
        content={content}
        issues={issues}
        readOnly={readOnly}
        onChange={() => undefined}
        onBlur={() => undefined}
      />
      <BodyField
        text="První"
        issue={issues['body']}
        readOnly={readOnly}
        onChange={() => undefined}
        onBlur={() => undefined}
      />
    </Form>,
  );

/** The control a label points at, as its opening tag. */
function controlOf(html: string, label: string): string {
  const escaped = label.replaceAll('.', '\\.');
  const found = new RegExp(
    `<label[^>]*\\sfor="([^"]+)"[^>]*>${escaped}(?: \\(nepovinné\\))?</label>`,
  ).exec(html);
  if (!found) throw new Error(`No label „${label}“ in the markup`);
  const tag = new RegExp(`<(?:input|textarea)[^>]*\\sid="${found[1]}"[^>]*>`).exec(html);
  if (!tag) throw new Error(`The label „${label}“ points at ${found[1]}, which is no control`);
  return tag[0];
}

describe('PointEditor', () => {
  it('stands in the layout toggle, the form beside the preview pane', () => {
    const page = editorPage();
    expect(page).toContain(`>${points.layout.form}</span>`);
    expect(page).toContain(`>${points.layout.preview}</span>`);
    expect(page.indexOf('<form')).toBeGreaterThan(page.indexOf(points.layout.legend));
  });

  const html = editor();

  it.each([
    [points.editor.title, 'text'],
    [points.facts.eventDate, 'date'],
    [points.facts.endDate, 'date'],
    [points.facts.timeFrom, 'time'],
    [points.facts.timeTo, 'time'],
    [points.facts.place, 'text'],
  ])('labels „%s“ for a native %s control', (label, type) => {
    expect(controlOf(html, label)).toContain(`type="${type}"`);
  });

  it('labels „Další odstavce“ for a textarea', () => {
    expect(controlOf(html, points.editor.body)).toMatch(/^<textarea/);
  });

  it('writes the exact labels of the design', () => {
    expect([
      points.editor.type,
      points.editor.title,
      points.facts.eventDate,
      points.facts.endDate,
      points.facts.timeFrom,
      points.facts.timeTo,
      points.facts.campus,
      points.facts.place,
      points.editor.body,
    ]).toEqual([
      'Typ',
      'Název',
      'Datum začátku',
      'Datum konce',
      'Čas od',
      'Čas do',
      'Areál',
      'Místo',
      'Další odstavce',
    ]);
  });

  it('shows the type as text, not as a control', () => {
    expect(html).toMatch(/<dt[^>]*>Typ<\/dt><dd[^>]*>Exkurze<\/dd>/);
    expect(html).not.toMatch(/<label[^>]*>Typ/);
  });

  it('shows a point without a type by its kind', () => {
    expect(editor(CONTENT, points.kind.pokyn)).toMatch(/<dd[^>]*>Pokyn<\/dd>/);
  });

  it('puts the values in the controls', () => {
    expect(controlOf(html, points.editor.title)).toContain('value="Exkurze do Terezína"');
    expect(controlOf(html, points.facts.eventDate)).toContain('value="2027-01-14"');
    expect(controlOf(html, points.facts.timeFrom)).toContain('value="07:30"');
    expect(controlOf(html, points.facts.place)).toContain('value="v\u00a0učebně S206"');
    expect(html).toMatch(/<textarea[^>]*>První\nDruhý<\/textarea>/);
  });

  it('caps the title and the place at the bounds of the contract', () => {
    expect(controlOf(html, points.editor.title)).toMatch(
      new RegExp(`maxlength="${POINT_LIMITS.title}"`, 'i'),
    );
    expect(controlOf(html, points.facts.place)).toMatch(
      new RegExp(`maxlength="${POINT_LIMITS.place}"`, 'i'),
    );
  });

  it('hints how the place is written, with the no-break space', () => {
    expect(points.editor.placeHint).toBe('například v\u00a0učebně S206');
    expect(html).toContain(points.editor.placeHint);
  });

  it('offers the four campuses as one radio group, with the saved one checked', () => {
    expect(html).toMatch(/<fieldset[^>]*role="radiogroup"[^>]*>/);
    expect(html).toMatch(new RegExp(`<legend[^>]*>${points.facts.campus}`));
    const radios = [...html.matchAll(/<input [^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
    expect(radios.map((r) => /value="([^"]*)"/.exec(r)?.[1])).toEqual([
      'smichov',
      'radlice',
      'na-vidouli',
      'jinde',
    ]);
    expect(radios.filter((r) => r.includes('checked'))).toHaveLength(1);
    expect(radios[1]).toContain('checked');
    for (const label of Object.values(points.campus))
      expect(html).toContain(`<span>${label}</span>`);
  });

  it('checks no campus for a point without one', () => {
    expect(editor({ ...CONTENT, campus: null })).not.toMatch(
      /<input [^>]*type="radio"[^>]*checked/,
    );
  });

  it('starts with the autosave status line, before the fields', () => {
    expect(html.indexOf('aria-live="off"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-live="off"')).toBeLessThan(html.indexOf('<label'));
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('is a form that never submits to the server by itself', () => {
    expect(html).toMatch(/<form [^>]*id="bod"/);
    expect(html).not.toMatch(/<form [^>]*\saction=/);
    const preventDefault = vi.fn();
    const event = { preventDefault } as unknown as Parameters<typeof EDITOR_FORM_STATE.onSubmit>[0];
    EDITOR_FORM_STATE.onSubmit(event);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe('PointEditor with bullets', () => {
  const PERSON = { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' } as const;
  const WITH_BULLETS: Content = {
    ...CONTENT,
    bullets: [
      { key: 'organizatori', label: 'Organizátoři', kind: 'people', order: 'input', people: [] },
      { key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [PERSON] },
    ],
  };
  const html = editor(WITH_BULLETS);

  it('shows the bullets between the place and the further paragraphs', () => {
    const at = (text: string) => html.indexOf(text);
    expect(at('>Organizátoři (nepovinné)</legend>')).toBeGreaterThan(at(points.facts.place));
    expect(at('>Organizátoři (nepovinné)</legend>')).toBeLessThan(at('>Účastníci</legend>'));
    expect(at('>Účastníci</legend>')).toBeLessThan(at(points.editor.body));
  });

  it('shows the opening sentence after the bullets and before the further paragraphs', () => {
    const sentence = editor({ ...WITH_BULLETS, opening: 'Proběhla exkurze.', openingEdited: true });
    const at = (text: string) => sentence.indexOf(text);
    expect(at('>Účastníci</legend>')).toBeLessThan(at(points.opening.label));
    expect(at(points.opening.label)).toBeLessThan(at(points.editor.body));
    expect(sentence).toMatch(/<textarea[^>]*>Proběhla exkurze\.<\/textarea>/);
  });

  it('shows no notice on load, even for a sentence the author wrote', () => {
    const sentence = editor({ ...WITH_BULLETS, opening: 'Moje věta.', openingEdited: true });
    expect(sentence).not.toContain(points.opening.changed);
  });

  it('keeps a required bullet of the type, and lets an optional one go', () => {
    expect(html).toContain('aria-label="Odebrat řádek „Organizátoři“"');
    expect(html).not.toContain('aria-label="Odebrat řádek „Účastníci“"');
  });

  it('knows no bullets of a type for a point without one', () => {
    const bare = editor(WITH_BULLETS, points.kind.pokyn, []);
    expect(bare).toContain('aria-label="Odebrat řádek „Účastníci“"');
  });

  it('is still a form that never submits by itself, with the people fields inside it', () => {
    expect(html).toMatch(/role="combobox"/);
    expect(html).toMatch(/<form [^>]*id="bod"/);
    expect(html).not.toMatch(/<form [^>]*\saction=/);
    expect(html).toMatch(/<form [^>]*noValidate/);
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('says up front that the directory is off, in every people row, when the server says so', () => {
    const off = editor(WITH_BULLETS, 'Exkurze', SPEC, 'off');
    const notice = new RegExp(
      `role="status" data-live-announcer="true">${cs.people.search.notice.off}<`,
      'g',
    );
    expect(off.match(notice)).toHaveLength(2);
  });

  it('shows no such notice when the directory is on', () => {
    expect(html).not.toContain(cs.people.search.notice.off);
  });
});

describe('the date echo', () => {
  const echoOfInput = (html: string, label: string) => {
    const ids = /aria-describedby="([^"]*)"/.exec(controlOf(html, label))?.[1]?.split(' ') ?? [];
    return ids.flatMap((id) => {
      const found = new RegExp(`<p id="${id}"[^>]*>([^<]*)</p>`).exec(html);
      return found ? [found[1]] : [];
    });
  };

  it('says the weekday and the date in words under a date, tied to the input', () => {
    expect(echoOfInput(editor(), points.facts.eventDate)).toEqual(['čtvrtek 14. ledna 2027']);
  });

  it('echoes both dates', () => {
    const html = editor({ ...CONTENT, endDate: '2027-01-15' });
    expect(echoOfInput(html, points.facts.endDate)).toEqual(['pátek 15. ledna 2027']);
  });

  it('has no echo and no reference to one while a date is empty', () => {
    const html = editor();
    expect(echoOfInput(html, points.facts.endDate)).toEqual([]);
    expect(controlOf(html, points.facts.endDate)).not.toContain('-echo');
  });

  it('has none for text that is no date', () => {
    const html = editor({ ...CONTENT, eventDate: '2027-02-30' });
    expect(echoOfInput(html, points.facts.eventDate)).toEqual([]);
  });

  it('gives each date its own echo id', () => {
    const html = editor({ ...CONTENT, endDate: '2027-01-15' });
    const ids = [...html.matchAll(/<p id="([^"]*echo[^"]*)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('never shows an example of the format', () => {
    const html = editor();
    expect(html).not.toMatch(/dd\.? ?mm|rrrr|yyyy|dd\/mm|např\. \d/i);
  });
});

describe('ReportFields while the editor is locked', () => {
  const html = fields(true);

  it('makes every text, date and time control read-only', () => {
    const controls = [...html.matchAll(/<(?:input|textarea)[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => !tag.includes('type="radio"'));
    expect(controls).toHaveLength(7);
    for (const tag of controls) expect(tag, tag).toMatch(/readonly/i);
  });

  it('marks the campus group read-only', () => {
    expect(html).toMatch(/<fieldset[^>]*aria-readonly="true"/);
  });

  it('leaves the controls editable otherwise', () => {
    const open = fields(false);
    expect(open).not.toMatch(/readonly/i);
    expect(open).not.toContain('aria-readonly');
  });
});

describe('ReportFields with the messages of a refused save', () => {
  const MESSAGE = 'Datum konce nesmí být před datem začátku.';
  const html = fields(false, CONTENT, { endDate: MESSAGE, body: 'Text je příliš dlouhý.' });

  it('shows a message under its field and marks the control invalid, wired as its error', () => {
    const end = controlOf(html, points.facts.endDate);
    expect(end).toContain('aria-invalid="true"');
    const ids = /aria-describedby="([^"]*)"/.exec(end)?.[1]?.split(' ') ?? [];
    const described = ids.map(
      (id) => new RegExp(`id="${id}"[^>]*>(?:(?!<\\/div>|<\\/p>).)*`).exec(html)?.[0] ?? '',
    );
    expect(described.join(' ')).toContain(MESSAGE);
  });

  it('shows the body message and marks the textarea', () => {
    expect(html).toContain('Text je příliš dlouhý.');
    expect(controlOf(html, points.editor.body)).toContain('aria-invalid="true"');
  });

  it('leaves the other controls valid', () => {
    expect(controlOf(html, points.facts.eventDate)).not.toContain('aria-invalid="true"');
    expect(controlOf(html, points.editor.title)).not.toContain('aria-invalid="true"');
  });

  it('is no error summary: nothing leads the form and nothing takes focus', () => {
    expect(html).not.toContain(cs.form.summaryTitle);
    expect(html).not.toContain('tabindex="-1"><div');
  });

  it('has no message without issues', () => {
    expect(fields()).not.toContain('aria-invalid="true"');
  });
});

describe('PointScreen', () => {
  const EDITOR = {
    version: 3,
    content: CONTENT,
    spec: SPEC,
    titleGender: 'f' as const,
    today: TODAY,
    readinessSchoolYear: '2026/2027',
    recents: [],
    directory: 'on' as const,
  };
  const POINT = {
    id: ID,
    kind: 'report' as const,
    state: 'draft' as const,
    version: 3,
    standing: null,
    moves: [] as const,
    title: 'Exkurze do Terezína',
    typeName: 'Exkurze',
    facts: {
      eventDate: '14. ledna 2027',
      endDate: null,
      timeFrom: null,
      timeTo: null,
      campus: null,
      place: 'jen ve výpisu',
    },
    read: { content: CONTENT, schoolYear: '2026/2027', timeline: [] },
  };
  const screen = (point: Parameters<typeof PointScreen>[0]['point']) =>
    renderToStaticMarkup(
      <PointScreen
        point={point}
        savePoint={never}
        submitPoint={never}
        pointStatus={never}
        retractPoint={never}
        withdrawPoint={never}
      />,
    );

  it('shows the header and the editor to the author of a draft report', () => {
    const html = screen({ ...POINT, editor: EDITOR });
    expect(html).toContain('<h1');
    expect(html).toMatch(/<form [^>]*id="bod"/);
    // The read view's own values are not on the page.
    expect(html).not.toContain(POINT.facts.place);
  });

  it('shows the header and the read view when there is no editor', () => {
    const html = screen({ ...POINT, state: 'submitted', editor: null });
    expect(html).toContain('<h1');
    expect(html).not.toContain('<form');
    expect(html).toContain('14. ledna 2027');
    expect(html).toContain(POINT.facts.place);
  });

  it('names a report without a type by its kind', () => {
    const html = screen({
      ...POINT,
      typeName: null,
      editor: { ...EDITOR, version: 1 },
    });
    expect(html).toMatch(/<dd[^>]*>Zpráva<\/dd>/);
  });
});

describe('PointEditor: the statements', () => {
  const speaker = { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' } as const;
  const withStatements: Content = {
    ...CONTENT,
    bullets: [
      { key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [speaker] },
    ],
    statements: [{ speaker, speakerGenitive: 'pana Jana Nováka', quote: 'Děkuji.' }],
  };

  it('stands after „Další odstavce“, with the card of each statement', () => {
    const html = editor(withStatements);
    expect(html.indexOf(points.editor.body)).toBeLessThan(html.indexOf(points.statements.heading));
    expect(html).toContain(points.statements.legend(1));
    expect(html).toContain('value="pana Jana Nováka"');
    expect(html).toMatch(/<textarea[^>]*>Děkuji\.<\/textarea>/);
  });

  it('offers the add button even with no statement', () => {
    expect(editor()).toContain(points.statements.add);
  });
});

describe('the standing line in the editor', () => {
  // Design section 6, item 11: the „Odeslání“ part holds the readiness list, the line and the button,
  // so the author who presses the button at the bottom of a long form sees where the point goes.
  const STANDING: StandingInput = {
    submitMonday: '2027-03-15',
    issues: [],
    now: '2027-03-09T10:00:00.000Z',
    rule: DEFAULT_DEADLINE,
  };
  const TEXT = `Zařadíme do porady z\u00a015.\u00a03.`;
  const page = () => editorPage(CONTENT, 'Exkurze', SPEC, 'on', STANDING);

  it('stands once, after the readiness list and before the submit button', () => {
    const html = page();
    expect(html.split(TEXT)).toHaveLength(2);
    expect(html.indexOf(TEXT)).toBeGreaterThan(html.indexOf(points.readiness.heading));
    expect(html.indexOf(TEXT)).toBeLessThan(html.indexOf(points.submit.button));
  });

  it('is inside the form, not above the editor', () => {
    const html = page();
    expect(html.indexOf(TEXT)).toBeGreaterThan(html.indexOf('<form'));
    expect(html.indexOf(TEXT)).toBeLessThan(html.indexOf('</form>'));
  });

  it('is not there without a standing', () => {
    expect(editorPage()).not.toContain('Zařadíme');
  });
});
