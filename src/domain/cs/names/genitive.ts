import { declineToken, lowest, type Confidence, type DeclinedToken } from './decline';
import { PARTICLES } from './exceptions';
import { SALUTATION, type PersonName, type Salutation } from './person';

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
  const given = words(person.givenName).map((w) => declineToken(w, sex, 'given'));
  const family = words(person.familyName).map((w) => declineToken(w, sex, 'family'));
  const tokens = [...given, ...family];
  const name = [person.titlesBefore?.trim(), ...tokens.map((t) => t.form)]
    .filter(Boolean)
    .join(' ');
  const text = `${genitive} ${name}${person.titlesAfter?.trim() ? `, ${person.titlesAfter.trim()}` : ''}`;
  const confidence = lowest(tokens.map((t) => t.confidence));
  return { text, confidence, needsCheck: confidence === 'medium' || confidence === 'low', tokens };
}

const TITLE_BEFORE =
  /^(Bc|BcA|Mgr|MgA|Ing|arch|MUDr|MDDr|MVDr|PhDr|RNDr|PaedDr|PharmDr|JUDr|ThDr|ThLic|doc|prof|Doc|Prof)\.$/;

/**
 * Best-effort split of a typed full name, for people not found in the school
 * directory (which provides given name and surname separately).
 */
export function splitFullName(raw: string, salutation: Salutation): PersonName {
  const [beforeComma = '', ...afterComma] = raw.split(',');
  const titlesAfter = afterComma.join(',').trim();
  const all = words(beforeComma);
  const titles: string[] = [];
  while (all.length > 1 && TITLE_BEFORE.test(all[0] ?? '')) titles.push(all.shift() ?? '');
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
