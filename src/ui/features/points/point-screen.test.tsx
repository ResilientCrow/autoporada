import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { calDate } from '@/domain/time';
import { cs } from '@/ui/copy';

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
