import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { calDate } from '@/domain/time';

import { PointScreen } from './PointScreen';

const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('./PointEditor', () => ({
  PointEditor: (props: Record<string, unknown>) => {
    seen.props.push(props);
    return null;
  },
}));

const never = () => Promise.reject(new Error('not called while rendering'));
const render = (standing: object | null, today = calDate(2027, 8, 29)) =>
  renderToStaticMarkup(
    <PointScreen
      point={{
        id: 'p1',
        kind: 'report',
        state: 'draft',
        version: 3,
        standing: standing as never,
        moves: ['withdraw'],
        title: 'Exkurze',
        typeName: null,
        facts: {
          eventDate: null,
          endDate: null,
          timeFrom: null,
          timeTo: null,
          campus: null,
          place: null,
        },
        read: { content: {} as never, schoolYear: '2026/2027', timeline: [] },
        editor: {
          version: 3,
          content: {} as never,
          spec: [],
          titleGender: null,
          typeName: null,
          today,
          readinessSchoolYear: '2026/2027',
          recents: [],
          directory: 'off',
        },
      }}
      savePoint={never}
      submitPoint={never}
      pointStatus={never}
      retractPoint={never}
      withdrawPoint={never}
    />,
  );

beforeEach(() => {
  seen.props = [];
});

describe('the two school years of the editor', () => {
  // Sunday 29 August 2027, after the deadline: the point goes to 6 September, a new school year.
  const AFTER = {
    submitMonday: '2027-09-06',
    issues: [],
    now: '2027-08-29T19:00:00.000Z',
    rule: DEFAULT_DEADLINE,
    plannedThrough: null,
  };

  it('previews with the school year of the porada and checks readiness with today’s', () => {
    render(AFTER);
    expect(seen.props[0]).toMatchObject({
      previewSchoolYear: '2027/2028',
      today: calDate(2027, 8, 29),
    });
  });

  it('previews with today’s school year while no porada is open', () => {
    render(null);
    expect(seen.props[0]).toMatchObject({
      previewSchoolYear: '2026/2027',
      today: calDate(2027, 8, 29),
    });
  });

  it('hands the editor the standing, to show in its submit section', () => {
    render(AFTER);
    expect(seen.props[0]).toMatchObject({ standing: AFTER });
    render(null);
    expect(seen.props[1]).toMatchObject({ standing: null });
  });

  it('hands the editor the moves and the version', () => {
    render(AFTER);
    expect(seen.props[0]).toMatchObject({ moves: { events: ['withdraw'] }, version: 3 });
  });
});
