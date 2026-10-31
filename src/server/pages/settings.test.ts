import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deadlineChange, issueSlots } from '@/domain/calendar';
import { formatNumericDate } from '@/domain/cs';
import { parseIsoDate, parseWallTime, toIsoDate } from '@/domain/time';

import { settingsPage } from './index';

const resolvePrincipal = vi.hoisted(() => vi.fn<() => Promise<unknown>>(async () => null));
const runRegistered = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../pipeline', async () => ({
  ...(await vi.importActual<object>('../pipeline')),
  runRegistered,
}));
vi.mock('../container', () => ({
  getContainer: () => ({ resolvePrincipal, requestIdFrom: () => 'req-1' }),
}));

const asRole = (role: string) =>
  resolvePrincipal.mockResolvedValue({
    kind: 'user',
    actor: { id: 'u1', role, status: 'active', isStudent: false },
  });

const RULE = { dayOffset: -2, time: '20:00' };
const INTRO = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Úvod' }] }],
};

const SETTINGS = {
  deadline: { value: RULE, version: 3 },
  reminders: { value: { soft: true, hard: false }, version: 2 },
  'texts.annex1': { value: { heading: 'Příloha 1', intro: INTRO }, version: 5 },
};

/** `issues.window` and `settings.read` answered by name, like the pipeline does. */
function answer(window: { submitMonday: string; issues?: unknown[]; rule?: unknown }) {
  runRegistered.mockImplementation(async (_container, useCase: { name: string }) => {
    if (useCase.name === 'settings.read') return { ok: true, value: SETTINGS };
    if (useCase.name === 'issues.window') {
      return {
        ok: true,
        value: { stripFrom: window.submitMonday, issues: [], rule: RULE, ...window },
      };
    }
    throw new Error(`unexpected ${useCase.name}`);
  });
}

beforeEach(() => {
  resolvePrincipal.mockReset();
  resolvePrincipal.mockResolvedValue(null);
  runRegistered.mockReset();
});

describe('settingsPage', () => {
  it('is null for a visitor and for anyone but the headmaster, without asking a use case', async () => {
    expect(await settingsPage()).toBeNull();
    for (const role of ['submitter', 'reviewer']) {
      asRole(role);
      expect(await settingsPage()).toBeNull();
    }
    expect(runRegistered).not.toHaveBeenCalled();
  });

  it('is null where a use case refuses', async () => {
    asRole('headmaster');
    runRegistered.mockResolvedValue({ ok: false, error: { code: 'forbidden' } });
    expect(await settingsPage()).toBeNull();
  });

  it('carries each setting with its version', async () => {
    asRole('headmaster');
    answer({ submitMonday: '2026-11-09' });
    const page = await settingsPage();
    expect(page?.deadline).toEqual({ rule: RULE, version: 3 });
    expect(page?.reminders).toEqual({ value: { soft: true, hard: false }, version: 2 });
    expect(page?.annex1.version).toBe(5);
    expect(page?.annex1.value.heading).toBe('Příloha 1');
  });

  it('names the shown porada, the deadline it stays at and the porada the new rule starts at', async () => {
    asRole('headmaster');
    answer({ submitMonday: '2026-11-09' });
    expect((await settingsPage())?.effect).toEqual({
      keep: '9. 11. 2026',
      day: 'sobota',
      time: '20.00',
      from: '16. 11. 2026',
    });
  });

  it('takes the deadline frozen on the porada row over the rule', async () => {
    asRole('headmaster');
    answer({
      submitMonday: '2026-11-09',
      issues: [
        {
          monday: '2026-11-09',
          meetingDate: '2026-11-09',
          // Friday 6 Nov 2026, 18:30 Prague (CET).
          deadlineAt: '2026-11-06T17:30:00.000Z',
          status: 'open',
          version: 2,
        },
      ],
    });
    const { effect } = (await settingsPage())!;
    expect([effect.day, effect.time]).toEqual(['pátek', '18.30']);
  });

  it('labels a moved porada by its meeting date, not by its Monday', async () => {
    asRole('headmaster');
    answer({
      submitMonday: '2026-11-09',
      issues: [
        {
          monday: '2026-11-09',
          meetingDate: '2026-11-11',
          deadlineAt: '2026-11-06T17:30:00.000Z',
          status: 'open',
          version: 2,
        },
      ],
    });
    const { effect } = (await settingsPage())!;
    expect(effect.keep).toBe('11. 11. 2026');
    expect(effect.from).toBe('16. 11. 2026');
  });

  it('agrees with deadlineChange on the porada kept and the one the rule starts at', async () => {
    asRole('headmaster');
    const old = { dayOffset: -2, time: parseWallTime('20:00') };
    const next = { dayOffset: -3, time: parseWallTime('18:00') };
    // Saturday 31 Oct 2026, 21:00 Prague: the deadline of Monday 2 Nov has passed.
    const now = new Date('2026-10-31T20:00:00.000Z');
    const slots = issueSlots([], parseIsoDate('2026-10-31'), old);
    const change = deadlineChange(now, old, next, slots)!;
    answer({ submitMonday: toIsoDate(change.keep) });
    const { effect } = (await settingsPage())!;
    expect(effect.keep).toBe(formatNumericDate(change.keep));
    expect(effect.from).toBe(formatNumericDate(change.from));
    expect(change.keep).toEqual(parseIsoDate('2026-11-09'));
  });
});
