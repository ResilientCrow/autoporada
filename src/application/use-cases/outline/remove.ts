import { defineUseCase, ok } from '@/application/core';
import { outlineRemoveInput, outlineWriteOutput } from '@/contracts';
import { removeItem, SECTIONS } from '@/domain/outline';

import { editOutline } from './flow';

/**
 * The headmaster removes an item he added. A slot the document makes itself (`slot-fixed`) and a
 * proposal (`proposal-fixed`) stay; an unknown item is `item-missing`.
 */
export const removeOutlineItem = defineUseCase({
  name: 'outline.remove',
  mode: 'write',
  input: outlineRemoveInput,
  output: outlineWriteOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    const done = await editOutline(
      { tx, now },
      {
        monday: input.monday,
        expectedVersion: input.expectedVersion,
        apply: (outline) => removeItem(outline, input.lineageId),
        event: 'outline.removed',
        meta: (before, after) => {
          const section = SECTIONS.find((s) =>
            before[s].some((row) => row.lineageId === input.lineageId),
          );
          return {
            monday: input.monday,
            lineageId: input.lineageId,
            ...(section && { section, rows: after[section].length }),
          };
        },
      },
    );
    return done.ok ? ok({ version: done.value.version, lineageId: input.lineageId }) : done;
  },
});
