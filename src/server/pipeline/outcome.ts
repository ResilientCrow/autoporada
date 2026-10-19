import type { PipelineFailure, Result } from '@/application/core';
import type { ActionResult } from '@/contracts';

import type { Log } from './log';

/** One log line per call: never the input, never personal data. */
export interface CallLine {
  readonly kind: 'action' | 'route';
  readonly name: string;
  readonly reqId: string;
  actorId?: string;
  outcome: string;
}

const WARNINGS: ReadonlySet<string> = new Set(['forbidden', 'rate-limited']);

export function logCall(log: Log, line: CallLine, ms: number): void {
  const fields = { ...line, ms: Math.round(ms) };
  if (WARNINGS.has(line.outcome)) log.warn(fields, line.kind);
  else log.info(fields, line.kind);
}

/** A use case's result as the client sees it. */
export function toActionResult<Out>(result: Result<Out, PipelineFailure>): ActionResult<Out> {
  return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
}
