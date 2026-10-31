import { defineUseCase, ok } from '@/application/core';
import { outlineMoveInput, outlineWriteOutput } from '@/contracts';
import { moveItem, SECTIONS } from '@/domain/outline';

import { editOutline } from './flow';

/**
 * The headmaster moves an item one place up or down inside its section. At the edge nothing
 * changes. Moving a newly approved proposal places it, so it is stored from then on.
 */
export const moveOutlineItem = defineUseCase({
  name: 'outline.move',
  mode: 'write',
  input: outlineMoveInput,
  output: outlineWriteOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    const done = await editOutline(
      { tx, now },
      {
        monday: input.monday,
        expectedVersion: input.expectedVersion,
        apply: (outline) => moveItem(outline, input.lineageId, input.direction),
        event: 'outline.moved',
        meta: (_before, after) => {
          const section = SECTIONS.find((s) =>
            after[s].some((row) => row.lineageId === input.lineageId),
          );
          return {
            monday: input.monday,
            lineageId: input.lineageId,
            direction: input.direction,
            ...(section && {
              section,
              position: after[section].findIndex((row) => row.lineageId === input.lineageId),
            }),
          };
        },
      },
    );
    return done.ok ? ok({ version: done.value.version, lineageId: input.lineageId }) : done;
  },
});
