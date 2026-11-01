import type { PipelineFailure } from '@/application/core';
import { failureDigest, type FailureCause } from '@/contracts';

/**
 * A page that could not be read, and why (ADR 0044). Next keeps a digest an error already has,
 * so `error.tsx` reads the cause from it on the client, where the message is replaced in
 * production. The message names the failing call and carries no user data.
 */
export class PageFailure extends Error {
  override readonly name = 'PageFailure';
  readonly digest: string;

  constructor(
    override readonly cause: FailureCause,
    message: string,
  ) {
    super(message);
    this.digest = failureDigest(cause);
  }
}

/** The failure for a use case that answered a fault instead of a page: busy rows time out, the rest are bugs. */
export function pageFailureOf(message: string, code: PipelineFailure['code']): PageFailure {
  return new PageFailure(code === 'busy' ? 'timeout' : 'bug', message);
}
