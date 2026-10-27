import { draftBullet, POINT_LIMITS, type BulletSpec, type DraftPerson } from '@/domain/report';
import { points } from '@/ui/copy';

/** How a people bullet's chips are sorted in the preview and the DOCX; the editor never reorders them. */
export type PeopleOrder = 'input' | 'class-surname';

/**
 * A bullet of the draft, with `P` the person it holds: a `DraftPerson` as saved, or a
 * `Chip` (a person with the key its field tracks it by) while the editor is open. The
 * rules below do not care which.
 */
export type Bullet<P = DraftPerson> =
  | {
      readonly key: string;
      readonly label: string;
      readonly kind: 'people';
      readonly order: PeopleOrder;
      readonly people: readonly P[];
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly kind: 'text';
      readonly text: string;
    };

type Specs = readonly BulletSpec[];

/** The first custom key is `custom-1`. */
const CUSTOM_PREFIX = 'custom-';

/** A bullet the type does not offer: its label is the author's to write. */
export function isCustom(bullet: { readonly key: string }, spec: Specs): boolean {
  return !spec.some((s) => s.key === bullet.key);
}

/** A required bullet of the type stays; an optional one and every custom bullet may go. */
export function removable(bullet: { readonly key: string }, spec: Specs): boolean {
  return spec.find((s) => s.key === bullet.key)?.required !== true;
}

/** The bullets with the one named `key` replaced by `change` of it; the others are the same objects. */
function mapBullet<P>(
  bullets: readonly Bullet<P>[],
  key: string,
  change: (bullet: Bullet<P>) => Bullet<P>,
): Bullet<P>[] {
  return bullets.map((bullet) => (bullet.key === key ? change(bullet) : bullet));
}

/** Sets a people bullet's people; any other bullet is left as it is. */
export function setPeople<P>(
  bullets: readonly Bullet<P>[],
  key: string,
  people: readonly P[],
): Bullet<P>[] {
  return mapBullet(bullets, key, (b) => (b.kind === 'people' ? { ...b, people } : b));
}

/** Sets how a people bullet is sorted; the people stay as entered. */
export function setOrder<P>(
  bullets: readonly Bullet<P>[],
  key: string,
  order: PeopleOrder,
): Bullet<P>[] {
  return mapBullet(bullets, key, (b) => (b.kind === 'people' ? { ...b, order } : b));
}

/** Sets a text bullet's text. */
export function setText<P>(bullets: readonly Bullet<P>[], key: string, text: string): Bullet<P>[] {
  return mapBullet(bullets, key, (b) => (b.kind === 'text' ? { ...b, text } : b));
}

/**
 * Renames a custom bullet, the label cut at the contract's cap. A bullet of the type
 * keeps its spec's label: that is how readiness and the opening sentence know it.
 */
export function renameBullet<P>(
  bullets: readonly Bullet<P>[],
  key: string,
  label: string,
  spec: Specs,
): Bullet<P>[] {
  if (!isCustom({ key }, spec)) return [...bullets];
  return mapBullet(bullets, key, (b) => ({
    ...b,
    label: label.slice(0, POINT_LIMITS.bulletLabel),
  }));
}

export type Removed<P> =
  | { readonly ok: true; readonly bullets: Bullet<P>[] }
  | { readonly ok: false; readonly code: 'required' | 'unknown' };

/** Removes a bullet, refusing one the type requires. */
export function removeBullet<P>(
  bullets: readonly Bullet<P>[],
  key: string,
  spec: Specs,
): Removed<P> {
  const found = bullets.find((b) => b.key === key);
  if (found === undefined) return { ok: false, code: 'unknown' };
  if (!removable(found, spec)) return { ok: false, code: 'required' };
  return { ok: true, bullets: bullets.filter((b) => b !== found) };
}

export type Added<P> =
  | { readonly ok: true; readonly bullets: Bullet<P>[]; readonly index: number }
  | { readonly ok: false; readonly code: 'limit' };

/**
 * The next free `custom-N`: free among the draft's keys and the type's, so a type
 * bullet the author removed never comes back under a custom bullet's name.
 */
function customKey(taken: ReadonlySet<string>): string {
  let n = 1;
  while (taken.has(`${CUSTOM_PREFIX}${n}`)) n += 1;
  return `${CUSTOM_PREFIX}${n}`;
}

/** Adds an empty custom bullet at the end, or says the point is full. */
export function addBullet<P>(
  bullets: readonly Bullet<P>[],
  kind: 'people' | 'text',
  spec: Specs,
): Added<P> {
  if (bullets.length >= POINT_LIMITS.bullets) return { ok: false, code: 'limit' };
  const key = customKey(new Set([...bullets.map((b) => b.key), ...spec.map((s) => s.key)]));
  const fresh: Bullet<P> =
    kind === 'people'
      ? { key, label: '', kind, order: 'input', people: [] }
      : { key, label: '', kind, text: '' };
  return { ok: true, bullets: [...bullets, fresh], index: bullets.length };
}

/**
 * How many people the people bullet `key` may hold: the bullet's own cap, or what the
 * point's cap leaves after the other bullets, whichever is less (and never less than it
 * already holds, so a field is not cut). Without it the editor would offer an add that
 * every save refuses.
 */
export function peopleLimit<P>(bullets: readonly Bullet<P>[], key: string): number {
  const own = bullets.find((b) => b.key === key);
  if (own?.kind !== 'people') return 0;
  const others = bullets.reduce(
    (sum, b) => sum + (b.kind === 'people' && b !== own ? b.people.length : 0),
    0,
  );
  const room = POINT_LIMITS.peoplePerPoint - others;
  return Math.max(own.people.length, Math.min(POINT_LIMITS.peoplePerBullet, room));
}

/** What a row is called: its label, or its place while it has none (`index` counts from zero). */
export function bulletTitle(bullet: { readonly label: string }, index: number): string {
  return bullet.label.trim() === '' ? points.bullets.unnamed(index + 1) : bullet.label;
}

/** Where the type's bullet `key` stands in the type, or -1 for a custom one. */
function specIndex(spec: Specs, key: string): number {
  return spec.findIndex((s) => s.key === key);
}

/** The bullets of the type the draft no longer has, in the type's order. */
export function restorable<P>(bullets: readonly Bullet<P>[], spec: Specs): BulletSpec[] {
  return spec.filter((s) => !bullets.some((b) => b.key === s.key));
}

export type Restored<P> =
  | { readonly ok: true; readonly bullets: Bullet<P>[]; readonly index: number }
  | { readonly ok: false; readonly code: 'limit' | 'unknown' | 'present' };

/**
 * Puts a bullet of the type back, built as a new draft builds it, at its place in the
 * type: before the first bullet of the draft that comes after it in the type, or after
 * the last bullet of the type the draft has (the author's own rows stay behind those).
 */
export function restoreBullet<P>(
  bullets: readonly Bullet<P>[],
  spec: Specs,
  key: string,
): Restored<P> {
  const wanted = specIndex(spec, key);
  const found = spec[wanted];
  if (found === undefined) return { ok: false, code: 'unknown' };
  if (bullets.some((b) => b.key === key)) return { ok: false, code: 'present' };
  if (bullets.length >= POINT_LIMITS.bullets) return { ok: false, code: 'limit' };
  const drafted = draftBullet(found);
  const fresh: Bullet<P> = drafted.kind === 'people' ? { ...drafted, people: [] } : drafted;
  const after = bullets.findIndex((b) => specIndex(spec, b.key) > wanted);
  const lastOfType = bullets.findLastIndex((b) => !isCustom(b, spec));
  const index = after >= 0 ? after : lastOfType + 1;
  return { ok: true, bullets: bullets.toSpliced(index, 0, fresh), index };
}

/** What the author asks of the rows. */
export type RowOp =
  | { readonly kind: 'add'; readonly rowKind: 'people' | 'text' }
  | { readonly kind: 'remove'; readonly key: string }
  | { readonly kind: 'restore'; readonly key: string };

/** What takes focus after a row operation: a control of a row (counting from zero), or the add buttons. */
export type RowFocus = { readonly row: number; readonly control: 'label' | 'first' } | 'add';

export type Applied<P> =
  | { readonly ok: true; readonly bullets: Bullet<P>[]; readonly focus: RowFocus }
  | { readonly ok: false; readonly code: 'limit' | 'required' | 'unknown' | 'present' };

/**
 * One add, removal or restore of a row, with where focus goes: an add to the new row's
 * „Název řádku“, a restore to the restored row's first control, a removal to the first
 * control of the row that took its place, or to the add buttons when it was the last.
 */
export function applyRowOp<P>(bullets: readonly Bullet<P>[], spec: Specs, op: RowOp): Applied<P> {
  switch (op.kind) {
    case 'add': {
      const added = addBullet(bullets, op.rowKind, spec);
      return added.ok
        ? { ok: true, bullets: added.bullets, focus: { row: added.index, control: 'label' } }
        : added;
    }
    case 'restore': {
      const restored = restoreBullet(bullets, spec, op.key);
      return restored.ok
        ? { ok: true, bullets: restored.bullets, focus: { row: restored.index, control: 'first' } }
        : restored;
    }
    case 'remove': {
      const removed = removeBullet(bullets, op.key, spec);
      if (!removed.ok) return removed;
      const row = bullets.findIndex((b) => b.key === op.key);
      const focus = row < removed.bullets.length ? { row, control: 'first' as const } : 'add';
      return { ok: true, bullets: removed.bullets, focus };
    }
  }
}
