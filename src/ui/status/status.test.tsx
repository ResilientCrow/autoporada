import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ROLES, USER_STATUSES } from '@/domain/actor';
import {
  ACCESS_MACHINE,
  FUTURE_MACHINE,
  ISSUE_MACHINE,
  POINT_MACHINE,
  type AccessState,
  type FutureState,
  type IssueStatus,
  type PointState,
} from '@/domain/review';
import { cs } from '@/ui/copy';

import {
  ACCESS_LOOK,
  ACCOUNT_LOOK,
  Chip,
  FUTURE_LOOK,
  ISSUE_LOOK,
  POINT_LOOK,
  ROLE_LOOK,
  STANDING_LOOK,
  STUDENT_LOOK,
} from './index';

const ACCESS_STATES: readonly AccessState[] = [
  ...new Set(Object.values(ACCESS_MACHINE).flatMap((t) => [...t.from, t.to])),
];

const ISSUE_STATUSES: readonly IssueStatus[] = [
  ...new Set(Object.values(ISSUE_MACHINE).flatMap((t) => [...t.from, t.to])),
];

const POINT_STATES: readonly PointState[] = [
  ...new Set(Object.values(POINT_MACHINE).flatMap((t) => [...t.from, t.to])),
];

const FUTURE_STATES: readonly FutureState[] = [
  ...new Set(Object.values(FUTURE_MACHINE).flatMap((t) => [...t.from, t.to])),
];

describe('status looks', () => {
  it('cover every access state, role and account status, and nothing else', () => {
    expect(Object.keys(ACCESS_LOOK).sort()).toEqual([...ACCESS_STATES].sort());
    expect(Object.keys(ROLE_LOOK).sort()).toEqual([...ROLES].sort());
    expect(Object.keys(ACCOUNT_LOOK).sort()).toEqual([...USER_STATUSES].sort());
    expect(Object.keys(ISSUE_LOOK).sort()).toEqual([...ISSUE_STATUSES].sort());
  });

  it('cover every state a point can reach, labelled from the copy', () => {
    expect(Object.keys(POINT_LOOK).sort()).toEqual([...POINT_STATES].sort());
    expect(Object.values(POINT_LOOK).map((look) => look.label)).toEqual(
      Object.values(cs.points.state),
    );
  });

  it('cover every state an akce or jednání can reach, labelled from the copy', () => {
    expect(Object.keys(FUTURE_LOOK).sort()).toEqual([...FUTURE_STATES].sort());
    for (const [state, look] of Object.entries(FUTURE_LOOK)) {
      expect(look.label).toBe(cs.future.state[state as FutureState]);
    }
  });

  it('take their labels from the copy', () => {
    const labels = [
      ...Object.values(ACCESS_LOOK),
      ...Object.values(ROLE_LOOK),
      ...Object.values(ACCOUNT_LOOK),
      ...Object.values(ISSUE_LOOK),
      STUDENT_LOOK,
    ].map((look) => look.label);
    const copy = [
      ...Object.values(cs.status.access),
      ...Object.values(cs.status.role),
      ...Object.values(cs.status.account),
      ...Object.values(cs.status.issue),
      cs.status.student,
    ];
    expect(labels).toEqual(copy);
  });

  it.each([
    ['access pending', ACCESS_LOOK.pending, 'waiting'],
    ['access approved', ACCESS_LOOK.approved, 'done'],
    ['access rejected', ACCESS_LOOK.rejected, 'stopped'],
    ['access blocked', ACCESS_LOOK.blocked, 'stopped'],
    ['access cancelled', ACCESS_LOOK.cancelled, 'neutral'],
    ['role headmaster', ROLE_LOOK.headmaster, 'neutral'],
    ['account active', ACCOUNT_LOOK.active, 'done'],
    ['account blocked', ACCOUNT_LOOK.blocked, 'stopped'],
    ['account deactivated', ACCOUNT_LOOK.deactivated, 'neutral'],
    ['issue open', ISSUE_LOOK.open, 'waiting'],
    ['issue skipped', ISSUE_LOOK.skipped, 'stopped'],
    ['issue generated', ISSUE_LOOK.generated, 'done'],
    ['point draft', POINT_LOOK.draft, 'neutral'],
    ['point submitted', POINT_LOOK.submitted, 'waiting'],
    ['point returned', POINT_LOOK.returned, 'attention'],
    ['point approved', POINT_LOOK.approved, 'done'],
    ['point rejected', POINT_LOOK.rejected, 'stopped'],
    ['point withdrawn', POINT_LOOK.withdrawn, 'neutral'],
    ['point published', POINT_LOOK.published, 'done'],
    ['future draft', FUTURE_LOOK.draft, 'neutral'],
    ['future submitted', FUTURE_LOOK.submitted, 'waiting'],
    ['future returned', FUTURE_LOOK.returned, 'attention'],
    ['future approved', FUTURE_LOOK.approved, 'done'],
    ['future rejected', FUTURE_LOOK.rejected, 'stopped'],
    ['future withdrawn', FUTURE_LOOK.withdrawn, 'neutral'],
    ['future cancelled', FUTURE_LOOK.cancelled, 'neutral'],
    ['student', STUDENT_LOOK, 'neutral'],
  ] as const)('%s has the tone %s', (_name, look, tone) => {
    expect(look.tone).toBe(tone);
  });

  it('shows a standing as the state of the request behind it', () => {
    expect(STANDING_LOOK).toEqual({
      pending: ACCESS_LOOK.pending,
      cooldown: ACCESS_LOOK.rejected,
      blocked: ACCESS_LOOK.blocked,
    });
  });

  it('never uses the attention tone', () => {
    const all = [
      ...Object.values(ACCESS_LOOK),
      ...Object.values(ROLE_LOOK),
      ...Object.values(ACCOUNT_LOOK),
      ...Object.values(ISSUE_LOOK),
      STUDENT_LOOK,
    ];
    expect(all.filter((look) => look.tone === 'attention')).toEqual([]);
  });
});

describe('Chip', () => {
  it('renders the label with its icon and no inline style', () => {
    const html = renderToStaticMarkup(<Chip look={ACCESS_LOOK.approved} />);
    expect(html).toContain('<svg');
    expect(html).toContain(`</svg>${cs.status.access.approved}</span>`);
    expect(html).not.toContain('style=');
  });
});
