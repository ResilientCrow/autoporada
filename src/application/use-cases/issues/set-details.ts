import { defineUseCase } from '@/application/core';
import { issueDetailsInput, issueTextsWriteOutput } from '@/contracts';

import { editTexts } from './texts-flow';

/**
 * „Údaje“: who was present and who the guests were. Both texts are stored as sent; an empty one is a
 * cleared text, which later poradas carry as cleared (D8). Until the first save both are derived from
 * the latest earlier porada. The meeting date is not set here. The audit event names the fields.
 */
export const setIssueDetails = defineUseCase({
  name: 'issues.setDetails',
  mode: 'write',
  input: issueDetailsInput,
  output: issueTextsWriteOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    return editTexts(
      { tx, now },
      {
        monday: input.monday,
        expectedVersion: input.expectedVersion,
        texts: { present: input.present, guests: input.guests },
        event: 'issue.details_saved',
        meta: { fields: ['present', 'guests'] },
      },
    );
  },
});
