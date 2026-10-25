import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { JOB_TX_TIMEOUT_MS } from '@/application/ports';

import { CALL_MS, executionBudgetMs, HOLD_MS, STOP_TIMEOUT_MS } from './index';

const SECOND = 1_000;

/** The worker's `stop_grace_period` as deploy/compose.yaml sets it ("50s", "1m30s"). */
function composeGraceMs(): number {
  const text = readFileSync(resolve(process.cwd(), 'deploy/compose.yaml'), 'utf8');
  const matches = [...text.matchAll(/^\s+stop_grace_period:\s*(\S+)\s*$/gm)];
  const value = matches[0]?.[1];
  if (matches.length !== 1 || value === undefined) {
    throw new Error('expected exactly one stop_grace_period in compose.yaml');
  }
  const units: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1_000, ms: 1 };
  return [...value.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)].reduce(
    (sum, [, n = '0', unit = 's']) => sum + Number(n) * (units[unit] ?? 0),
    0,
  );
}

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

  it('lets a call in flight finish inside the stop timeout', () => {
    expect(CALL_MS).toBeLessThan(STOP_TIMEOUT_MS);
  });

  it("gives the stop timeout room inside the worker's stop_grace_period in compose.yaml", () => {
    // Docker SIGKILLs at the grace period; boss.stop must have returned (and the process exited) before.
    expect(composeGraceMs()).toBeGreaterThan(STOP_TIMEOUT_MS);
    expect(composeGraceMs() - STOP_TIMEOUT_MS).toBeGreaterThanOrEqual(10 * SECOND);
  });
});
