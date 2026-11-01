import type { PipelineFailure, Result } from '@/application/core';

import { pageFailureOf } from './page-failure';

/** The answers of a use case that a page reads as „not found“ rather than a fault. */
export const isRefusal = (code: PipelineFailure['code']): boolean =>
  code === 'forbidden' || code === 'not-found' || code === 'invalid-input';

/**
 * A page's answer from a use case: the value, or null where the page answers
 * 404 (a refusal: forbidden, unknown or malformed). Anything else is a fault:
 * a `PageFailure`, a timeout where the rows were busy and a bug otherwise
 * (ADR 0044).
 */
export function orNotFound<T>(name: string, result: Result<T, PipelineFailure>): T | null {
  if (result.ok) return result.value;
  const { code } = result.error;
  if (isRefusal(code)) return null;
  throw pageFailureOf(`${name}: ${code}`, code);
}
