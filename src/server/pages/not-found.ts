import type { PipelineFailure, Result } from '@/application/core';

/**
 * A page's answer from a use case: the value, or null where the page answers
 * 404 (a refusal: forbidden, unknown or malformed). Anything else is a fault.
 */
export function orNotFound<T>(name: string, result: Result<T, PipelineFailure>): T | null {
  if (result.ok) return result.value;
  const { code } = result.error;
  if (code === 'forbidden' || code === 'not-found' || code === 'invalid-input') return null;
  throw new Error(`${name}: ${code}`);
}
