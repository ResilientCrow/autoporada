import { describe, expect, it } from 'vitest';

import { JOB_TX_TIMEOUT_MS } from '@/application/ports';

import {
  CALL_MS,
  executionBudgetMs,
  HOLD_MS,
  STOP_GRACE_PERIOD_MS,
  STOP_TIMEOUT_MS,
} from './index';

const SECOND = 1_000;

describe('worker timing (production values)', () => {
  it('bounds a claim and a settle at 5 s and one call at 30 s', () => {
    expect(JOB_TX_TIMEOUT_MS).toBe(5 * SECOND);
    expect(CALL_MS).toBe(30 * SECOND);
  });

  it('holds at most the Retry-After clamp of 15 minutes', () => {
    expect(HOLD_MS).toBe(900 * SECOND);
  });

  it('starts nothing later than one call and a margin before mail.send expires', () => {
    expect(executionBudgetMs('mail.send')).toBe(1_140 * SECOND);
  });

  it('fits one full hold after a claim, so a single wait never burns a retry', () => {
    expect(JOB_TX_TIMEOUT_MS + HOLD_MS).toBeLessThan(executionBudgetMs('mail.send'));
  });

  it('lets a call in flight finish inside the stop timeout, and that inside the grace period', () => {
    expect(CALL_MS).toBeLessThan(STOP_TIMEOUT_MS);
    expect(STOP_TIMEOUT_MS).toBeLessThan(STOP_GRACE_PERIOD_MS);
    expect(STOP_GRACE_PERIOD_MS).toBeGreaterThanOrEqual(45 * SECOND);
  });
});
