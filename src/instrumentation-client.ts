/**
 * Runs in the browser before React hydrates (ADR 0023). Zod probes
 * `new Function('')` when it builds an object schema; the page's policy has no
 * 'unsafe-eval', so the browser reports that caught throw as a violation, and
 * the e2e guard fails on any. Switched off here, every schema the browser
 * builds (a contract that reads a route's answer) skips the probe, whatever
 * module builds it first. The server keeps its fast path.
 *
 * In development it also clamps a negative measure end (ADR 0050).
 */
import { config } from 'zod/v4/core';

config({ jitless: true });

/**
 * React's Server Components track places the server's times on the page's
 * clock. The server's clock stops while the machine sleeps, so after a suspend
 * a running `pnpm dev` is hours behind and those times fall below zero. React
 * clamps the start of an errored or aborted component's entry but not its end,
 * and `performance.measure` throws on a negative end: the dev overlay then
 * shows that TypeError in place of the redirect or error behind it. This ends
 * such an entry at zero, as React does with the start.
 */
export function clampMeasureEnd(perf: Pick<Performance, 'measure'>): void {
  const measure = perf.measure.bind(perf);
  perf.measure = (name, startOrOptions, endMark) =>
    typeof startOrOptions === 'object' &&
    typeof startOrOptions.end === 'number' &&
    startOrOptions.end < 0
      ? measure(name, { ...startOrOptions, end: 0 })
      : measure(name, startOrOptions, endMark);
}

if (process.env.NODE_ENV === 'development') clampMeasureEnd(performance);
