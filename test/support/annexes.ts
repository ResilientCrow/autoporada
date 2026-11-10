import { toIsoDate, type CalDate } from '@/domain/time';

import type { World } from './world';

/**
 * Further annexes of a porada (the Arch UI's `arch_annexes`), seeded past the ports in either
 * world: a table row in PostgreSQL, a settings key beside the settings in the fake.
 */
export async function seedAnnexes(
  world: World,
  monday: CalDate,
  annexes: unknown[],
): Promise<void> {
  if (world.pg) {
    await world.pg.owner(`INSERT INTO arch_annexes (monday, annexes) VALUES ($1, $2)`, [
      toIsoDate(monday),
      JSON.stringify(annexes),
    ]);
    return;
  }
  // The fake's settings key (an array is no setting value, so past `seed.setting`).
  world.fake?.state().settings.set(`arch.annexes.${toIsoDate(monday).replaceAll('-', '')}`, {
    value: structuredClone(annexes),
    version: 1,
  });
}
