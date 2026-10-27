import type { Chip } from '@/ui/form';

import type { Bullet } from './bullets-state';
import type { PointContentWire } from './fields';

/** The editor's bullets: each person held as a chip, with the key a people field tracks it by. */
export type KeyedBullet = Bullet<Chip>;

/**
 * The bullets with a key on every person. The keys are the field's only handle on a chip,
 * so the editor mints them once, when it opens, and keeps them through every edit: new
 * ones come from the field itself. They are made from the bullet's key and the person's
 * place at the start, not from a random id, so the server's render and the browser's
 * agree (the key reaches the markup as an id) and a key never changes afterwards.
 */
export function keyBullets(bullets: PointContentWire['bullets']): KeyedBullet[] {
  return bullets.map((bullet) =>
    bullet.kind === 'people'
      ? {
          ...bullet,
          people: bullet.people.map((person, i) => ({ key: `${bullet.key}.${i}`, person })),
        }
      : bullet,
  );
}

/** The bullets as the save takes them: the people alone, no keys. */
export function stripKeys(bullets: readonly KeyedBullet[]): PointContentWire['bullets'] {
  return bullets.map((bullet) =>
    bullet.kind === 'people'
      ? { ...bullet, people: bullet.people.map((chip) => chip.person) }
      : bullet,
  );
}
