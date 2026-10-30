import type { z } from 'zod';

import type { savePointTypeInput } from '@/contracts';
import { foldForSearch } from '@/domain/cs';
import { POINT_LIMITS } from '@/domain/report';
import { choiceOf, flagOf, textOf } from '@/ui/form';

/** The gender values a type may have; the form offers „neurčeno“ as the empty value. */
export const TITLE_GENDER_VALUES = ['m', 'f', 'n', 'pl', 'npl'] as const;
const BULLET_KINDS = ['people', 'text'] as const;

type Input = z.input<typeof savePointTypeInput>;
type Bullet = Input['defaultBullets'][number];

/**
 * A bullet key from its label: folded, hyphenated, starting with a letter and within the key
 * limit; `-2`, `-3` and so on when `taken` already holds it.
 */
export function bulletKeyFor(label: string, taken: ReadonlySet<string>): string {
  const slug = foldForSearch(label)
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  const head = /^[a-z]/.test(slug) || slug === '' ? slug : `bod-${slug}`;
  const base = head.slice(0, POINT_LIMITS.bulletKey).replace(/-+$/, '') || 'bod';
  for (let n = 2, key = base; ; n += 1) {
    if (!taken.has(key)) return key;
    const suffix = `-${n}`;
    key = `${base.slice(0, POINT_LIMITS.bulletKey - suffix.length).replace(/-+$/, '')}${suffix}`;
  }
}

/** The bullet rows of the form, in order: they are named `defaultBullets.<i>.<field>`. */
function bulletsOf(data: FormData): Bullet[] {
  const rows: number[] = [];
  while (data.has(`defaultBullets.${rows.length}.label`)) rows.push(rows.length);
  const taken = new Set(rows.map((i) => textOf(data, `defaultBullets.${i}.key`)).filter(Boolean));
  return rows.map((i) => {
    const at = (field: string) => `defaultBullets.${i}.${field}`;
    const label = textOf(data, at('label'));
    const kind = choiceOf(data, at('kind'), BULLET_KINDS);
    const key = textOf(data, at('key')) || bulletKeyFor(label, taken);
    taken.add(key);
    return {
      key,
      label,
      kind,
      required: flagOf(data, at('required')),
      ...(kind === 'people' && flagOf(data, at('organisers')) && { role: 'organisers' as const }),
    };
  });
}

/**
 * What „Uložit“ sends: the whole desired type. A type that is `locked` has no „active“ box, so it
 * stays on; an empty position is left to the server (after the last type).
 */
export function typeInput(
  base: { readonly id?: string; readonly version?: number; readonly locked: boolean },
  data: FormData,
): Input {
  const gender = textOf(data, 'titleGender');
  const position = textOf(data, 'position').trim();
  return {
    ...(base.id !== undefined && { id: base.id, expectedVersion: base.version }),
    name: textOf(data, 'name'),
    titleGender: gender === '' ? null : choiceOf(data, 'titleGender', TITLE_GENDER_VALUES),
    defaultBullets: bulletsOf(data),
    active: base.locked || flagOf(data, 'active'),
    ...(position !== '' && { position: Number(position) }),
  };
}
