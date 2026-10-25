import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { cs, issues } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { Form } from '@/ui/form';

import { MeetingStrip } from './index';
import type { MeetingDay } from './MeetingStrip';
import { dateId, formId, skipSpec } from './inputs';

const day = (monday: string, label: string, over: Partial<MeetingDay> = {}): MeetingDay => ({
  monday,
  label,
  status: 'open',
  version: null,
  ...over,
});

const DAYS: readonly MeetingDay[] = [
  day('2026-11-09', '9. 11. 2026'),
  day('2026-11-16', '16. 11. 2026', { status: 'skipped', version: 2 }),
  day('2026-11-23', '23. 11. 2026', { status: 'generated', version: 5 }),
  day('2026-11-30', '30. 11. 2026'),
];

const setSkipped = vi.fn(async () => ({
  ok: true as const,
  data: { status: 'skipped' as const, version: 2 },
}));
const render = (days: readonly MeetingDay[] = DAYS) =>
  renderToStaticMarkup(<MeetingStrip days={days} setSkipped={setSkipped} />);

/** The list items of the strip, one per Monday. */
const itemsOf = (html: string) => html.match(/<li[ >].*?<\/li>/gs) ?? [];

describe('MeetingStrip', () => {
  it('is a card titled „Nejbližší porady“ with clean markup', () => {
    const html = render();
    expect(html).toContain(`>${issues.strip.title}</h2>`);
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('lists the Mondays in order, each with its date and its status chip', () => {
    const items = itemsOf(render());
    expect(items).toHaveLength(4);
    const expected = [
      ['9. 11. 2026', cs.status.issue.open],
      ['16. 11. 2026', cs.status.issue.skipped],
      ['23. 11. 2026', cs.status.issue.generated],
      ['30. 11. 2026', cs.status.issue.open],
    ] as const;
    items.forEach((item, index) => {
      const [label, chip] = expected[index]!;
      expect(item).toContain(label);
      expect(item).toContain(chip);
    });
  });

  it('offers an open Monday the skip checkbox and the „Porada se nekoná“ button', () => {
    const item = itemsOf(render())[0]!;
    expect(item).toContain('<form');
    expect(item).toContain(issues.strip.skip.confirm);
    expect(item).toMatch(
      /type="checkbox"[^>]*name="confirmed"|name="confirmed"[^>]*type="checkbox"/,
    );
    expect(item).toContain(`${issues.strip.skip.submit}</button>`);
    expect(item).not.toContain(issues.strip.unskip.confirm);
    expect(item).not.toContain(issues.strip.unskip.submit);
  });

  it('offers a skipped Monday the undo checkbox and the „Porada se koná“ button', () => {
    const item = itemsOf(render())[1]!;
    expect(item).toContain('<form');
    expect(item).toContain(issues.strip.unskip.confirm);
    expect(item).toContain(`${issues.strip.unskip.submit}</button>`);
    expect(item).not.toContain(issues.strip.skip.confirm);
    expect(item).not.toContain(issues.strip.skip.submit);
  });

  it('gives a generated Monday no form at all (M9 owns it)', () => {
    const item = itemsOf(render())[2]!;
    expect(item).toContain(cs.status.issue.generated);
    expect(item).not.toContain('<form');
    expect(item).not.toContain('<button');
    expect(item).not.toContain('checkbox');
  });

  it('separates the form from the date and the chip', () => {
    const item = itemsOf(render())[0]!;
    expect(item).toMatch(/<section [^>]*border-t-2[^>]*>.*<form/s);
  });

  it('gives every form its own id and its own checkbox id', () => {
    const html = render();
    const formIds = [...html.matchAll(/<form [^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(formIds).toHaveLength(3);
    expect(new Set(formIds).size).toBe(3);
    const allIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const id of formIds) expect(id).toContain('porada-');
  });

  it('renders no form for an empty list', () => {
    const html = render([]);
    expect(html).toContain(issues.strip.title);
    expect(html).not.toContain('<form');
  });
});

describe('MeetingStrip for assistive technology', () => {
  it('names each form group by the date of its Monday', () => {
    const items = itemsOf(render());
    const formed = items.filter((item) => item.includes('<form'));
    expect(formed).toHaveLength(3);
    for (const item of formed) {
      const group =
        /<section [^>]*role="group"[^>]*aria-labelledby="([^"]+)"|<section [^>]*aria-labelledby="([^"]+)"[^>]*role="group"/.exec(
          item,
        );
      const id = group?.[1] ?? group?.[2];
      expect(id).toBeDefined();
      const heading = new RegExp(`<h3 [^>]*id="${id}"[^>]*>([^<]+)</h3>`).exec(item);
      expect(heading?.[1]).toMatch(/^\d+\. \d+\. 2026$/);
    }
  });

  it('gives each date a heading that can take focus', () => {
    const items = itemsOf(render());
    for (const [index, monday] of [
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ].entries()) {
      expect(items[index]).toMatch(new RegExp(`<h3 [^>]*id="${dateId(monday)}"[^>]*tabindex="-1"`));
    }
  });

  it('keeps an always-mounted status region, empty until something is said', () => {
    expect(render()).toContain('<div role="status"></div>');
  });

  it('gives the heading of the card a focus target for after a change', () => {
    expect(render()).toMatch(new RegExp(`<h2 [^>]*tabindex="-1"[^>]*>${issues.strip.title}</h2>`));
  });

  it('says that the form needs JavaScript once, and only where there is a form', () => {
    const html = render();
    expect(html.match(/<noscript>/g)).toHaveLength(1);
    expect(html).toContain(cs.form.noscript);
    expect(
      render([day('2026-11-23', '23. 11. 2026', { status: 'generated', version: 5 })]),
    ).not.toContain('<noscript>');
    expect(render([])).not.toContain('<noscript>');
  });

  it('words what was said after a skip and after an undo', () => {
    expect(issues.strip.said.skip('16. 11. 2026')).toBe('Porada 16. 11. 2026 se nekoná.');
    expect(issues.strip.said.unskip('16. 11. 2026')).toBe('Porada 16. 11. 2026 se koná.');
  });
});

describe('a stale Monday', () => {
  const monday = '2026-11-09';
  const renderIssue = () =>
    renderToStaticMarkup(
      <Form
        id={formId(monday)}
        spec={skipSpec('skip', '9. 11. 2026')}
        state={{
          issues: { monday: 'invalid' },
          problem: null,
          attempt: 1,
          submitting: null,
          onSubmit: () => undefined,
        }}
      >
        {null}
      </Form>,
    );

  it('tells the headmaster that the deadline has passed, not a bare „invalid“', () => {
    const html = renderIssue();
    expect(html).toContain(issues.strip.stale);
    expect(html).not.toContain(cs.fieldIssues.invalid);
  });

  it('links that message to the heading of the Monday', () => {
    expect(renderIssue()).toContain(`href="#${dateId(monday)}"`);
  });
});
