import type { DraftPerson } from '@/domain/report';
import { personFromCard, userById, yearOf } from './select';
import type { Card, State } from './types';

/** A card in the people picker: the class or job comes from the directory row, else from an earlier report; a salutation the card lacks stays what an earlier report knew. */
export const directoryPerson = (s: State, c: Card, was?: DraftPerson): DraftPerson => {
  const job = userById(s, c.id)?.affiliation; const year = yearOf(s);
  return { ...personFromCard(c, job ? year : (was?.affiliationYear ?? year), job ?? was?.affiliation), salutation: c.salutation ?? was?.salutation ?? null };
};
