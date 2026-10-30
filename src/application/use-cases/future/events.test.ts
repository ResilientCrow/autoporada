import { describe, expect, it } from 'vitest';

import type { FutureItemRecord } from '@/application/ports';
import type { Actor, Role } from '@/domain/actor';
import { can } from '@/domain/policy';
import type { FutureState } from '@/domain/review';

import { moveCheck } from './events';

const AUTHOR = '00000000-0000-4000-8000-0000000000a1';
const actor = (id: string, role: Role): Actor => ({ id, role, status: 'active', isStudent: false });

const item = (state: FutureState): FutureItemRecord => ({
  id: '00000000-0000-4000-8000-0000000000b1',
  kind: 'akce',
  authorId: AUTHOR,
  state,
  content: {
    title: 'Výlet',
    startDate: null,
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
    responsible: null,
    expectsReport: false,
  },
  reportState: 'none',
  reportPointId: null,
  submittedAt: new Date(0),
  version: 2,
  updatedAt: new Date(0),
});

// The write scope already hides a colleague's item from every other user; this is the second
// line behind it, and only this test sees it: a check that stopped naming the author would
// let a reviewer or the headmaster make the author's move once the scope is widened (row 55).
describe('moveCheck', () => {
  it.each([
    ['submit', 'returned'],
    ['submit', 'draft'],
    ['retract', 'submitted'],
    ['revise', 'approved'],
  ] as const)('lets only the author make the %s of a %s item', (event, state) => {
    const check = moveCheck(event)(item(state));
    expect(can(actor(AUTHOR, 'submitter'), check)).toBe(true);
    for (const role of ['submitter', 'reviewer', 'headmaster'] as const) {
      expect(can(actor('00000000-0000-4000-8000-0000000000c1', role), check)).toBe(false);
    }
  });

  it('refuses the author a move the state does not offer', () => {
    expect(can(actor(AUTHOR, 'submitter'), moveCheck('submit')(item('approved')))).toBe(false);
    expect(can(actor(AUTHOR, 'submitter'), moveCheck('retract')(item('returned')))).toBe(false);
  });
});
