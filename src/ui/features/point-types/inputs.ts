import type { z } from 'zod';

import type { savePointTypeInput } from '@/contracts';
import { foldForSearch, TITLE_GENDERS } from '@/domain/cs';
import { POINT_LIMITS } from '@/domain/report';
import { choiceOf, flagOf, textOf } from '@/ui/form';

const BULLET_KINDS = ['people', 'text'] as const;

type Input = z.input<typeof savePointTypeInput>;
type Bullet = Input['defaultBullets'][number];

type Kind = Bullet['kind'];

/** The suffix that binds a minted key to its kind; a slug never holds `--`. */
const KIND_SUFFIX: Readonly<Record<Kind, string>> = { people: '--p', text: '--t' };

/**
 * A bullet key from its label and kind: folded, hyphenated, starting with a letter, within the key
 * limit, ending in the kind's suffix; `-2`, `-3` and so on when `taken` already holds it. The
 * kind is part of the key, because a started point finds the type's bullet by key: a bullet that
 * was removed and is added again as another kind must not come back under the old key.
 */
export function bulletKeyFor(label: string, kind: Kind, taken: ReadonlySet<string>): string {
  const suffix = KIND_SUFFIX[kind];
  const slug = foldForSearch(label)
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  const head = /^[a-z]/.test(slug) || slug === '' ? slug : `bod-${slug}`;
  const room = (extra: string) =>
    head.slice(0, POINT_LIMITS.bulletKey - suffix.length - extra.length).replace(/-+$/, '') ||
    'bod';
  for (let n = 1; ; n += 1) {
    const extra = n === 1 ? '' : `-${n}`;
    const key = `${room(extra)}${extra}${suffix}`;
    if (!taken.has(key)) return key;
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
    const key = textOf(data, at('key')) || bulletKeyFor(label, kind, taken);
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
    titleGender: gender === '' ? null : choiceOf(data, 'titleGender', TITLE_GENDERS),
    defaultBullets: bulletsOf(data),
    active: base.locked || flagOf(data, 'active'),
    ...(position !== '' && { position: Number(position) }),
  };
}
