'use server';

import {
  addOutlineItem as addOutlineItemUseCase,
  moveOutlineItem as moveOutlineItemUseCase,
  removeOutlineItem as removeOutlineItemUseCase,
  saveOutlineItem as saveOutlineItemUseCase,
} from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/** „Přidat bod“ in Pokyny a hospodaření; the form makes the item's id, so a retry adds it once. */
export const addOutlineItem = defineAction(addOutlineItemUseCase, { rateLimit: 'admin' });
/** „Uložit“ of an item. These are no autosave: the editor saves on the button. */
export const saveOutlineItem = defineAction(saveOutlineItemUseCase, { rateLimit: 'admin' });
/** The ↑↓ buttons of an item. */
export const moveOutlineItem = defineAction(moveOutlineItemUseCase, { rateLimit: 'admin' });
/** „Odebrat“ on an item the headmaster added. */
export const removeOutlineItem = defineAction(removeOutlineItemUseCase, { rateLimit: 'admin' });
