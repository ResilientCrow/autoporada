import { defineUseCase, ok } from '@/application/core';
import { outlineAddInput, outlineWriteOutput } from '@/contracts';
import { addItem, SECTIONS } from '@/domain/outline';
import { emptyRichDoc } from '@/domain/richtext';

import { editOutline } from './flow';

/**
 * The headmaster adds an item to POKYNY or HOSPODAŘENÍ, at the end of the section: a standing item
 * carries to the next porada, a one-off does not. The form makes the item's id, so an add that
 * was sent twice (a retry) leaves one item. A full section is `outline-full`. The first write
 * of a porada also stores the outline it was derived from.
 */
export const addOutlineItem = defineUseCase({
  name: 'outline.add',
  mode: 'write',
  input: outlineAddInput,
  output: outlineWriteOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.edit' }) },
  async execute({ tx, now }, input) {
    const done = await editOutline(
      { tx, now },
      {
        monday: input.monday,
        expectedVersion: input.expectedVersion,
        apply: (outline) =>
          SECTIONS.some((s) => outline[s].some((row) => row.lineageId === input.lineageId))
            ? { ok: true, outline }
            : addItem(outline, input.section, {
                lineageId: input.lineageId,
                title: input.title,
                persistence: input.persistence,
                body: input.body ?? emptyRichDoc(),
              }),
        event: 'outline.added',
        meta: (_before, after) => ({
          monday: input.monday,
          lineageId: input.lineageId,
          section: input.section,
          persistence: input.persistence,
          rows: after[input.section].length,
        }),
      },
    );
    return done.ok ? ok({ version: done.value.version, lineageId: input.lineageId }) : done;
  },
});
