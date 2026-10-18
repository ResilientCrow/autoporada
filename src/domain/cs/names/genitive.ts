import { declineToken, lowest, type Confidence, type DeclinedToken } from './decline';
import { PARTICLES } from './exceptions';
import { SALUTATION, type PersonName, type Salutation } from './person';
import { isTitleAfter, isTitleBefore } from './titles';

export interface GenitiveSuggestion {
  /** „pana Mgr. Jana Nováka, Ph.D.“ */
  readonly text: string;
  readonly confidence: Confidence;
  /** True when a person should look at the suggestion before it is used. */
  readonly needsCheck: boolean;
  readonly tokens: readonly DeclinedToken[];
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Suggests the 2nd case for „vyjádření pana Johna Doe (1.A)“. A stored
 * correction for this person (`override`) always wins. Words the rules are
 * unsure about keep their 1st case and the suggestion is flagged.
 */
export function suggestGenitive(person: PersonName, override?: string): GenitiveSuggestion {
  if (override?.trim()) {
    return { text: override.trim(), confidence: 'manual', needsCheck: false, tokens: [] };
  }
  const { sex, genitive } = SALUTATION[person.salutation];
  const given = words(person.givenName).map((w, i) =>
    declineToken(w, sex, 'given', { mayBeParticle: i > 0 }),
  );
  const family = words(person.familyName).map((w) => declineToken(w, sex, 'family'));
  const tokens = [...given, ...family];
  const name = [person.titlesBefore?.trim(), ...tokens.map((t) => t.form)]
    .filter(Boolean)
    .join(' ');
  const text = `${genitive} ${name}${person.titlesAfter?.trim() ? `, ${person.titlesAfter.trim()}` : ''}`;
  const confidence = lowest(tokens.map((t) => t.confidence));
  return { text, confidence, needsCheck: confidence === 'medium' || confidence === 'low', tokens };
}

/**
 * Best-effort split of a typed full name, for people not found in the school
 * directory (which provides given name and surname separately).
 */
export function splitFullName(raw: string, salutation: Salutation): PersonName {
  const [beforeComma = '', ...afterComma] = raw.split(',');
  const all = words(beforeComma);
  // „Mgr. et Mgr. Jana“: titles, joined by „et“.
  const titles: string[] = [];
  while (all.length > 1) {
    const [word = '', next = ''] = all;
    if (isTitleBefore(word) || (word === 'et' && titles.length > 0 && isTitleBefore(next))) {
      titles.push(word);
      all.shift();
    } else break;
  }
  // „Petr Dvořák Ph.D.“ typed without the comma.
  const trailing: string[] = [];
  while (all.length > 1 && isTitleAfter(all[all.length - 1] ?? ''))
    trailing.unshift(all.pop() ?? '');
  const titlesAfter = [...trailing, afterComma.join(',').trim()].filter(Boolean).join(', ');
  const particle = all.findIndex((w, i) => i > 0 && PARTICLES.has(w.toLowerCase()));
  // A lone word is a surname: „pan Novák“.
  const familyStart = particle > 0 ? particle : Math.max(all.length - 1, 0);
  return {
    salutation,
    ...(titles.length > 0 && { titlesBefore: titles.join(' ') }),
    givenName: all.slice(0, familyStart).join(' '),
    familyName: all.slice(familyStart).join(' '),
    ...(titlesAfter && { titlesAfter }),
  };
}
