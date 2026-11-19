/**
 * Who a person is at the school (ADR 0072 item 2). A tier grants no rights:
 * only the role does. Empty until the headmaster sets it.
 */
export type Tier = 'reditel' | 'vedeni' | 'ucitel' | 'zamestnanec' | 'student' | 'absolvent';

export const TIERS: readonly Tier[] = [
  'reditel',
  'vedeni',
  'ucitel',
  'zamestnanec',
  'student',
  'absolvent',
];

/** A student or an absolvent: at most a submitter, and never sees the registry or archive. */
export function isStudentTier(tier: Tier | null): boolean {
  return tier === 'student' || tier === 'absolvent';
}

/**
 * What a person holds besides the tier (ADR 0072 item 4): the head is a fixed list in code, the
 * complement free text. Like the tier, a function grants no rights.
 */
export type FunctionHead = 'statutarni-zastupce' | 'zastupce' | 'vedouci' | 'clen';

/** Every head once, the highest first: the order that decides which function prints. */
export const FUNCTION_HEADS: readonly FunctionHead[] = [
  'statutarni-zastupce',
  'zastupce',
  'vedouci',
  'clen',
];

/** One function: „zástupce“ + „pro pedagogickou činnost“, „člen“ + „PR oddělení“. */
export interface UserFunction {
  readonly head: FunctionHead;
  /** Printed after the head, never declined: one line of free text, or none. */
  readonly complement: string | null;
}

/** The most functions one person holds. */
export const FUNCTIONS_MAX = 5;

/**
 * The function that prints: the highest head, and of two with the same head the one added first
 * (ADR 0072 item 5). None for no functions.
 */
export function highestFunction(list: readonly UserFunction[]): UserFunction | null {
  let best: UserFunction | null = null;
  for (const f of list) {
    if (best === null || FUNCTION_HEADS.indexOf(f.head) < FUNCTION_HEADS.indexOf(best.head))
      best = f;
  }
  return best;
}
