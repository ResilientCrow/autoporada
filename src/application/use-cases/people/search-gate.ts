import { defineUseCase, ok } from '@/application/core';
import { searchGateInput, searchGateOutput } from '@/contracts';

/**
 * The directory search's gate (design section 4): the route runs it before it
 * calls the directory, outside any transaction, so a pending or deactivated
 * user never reaches the school's directory (F14). It reads and answers nothing.
 */
export const searchGate = defineUseCase({
  name: 'people.searchGate',
  mode: 'read',
  input: searchGateInput,
  output: searchGateOutput,
  access: { kind: 'gate', check: () => ({ action: 'directory.search' }) },
  execute: () => Promise.resolve(ok({})),
});
