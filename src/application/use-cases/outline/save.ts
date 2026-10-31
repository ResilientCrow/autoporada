import { defineUseCase, ok } from '@/application/core';
import { outlineSaveInput, outlineWriteOutput } from '@/contracts';
import { saveItem, type ItemPatch } from '@/domain/outline';

import { editOutline } from './flow';

/**
 * The headmaster changes an item's title, text, persistence or (the partners slot only) quotes.
 * A slot cannot become a one-off (`slot-fixed`), a proposal's text is the point's (`proposal-fixed`)
 * and quotes elsewhere are `quotes-not-allowed`. The audit event names the fields, never their text.
 */
export const saveOutlineItem = defineUseCase({
  name: 'outline.save',
  mode: 'write',
  input: outlineSaveInput,
  output: outlineWriteOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    const patch: ItemPatch = {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.body !== undefined && { body: input.body }),
      ...(input.quotes !== undefined && { quotes: input.quotes }),
      ...(input.persistence !== undefined && { persistence: input.persistence }),
    };
    const done = await editOutline(
      { tx, now },
      {
        monday: input.monday,
        expectedVersion: input.expectedVersion,
        apply: (outline) => saveItem(outline, input.lineageId, patch),
        event: 'outline.saved',
        meta: () => ({
          monday: input.monday,
          lineageId: input.lineageId,
          fields: Object.keys(patch),
          ...(input.quotes !== undefined && { quotes: input.quotes.length }),
        }),
      },
    );
    return done.ok ? ok({ version: done.value.version, lineageId: input.lineageId }) : done;
  },
});
