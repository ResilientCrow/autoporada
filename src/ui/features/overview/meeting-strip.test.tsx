import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { cs, issues } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { MeetingStrip } from './index';
import type { MeetingDay } from './MeetingStrip';

const day = (monday: string, label: string, over: Partial<MeetingDay> = {}): MeetingDay => ({
  monday,
  label,
  held: null,
  status: 'open',
  version: null,
  ...over,
});

const DAYS: readonly MeetingDay[] = [
  day('2026-11-09', '9. 11. 2026'),
  day('2026-11-16', '16. 11. 2026', { version: 2 }),
  day('2026-11-23', '23. 11. 2026', { status: 'generated', version: 5 }),
  day('2026-11-30', '30. 11. 2026'),
];

const addIssue = vi.fn(async () => ({
  ok: true as const,
  data: {
    monday: '2026-11-09',
    meetingDate: '2026-11-10',
    deadlineAt: '2026-11-07T19:00:00.000Z',
    version: 1,
  },
}));
const CALENDAR = {
  issues: [],
  now: '2026-11-03T10:00:00.000Z',
  rule: DEFAULT_DEADLINE,
  plannedThrough: '2027-04-26',
};
const render = (days: readonly MeetingDay[] = DAYS) =>
  renderToStaticMarkup(<MeetingStrip days={days} addIssue={addIssue} calendar={CALENDAR} />);

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
      ['16. 11. 2026', cs.status.issue.open],
      ['23. 11. 2026', cs.status.issue.generated],
      ['30. 11. 2026', cs.status.issue.open],
    ] as const;
    items.forEach((item, index) => {
      const [label, chip] = expected[index]!;
      expect(item).toContain(label);
      expect(item).toContain(chip);
    });
  });

  it('gives a porada no form of its own: moving and dropping are on its page', () => {
    for (const item of itemsOf(render())) {
      expect(item).not.toContain('<form');
      expect(item).not.toContain('<button');
      expect(item).not.toContain('checkbox');
    }
  });

  it('offers „Přidat poradu“ beside the title, as a closed dialog', () => {
    const html = render();
    expect(html).toContain(`${issues.strip.add.title}</button>`);
    expect(html.indexOf(issues.strip.title)).toBeLessThan(
      html.indexOf(`${issues.strip.add.title}</button>`),
    );
    expect(html).not.toContain(issues.strip.add.lead);
    expect(html).not.toContain('<form');
  });

  it('renders no list item for an empty list', () => {
    const html = render([]);
    expect(html).toContain(issues.strip.title);
    expect(itemsOf(html)).toHaveLength(0);
  });
});

describe('MeetingStrip for assistive technology', () => {
  it('keeps an always-mounted status region, empty until something is said', () => {
    expect(render()).toContain('<div role="status"></div>');
  });

  it('gives the heading of the card a focus target for after a change', () => {
    expect(render()).toMatch(new RegExp(`<h2 [^>]*tabindex="-1"[^>]*>${issues.strip.title}</h2>`));
  });
});
