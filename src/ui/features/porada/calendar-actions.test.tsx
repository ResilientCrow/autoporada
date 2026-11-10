import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { porada } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { DropForm, MoveForm, OpenStatusCard, type CalendarActsView } from './CalendarActions';

const row = (monday: string) => ({
  monday,
  meetingDate: monday,
  deadlineAt: new Date(Date.parse(`${monday}T19:00:00Z`) - 2 * 864e5).toISOString(),
  status: 'open' as const,
});

const STATUS = 'Koná se';
const move = vi.fn(async () => ({
  ok: true as const,
  data: {
    monday: '2026-11-09',
    meetingDate: '2026-11-10',
    deadlineAt: '2026-11-08T19:00:00.000Z',
    version: 4,
  },
}));
const drop = vi.fn(async () => ({
  ok: true as const,
  data: { heir: { monday: '2026-11-16', meetingDate: '2026-11-16' } },
}));

const view = (over: Partial<CalendarActsView> = {}): CalendarActsView => ({
  monday: '2026-11-09',
  meetingDate: '2026-11-09',
  label: '9. 11. 2026',
  meeting: 'pondělí 9. listopadu 2026',
  version: 3,
  calendar: {
    issues: [row('2026-11-09'), row('2026-11-16'), row('2026-11-23')],
    now: '2026-11-03T10:00:00.000Z',
    rule: DEFAULT_DEADLINE,
    plannedThrough: '2026-11-23',
  },
  dropProgram: null,
  ...over,
});

describe('MoveForm', () => {
  const html = (over: Partial<CalendarActsView> = {}) =>
    renderToStaticMarkup(
      <MoveForm action={move} view={view(over)} onCancel={vi.fn()} onDone={vi.fn()} />,
    );

  it('names the porada, offers the days between its neighbours, then the buttons', () => {
    const out = html();
    expect(out).toContain(porada.move.lead('pondělí 9. listopadu 2026'));
    expect(out).toContain(porada.move.day);
    expect(out).toContain(porada.move.hint);
    expect(out).toMatch(/name="meetingDate"/);
    expect(out).toContain('min="2026-11-03"');
    expect(out).toContain('max="2026-11-15"');
    expect(out).toMatch(
      /name="meetingDate"[^>]*value="2026-11-09"|value="2026-11-09"[^>]*name="meetingDate"/,
    );
    const at = (text: string) => out.indexOf(text);
    expect(at(`${porada.move.submit}</button>`)).toBeLessThan(at(`${porada.move.cancel}</button>`));
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('says why the starting day is no move: it is the porada’s own', () => {
    expect(html()).toContain(porada.move.refused.same);
  });

  it('has no confirmation box', () => {
    expect(html()).not.toContain('name="confirmed"');
  });
});

describe('DropForm', () => {
  const html = (over: Partial<CalendarActsView> = {}) =>
    renderToStaticMarkup(
      <DropForm action={drop} view={view(over)} onCancel={vi.fn()} onDone={vi.fn()} />,
    );

  it('says where the points go and asks for the confirmation before the buttons', () => {
    const out = html();
    expect(out).toContain(
      porada.drop.lead('pondělí 9. listopadu 2026', 'pondělí 16. listopadu 2026'),
    );
    expect(out).toMatch(
      /type="checkbox"[^>]*name="confirmed"|name="confirmed"[^>]*type="checkbox"/,
    );
    expect(out).toContain(porada.drop.confirm);
    const at = (text: string) => out.indexOf(text);
    expect(at('name="confirmed"')).toBeLessThan(at(`${porada.drop.submit}</button>`));
    expect(at(`${porada.drop.submit}</button>`)).toBeLessThan(at(`${porada.drop.cancel}</button>`));
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('says the program goes along, is lost, or says nothing when none is stored', () => {
    expect(html({ dropProgram: 'along' })).toContain(porada.drop.program.along);
    expect(html({ dropProgram: 'lost' })).toContain(porada.drop.program.lost);
    const none = html({ dropProgram: null });
    expect(none).not.toContain(porada.drop.program.along);
    expect(none).not.toContain(porada.drop.program.lost);
  });

  it('has no date field', () => {
    expect(html()).not.toContain('name="meetingDate"');
  });
});

describe('OpenStatusCard', () => {
  const card = () =>
    renderToStaticMarkup(
      <OpenStatusCard
        move={move}
        drop={drop}
        view={view()}
        title={porada.meeting('pondělí 9. listopadu 2026')}
      >
        <p>{STATUS}</p>
      </OpenStatusCard>,
    );

  it('shows the title, the status, and both acts as buttons after the content', () => {
    const out = card();
    expect(out).toContain(porada.meeting('pondělí 9. listopadu 2026'));
    const at = (text: string) => out.indexOf(text);
    expect(at(STATUS)).toBeLessThan(at(`${porada.move.title}</button>`));
    expect(at(`${porada.move.title}</button>`)).toBeLessThan(at(`${porada.drop.title}</button>`));
    expect(cspMarkupProblems(out)).toEqual([]);
  });

  it('keeps both dialogs closed until pressed', () => {
    const out = card();
    expect(out).not.toContain(porada.move.lead('pondělí 9. listopadu 2026'));
    expect(out).not.toContain(porada.drop.confirm);
    expect(out).toContain('<div role="status"></div>');
  });
});
