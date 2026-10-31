'use server';

import {
  addEntries as addEntriesUseCase,
  moveList as moveListUseCase,
  removeEntry as removeEntryUseCase,
  saveEntry as saveEntryUseCase,
  saveList as saveListUseCase,
} from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/** „Přidat studenta“ and, from the paste preview, „Přidat vybrané“: the rows are validated again. */
export const addEntries = defineAction(addEntriesUseCase, { rateLimit: 'admin' });
/** „Uložit“ of one student, under the version the row read. */
export const saveEntry = defineAction(saveEntryUseCase, { rateLimit: 'admin' });
/** „Odebrat“: a student never printed is deleted, a printed one is kept as removed. */
export const removeEntry = defineAction(removeEntryUseCase, { rateLimit: 'admin' });
/** A new list for point 4, or the title, document label and switch of one. */
export const saveList = defineAction(saveListUseCase, { rateLimit: 'admin' });
/** The ↑↓ buttons of the lists. */
export const moveList = defineAction(moveListUseCase, { rateLimit: 'admin' });
