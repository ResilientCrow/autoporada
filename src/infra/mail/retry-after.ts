/** When Graph throttles without a usable Retry-After. */
const DEFAULT_MS = 30_000;
const MIN_MS = 1_000;
/** The longest honoured wait; the worker's hold (HOLD_MS) is as long. */
const MAX_MS = 900_000;

const DELAY_SECONDS = /^\d+$/;
/** RFC 9110 IMF-fixdate, e.g. `Sat, 24 Oct 2026 08:00:07 GMT`. */
const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * How long to wait before the next send: whole seconds, or an HTTP-date
 * against `now`; clamped to 1 s – 15 min, and 30 s when missing or garbage.
 */
export function retryAfterMs(header: string | null, now: Date): number {
  const value = header?.trim() ?? '';
  let ms: number;
  if (DELAY_SECONDS.test(value)) ms = Number(value) * 1000;
  else if (HTTP_DATE.test(value) && !Number.isNaN(Date.parse(value))) {
    ms = Date.parse(value) - now.getTime();
  } else return DEFAULT_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, ms));
}
