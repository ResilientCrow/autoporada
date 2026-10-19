import { defineSystemUseCase, ok } from '@/application/core';
import { recordRejectionInput, recordRejectionOutput } from '@/contracts';

import { rejectedEvent } from './events';

/**
 * Audits a sign-in whose verified claims the app refused (another tenant, a
 * guest, a missing claim), in a transaction of its own. Protocol failures
 * anyone can trigger are only logged, so the log cannot be flooded.
 */
export const recordRejection = defineSystemUseCase({
  name: 'auth.recordRejection',
  reasons: ['auth.callback'],
  mode: 'write',
  input: recordRejectionInput,
  output: recordRejectionOutput,
  async execute({ tx }, input) {
    await tx.audit.record(
      rejectedEvent(input.userId, {
        reason: input.reason,
        claim: input.claim,
        signals: [...input.signals],
        purpose: input.purpose,
      }),
    );
    return ok({});
  },
});
