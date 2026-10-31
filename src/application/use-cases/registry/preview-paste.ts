import { defineUseCase, fail, ok } from '@/application/core';
import { previewPasteInput, previewPasteOutput } from '@/contracts';
import { parsePaste, PASTE_LIMITS } from '@/domain/registry';

/**
 * Reads a pasted class list and says what it would add, so the headmaster ticks the rows before
 * anything is stored (ADR 0033). A read: the text is parsed here and goes no further, never into
 * a log, an audit event or the database. A row equal to a name already on the list, or to an
 * earlier row, is a `duplicate`. More than 200 names is refused as invalid input.
 */
export const previewPaste = defineUseCase({
  name: 'registry.previewPaste',
  mode: 'read',
  input: previewPasteInput,
  output: previewPasteOutput,
  access: { kind: 'gate', check: () => ({ action: 'registry.edit' }) },
  async execute({ tx }, input) {
    const list = await tx.registry.list(input.listId);
    if (!list) return fail({ code: 'not-found' });
    const rows = parsePaste(input.text, input.order, await tx.registry.entries(list.id));
    if (rows.length > PASTE_LIMITS.rows) {
      return fail({ code: 'invalid-input', fields: { text: 'too-long' } });
    }
    return ok({ rows });
  },
});
