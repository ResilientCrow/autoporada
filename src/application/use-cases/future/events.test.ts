import { describe, expect, it } from 'vitest';

import type { FutureItemRecord } from '@/application/ports';
import type { Actor, Role } from '@/domain/actor';
import { can } from '@/domain/policy';
import type { FutureState } from '@/domain/review';

import { moveCheck } from './events';

const AUTHOR = '00000000-0000-4000-8000-0000000000a1';
const actor = (id: string, role: Role): Actor => ({ id, role, status: 'active', isStudent: false });

const item = (state: FutureState, cancelRequestedAt: Date | null = null): FutureItemRecord => ({
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
    organizer: null,
    participants: null,
    note: null,
  },
  reportState: 'none',
  reportPointId: null,
  submittedAt: new Date(0),
  cancelRequestedAt,
  version: 2,
  updatedAt: new Date(0),
});

// The write scope already hides a colleague's item from every other user; this is the second
// line behind it, and only this test sees it: a check that stopped naming the author would
// let a reviewer or the headmaster make the author's move on the decision path (row 55).
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

const COLLEAGUE = '00000000-0000-4000-8000-0000000000c1';

describe('moveCheck of the decision path', () => {
  it('lets the headmaster, and a reviewer who is not the author, approve a submitted item', () => {
    const check = moveCheck('approve')(item('submitted'));
    expect(can(actor(COLLEAGUE, 'headmaster'), check)).toBe(true);
    expect(can(actor(COLLEAGUE, 'reviewer'), check)).toBe(true);
    expect(can(actor(AUTHOR, 'headmaster'), check)).toBe(true);
    expect(can(actor(AUTHOR, 'reviewer'), check)).toBe(false);
    expect(can(actor(COLLEAGUE, 'submitter'), check)).toBe(false);
    expect(can(actor(AUTHOR, 'submitter'), check)).toBe(false);
  });

  it.each(['return', 'reject'] as const)(
    'lets a reviewer, author or not, %s a handed-in item',
    (event) => {
      for (const state of ['submitted', 'approved'] as const) {
        const check = moveCheck(event)(item(state));
        expect(can(actor(COLLEAGUE, 'reviewer'), check)).toBe(true);
        expect(can(actor(AUTHOR, 'reviewer'), check)).toBe(true);
        expect(can(actor(AUTHOR, 'submitter'), check)).toBe(false);
        expect(can(actor(COLLEAGUE, 'submitter'), check)).toBe(false);
      }
      expect(can(actor(COLLEAGUE, 'reviewer'), moveCheck(event)(item('draft')))).toBe(false);
    },
  );

  it('lets only the vedení cancel an approved akce, a pending request or not (ADR 0062)', () => {
    for (const pending of [null, new Date(0)]) {
      const check = moveCheck('cancel')(item('approved', pending));
      expect(can(actor(COLLEAGUE, 'reviewer'), check)).toBe(true);
      expect(can(actor(AUTHOR, 'headmaster'), check)).toBe(true);
      expect(can(actor(AUTHOR, 'submitter'), check)).toBe(false);
      expect(can(actor(COLLEAGUE, 'submitter'), check)).toBe(false);
    }
    for (const state of ['draft', 'submitted', 'returned', 'cancelled'] as const) {
      expect(can(actor(AUTHOR, 'headmaster'), moveCheck('cancel')(item(state)))).toBe(false);
    }
  });
});

describe('moveCheck of a cancel request (ADR 0062)', () => {
  const asked = item('approved', new Date(0));
  const approved = item('approved');

  it('lets the author ask while none waits, and take it back while one does', () => {
    const author = actor(AUTHOR, 'submitter');
    expect(can(author, moveCheck('request-cancel')(approved))).toBe(true);
    expect(can(author, moveCheck('request-cancel')(asked))).toBe(false);
    expect(can(author, moveCheck('retract-cancel')(asked))).toBe(true);
    expect(can(author, moveCheck('retract-cancel')(approved))).toBe(false);
    expect(can(author, moveCheck('revise')(asked))).toBe(false);
    expect(can(actor(COLLEAGUE, 'submitter'), moveCheck('request-cancel')(approved))).toBe(false);
  });

  it('lets the vedení refuse only a waiting request', () => {
    expect(can(actor(COLLEAGUE, 'reviewer'), moveCheck('refuse-cancel')(asked))).toBe(true);
    expect(can(actor(COLLEAGUE, 'headmaster'), moveCheck('refuse-cancel')(approved))).toBe(false);
    expect(can(actor(AUTHOR, 'submitter'), moveCheck('refuse-cancel')(asked))).toBe(false);
  });
});
