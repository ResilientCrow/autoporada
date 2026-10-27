import { SALUTATION, SALUTATIONS, type Salutation } from '@/domain/cs';
import { people } from '@/ui/copy';

/** The select's value for no salutation. */
export const NO_SALUTATION = '';

/** The choices of a salutation select: none first, then the three salutations. */
export const SALUTATION_OPTIONS = [
  { value: NO_SALUTATION, label: people.chips.editor.none },
  ...SALUTATIONS.map((value) => ({ value, label: SALUTATION[value].label })),
];

/** What a salutation select's value stands for; the empty choice is none. */
export const salutationOf = (value: string): Salutation | null =>
  SALUTATIONS.find((s) => s === value) ?? null;
