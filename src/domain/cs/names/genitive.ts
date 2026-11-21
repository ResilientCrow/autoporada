import { declineToken, lowest, type Confidence, type DeclinedToken } from './decline';
import { PARTICLES } from './exceptions';
import { headedName, type PersonHead } from './heads';
import { SALUTATION, type PersonName, type Salutation } from './person';
import { isTitleAfter, isTitleBefore } from './titles';

export interface GenitiveSuggestion {
  /** „pana Jana Nováka“ */
  readonly text: string;
  readonly confidence: Confidence;
  /** True when a person should look at the suggestion before it is used. */
  readonly needsCheck: boolean;
  readonly tokens: readonly DeclinedToken[];
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Suggests the 2nd case for „vyjádření pana Johna Doe (1.A)“. A function and its complement go
 * before the salutation: „zástupkyně pro majetek paní Jany Novákové“; a profesor or a ředitel
 * after it: „pana profesora Jana Nováka“ (ADR 0072, 0073). A stored
 * correction for this person (`override`) always wins. Words the rules are
 * unsure about keep their 1st case and the suggestion is flagged.
 */
export function suggestGenitive(
  person: PersonName & { readonly head?: PersonHead; readonly complement?: string },
  override?: string,
): GenitiveSuggestion {
  if (override?.trim()) {
    return { text: override.trim(), confidence: 'manual', needsCheck: false, tokens: [] };
  }
  const { sex } = SALUTATION[person.salutation];
  const given = words(person.givenName).map((w, i) =>
    declineToken(w, sex, 'given', { mayBeParticle: i > 0 }),
  );
  const family = words(person.familyName).map((w) => declineToken(w, sex, 'family'));
  const tokens = [...given, ...family];
  const full = tokens.map((t) => t.form).join(' ');
  const text = headedName(person, full, 'genitive');
  const confidence = lowest(tokens.map((t) => t.confidence));
  return { text, confidence, needsCheck: confidence === 'medium' || confidence === 'low', tokens };
}

/**
 * Best-effort split of a typed full name, for people not found in the school
 * directory (which provides given name and surname separately). Degrees are
 * recognised and dropped: the school uses none (ADR 0076).
 */
export function splitFullName(raw: string, salutation: Salutation): PersonName {
  const [beforeComma = ''] = raw.split(',');
  const all = words(beforeComma);
  // „Mgr. et Mgr. Jana“: degrees, joined by „et“.
  let dropped = 0;
  while (all.length > 1) {
    const [word = '', next = ''] = all;
    if (isTitleBefore(word) || (word === 'et' && dropped > 0 && isTitleBefore(next))) {
      dropped++;
      all.shift();
    } else break;
  }
  // „Petr Dvořák Ph.D.“ typed without the comma.
  while (all.length > 1 && isTitleAfter(all[all.length - 1] ?? '')) all.pop();
  const particle = all.findIndex((w, i) => i > 0 && PARTICLES.has(w.toLowerCase()));
  // A lone word is a surname: „pan Novák“.
  const familyStart = particle > 0 ? particle : Math.max(all.length - 1, 0);
  return {
    salutation,
    givenName: all.slice(0, familyStart).join(' '),
    familyName: all.slice(familyStart).join(' '),
  };
}
