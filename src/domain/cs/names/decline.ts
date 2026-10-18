import { MASCULINE_GENITIVE, PARTICLES } from './exceptions';
import type { Sex } from './person';

export type Confidence = 'manual' | 'high' | 'medium' | 'low';

export interface DeclinedToken {
  readonly input: string;
  /** The suggested 2nd case; equals `input` when confidence is low. */
  readonly form: string;
  readonly rule: string;
  readonly confidence: Confidence;
}

/** Drop `drop` characters from the end of the token, then append `add`. */
interface Edit {
  readonly rule: string;
  readonly confidence: Exclude<Confidence, 'manual'>;
  readonly drop: number;
  readonly add: string;
}

type Rule = (lower: string) => Edit | undefined;

const SOFT = 'cčďjňřšťž';
const VOWELS = 'aáeéěiíoóuúůyý';
/** Syllabic l and r count as vowels: Vlček has two syllables. */
const SYLLABLE = /[aáeéěiíoóuúůyýlr]/;
const SOFTEN: Readonly<Record<string, string>> = { d: 'ď', t: 'ť', n: 'ň' };

const keep = (rule: string, confidence: Edit['confidence']): Edit => ({
  rule,
  confidence,
  drop: 0,
  add: '',
});
const edit = (rule: string, confidence: Edit['confidence'], drop: number, add: string): Edit => ({
  rule,
  confidence,
  drop,
  add,
});

const at = (s: string, fromEnd: number) => s[s.length - fromEnd] ?? '';
const syllables = (s: string) => (s.match(new RegExp(SYLLABLE.source, 'g')) ?? []).length;

/** Ordered masculine rules; the first that matches wins. */
const MASCULINE: readonly Rule[] = [
  (w) => (w.endsWith('ý') ? edit('m:ý', 'high', 1, 'ého') : undefined),
  (w) => (w.endsWith('í') ? edit('m:í', 'high', 0, 'ho') : undefined),
  (w) => (w.endsWith('é') ? edit('m:é', 'medium', 0, 'ho') : undefined),
  (w) => (w.endsWith('ů') ? keep('m:ů', 'high') : undefined),
  (w) => {
    // Hájek → Hájka, Zdeněk → Zdeňka, Vlček → Vlčka
    if (!/[eě]k$/.test(w) || syllables(w.slice(0, -2)) === 0) return undefined;
    if (at(w, 2) === 'e') return edit('m:ek', 'high', 2, 'ka');
    const soft = SOFTEN[at(w, 3)];
    return soft ? edit('m:ěk', 'high', 3, `${soft}ka`) : edit('m:ěk?', 'low', 0, '');
  },
  (w) => {
    // Němec → Němce, Moravec → Moravce; Kadlec → Kadlece
    if (!w.endsWith('ec') || w.length < 4) return undefined;
    const beforeConsonant = at(w, 4);
    const elides = !VOWELS.includes(at(w, 3)) && VOWELS.includes(beforeConsonant);
    return elides ? edit('m:ec', 'medium', 2, 'ce') : edit('m:ec+e', 'medium', 0, 'e');
  },
  (w) => (w.endsWith('el') ? edit('m:el', 'medium', 0, 'a') : undefined),
  (w) => (/(aus|auss)$/.test(w) ? edit('m:aus', 'medium', 0, 'e') : undefined),
  (w) => (SOFT.includes(at(w, 1)) || w.endsWith('x') ? edit('m:soft', 'high', 0, 'e') : undefined),
  (w) => (/[uoeia]s$/.test(w) && syllables(w) >= 2 ? keep('m:-us', 'low') : undefined),
  (w) => (/[sz]$/.test(w) ? edit('m:s', 'medium', 0, 'a') : undefined),
  (w) => (/[^aáeéěiíoóuúůyý]$/.test(w) ? edit('m:hard', 'high', 0, 'a') : undefined),
  (w) => (/[ieo]a$/.test(w) ? keep('m:ia', 'low') : undefined),
  (w) =>
    w.endsWith('a') && SOFT.includes(at(w, 2)) ? edit('m:soft-a', 'medium', 1, 'i') : undefined,
  (w) => (w.endsWith('a') ? edit('m:a', 'high', 1, 'y') : undefined),
  (w) => (w.endsWith('á') ? edit('m:á', 'medium', 1, 'y') : undefined),
  (w) => (w.endsWith('o') ? edit('m:o', 'medium', 1, 'a') : undefined),
  (w) => (/[aeou]i$/.test(w) ? keep('m:ei', 'low') : undefined),
  (w) => (/[iy]$/.test(w) ? edit('m:i', 'medium', 0, 'ho') : undefined),
  () => keep('m:other', 'low'),
];

/** Ordered feminine rules. */
const FEMININE: readonly ((w: string, given: boolean) => Edit | undefined)[] = [
  (w) => (w.endsWith('á') ? edit('f:á', 'high', 1, 'é') : undefined),
  (w) => (/(í|e|ie)$/.test(w) ? keep('f:e', 'high') : undefined),
  (w) =>
    /[ďťň]a$/.test(w)
      ? edit('f:ďa', 'high', 2, `${{ ď: 'd', ť: 't', ň: 'n' }[at(w, 2)] ?? ''}i`)
      : undefined,
  (w) =>
    w.endsWith('a') && SOFT.includes(at(w, 2)) ? edit('f:soft-a', 'high', 1, 'i') : undefined,
  (w) => (w.endsWith('ía') ? keep('f:ía', 'low') : undefined),
  // Sofia → Sofie, Andrea → Andrey; foreign surnames (Garcia) are left to a person.
  (w, given) =>
    w.endsWith('ia') ? (given ? edit('f:ia', 'medium', 1, 'e') : keep('f:ia', 'low')) : undefined,
  (w, given) =>
    w.endsWith('ea') ? (given ? edit('f:ea', 'medium', 1, 'y') : keep('f:ea', 'low')) : undefined,
  (w, given) => (w.endsWith('a') ? edit('f:a', given ? 'high' : 'medium', 1, 'y') : undefined),
  () => keep('f:indeclinable', 'high'),
];

function restoreCase(original: string, lower: string): string {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return lower.toUpperCase();
  }
  const first = original[0] ?? '';
  return first === first.toUpperCase() ? (lower[0] ?? '').toUpperCase() + lower.slice(1) : lower;
}

function applyEdit(token: string, e: Edit): string {
  const isCaps = token === token.toUpperCase() && token !== token.toLowerCase();
  const stem = token.slice(0, token.length - e.drop);
  return stem + (isCaps ? e.add.toUpperCase() : e.add);
}

/** The 2nd case of one word of a name. Hyphenated parts are declined one by one. */
export function declineToken(token: string, sex: Sex, role: 'given' | 'family'): DeclinedToken {
  if (token.includes('-')) {
    const parts = token.split('-').map((part) => declineToken(part, sex, role));
    const confidence = lowest(parts.map((p) => p.confidence));
    return {
      input: token,
      form: parts.map((p) => p.form).join('-'),
      rule: 'hyphenated',
      confidence,
    };
  }
  const lower = token.toLowerCase();
  if (PARTICLES.has(lower) || !/\p{L}/u.test(token)) {
    return { input: token, form: token, rule: 'particle', confidence: 'high' };
  }
  if (sex === 'm') {
    const known = MASCULINE_GENITIVE[lower];
    if (known)
      return {
        input: token,
        form: restoreCase(token, known),
        rule: 'm:dictionary',
        confidence: 'high',
      };
  }
  const found =
    sex === 'm'
      ? MASCULINE.map((rule) => rule(lower)).find((e) => e !== undefined)
      : FEMININE.map((rule) => rule(lower, role === 'given')).find((e) => e !== undefined);
  const e = found ?? keep('none', 'low');
  const form = e.confidence === 'low' ? token : applyEdit(token, e);
  return { input: token, form, rule: e.rule, confidence: e.confidence };
}

const RANK: Readonly<Record<Confidence, number>> = { low: 0, medium: 1, high: 2, manual: 3 };

export function lowest(levels: readonly Confidence[]): Confidence {
  return levels.reduce<Confidence>((min, c) => (RANK[c] < RANK[min] ? c : min), 'manual');
}
