import { stripForbiddenCharacters } from '@/domain/richtext';

/** Bounds on what one action may send (next.config caps the body at 512 kB as well). */
export const INPUT_LIMITS = { depth: 32, nodes: 20_000, characters: 512 * 1024 } as const;

/** Keys that could reach an object's prototype once merged. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export type Normalized = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

class Refused extends Error {}

/** One line ending, no forbidden characters, NFC. */
function normalizeText(text: string): string {
  return stripForbiddenCharacters(text.replace(/\r\n?/g, '\n')).normalize('NFC');
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Pipeline step 2 (ADR 0011): only plain JSON-like data gets through, within
 * the size limits, with every string normalised. Anything else (dates,
 * maps, form data, class instances, prototype keys) is refused before the
 * schema sees it.
 */
export function normalizeInput(input: unknown): Normalized {
  const budget = { nodes: 0, characters: 0 };

  const text = (value: string): string => {
    budget.characters += value.length;
    if (budget.characters > INPUT_LIMITS.characters) throw new Refused();
    return normalizeText(value);
  };

  const visit = (value: unknown, depth: number): unknown => {
    if (depth > INPUT_LIMITS.depth || ++budget.nodes > INPUT_LIMITS.nodes) throw new Refused();
    if (value === null || value === undefined || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Refused();
      return value;
    }
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map((item: unknown) => visit(item, depth + 1));
    if (typeof value !== 'object' || !isPlainObject(value)) throw new Refused();
    if (Object.getOwnPropertySymbols(value).length > 0) throw new Refused();
    return Object.fromEntries(
      Object.keys(value).map((key) => {
        if (FORBIDDEN_KEYS.has(key)) throw new Refused();
        text(key);
        return [key, visit(value[key], depth + 1)];
      }),
    );
  };

  try {
    return { ok: true, value: visit(input, 0) };
  } catch (error) {
    if (error instanceof Refused) return { ok: false };
    throw error;
  }
}
