import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { POINT_LIMITS } from '@/domain/report';
import { cs } from '@/ui/copy';
import { Form } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { BodyField, ReportFields } from './ReportFields';
import { EDITOR_FORM_ID, EDITOR_FORM_STATE, EDITOR_SPEC } from './editor-form';
import { PointEditor } from './PointEditor';
import { PointScreen } from './PointScreen';

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

const editor = (content: Content = CONTENT, typeLabel = 'Exkurze') =>
  renderToStaticMarkup(
    <PointEditor
      id={ID}
      typeLabel={typeLabel}
      version={3}
      content={content}
      savePoint={never}
      pointStatus={never}
    />,
  );

const fields = (
  readOnly = false,
  content: Content = CONTENT,
  issues: Record<string, string> = {},
) =>
  renderToStaticMarkup(
    <Form id={EDITOR_FORM_ID} spec={EDITOR_SPEC} state={EDITOR_FORM_STATE}>
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
  const POINT = {
    id: ID,
    kind: 'report' as const,
    state: 'draft' as const,
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
  };
  const screen = (point: Parameters<typeof PointScreen>[0]['point']) =>
    renderToStaticMarkup(<PointScreen point={point} savePoint={never} pointStatus={never} />);

  it('shows the header and the editor to the author of a draft report', () => {
    const html = screen({ ...POINT, editor: { version: 3, content: CONTENT } });
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

  it.each(['finance', 'pokyn'] as const)(
    'keeps the read view for an editable %s until it has its own fields',
    (kind) => {
      const html = screen({
        ...POINT,
        kind,
        typeName: null,
        editor: { version: 1, content: CONTENT },
      });
      expect(html).toContain('<h1');
      expect(html).not.toContain('<form');
      expect(html).toContain(POINT.facts.place);
    },
  );

  it('names a report without a type by its kind', () => {
    const html = screen({
      ...POINT,
      typeName: null,
      editor: { version: 1, content: CONTENT },
    });
    expect(html).toMatch(/<dd[^>]*>Zpráva<\/dd>/);
  });
});
