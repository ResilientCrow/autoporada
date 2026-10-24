import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ROLES, USER_STATUSES } from '@/domain/actor';
import { ACCESS_MACHINE, type AccessState } from '@/domain/review';
import { cs } from '@/ui/copy';

import { ACCESS_LOOK, ACCOUNT_LOOK, Chip, ROLE_LOOK, STUDENT_LOOK } from './index';

const ACCESS_STATES: readonly AccessState[] = [
  ...new Set(Object.values(ACCESS_MACHINE).flatMap((t) => [...t.from, t.to])),
];

describe('status looks', () => {
  it('cover every access state, role and account status, and nothing else', () => {
    expect(Object.keys(ACCESS_LOOK).sort()).toEqual([...ACCESS_STATES].sort());
    expect(Object.keys(ROLE_LOOK).sort()).toEqual([...ROLES].sort());
    expect(Object.keys(ACCOUNT_LOOK).sort()).toEqual([...USER_STATUSES].sort());
  });

  it('take their labels from the copy', () => {
    const labels = [
      ...Object.values(ACCESS_LOOK),
      ...Object.values(ROLE_LOOK),
      ...Object.values(ACCOUNT_LOOK),
      STUDENT_LOOK,
    ].map((look) => look.label);
    const copy = [
      ...Object.values(cs.status.access),
      ...Object.values(cs.status.role),
      ...Object.values(cs.status.account),
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
    ['student', STUDENT_LOOK, 'neutral'],
  ] as const)('%s has the tone %s', (_name, look, tone) => {
    expect(look.tone).toBe(tone);
  });

  it('never uses the attention tone', () => {
    const all = [
      ...Object.values(ACCESS_LOOK),
      ...Object.values(ROLE_LOOK),
      ...Object.values(ACCOUNT_LOOK),
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
