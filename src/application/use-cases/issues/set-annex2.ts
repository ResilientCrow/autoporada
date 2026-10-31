import { defineUseCase } from '@/application/core';
import { issueAnnex2Input, issueTextsWriteOutput } from '@/contracts';
import { isRichDocEmpty } from '@/domain/richtext';

import { editTexts } from './texts-flow';

/**
 * „Příloha 2“: the text of the second annex. Until the first save it is carried from the latest
 * earlier porada that has one (D8). „Odebrat přílohu“ sends an empty document, which is stored as
 * such: the porada has no Příloha 2 and later poradas carry that.
 */
export const setIssueAnnex2 = defineUseCase({
  name: 'issues.setAnnex2',
  mode: 'write',
  input: issueAnnex2Input,
  output: issueTextsWriteOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    return editTexts(
      { tx, now },
      {
        monday: input.monday,
        expectedVersion: input.expectedVersion,
        texts: { annex2: input.body },
        event: 'issue.annex2_saved',
        meta: { monday: input.monday, removed: isRichDocEmpty(input.body) },
      },
    );
  },
});
