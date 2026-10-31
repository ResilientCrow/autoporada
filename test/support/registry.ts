import { system, type RegistryListRecord } from '@/application/ports';

import type { RegistryEntrySeed, World } from './world';

/** Lists, entries and people for the registry's tests, in either world. */
export function registryFixtures(world: World) {
  const people = {
    headmaster: () => world.seed.user({ role: 'headmaster' }),
    reviewer: () => world.seed.user({ role: 'reviewer' }),
    submitter: () => world.seed.user({ role: 'submitter' }),
  };
  /** A point-4 list titled `title`, its key made from it. */
  const list = (title = 'Angličtina – certifikáty', extra: Partial<RegistryListRecord> = {}) =>
    world.seed.registryList({
      key: title
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      title,
      ...extra,
    });
  const entry = (
    listId: string,
    familyName: string,
    rest: Omit<RegistryEntrySeed, 'listId' | 'familyName'> = {},
  ) => world.seed.registryEntry({ listId, familyName, ...rest });
  /** The list's active entries as the repository gives them. */
  const entriesOf = (listId: string) =>
    world.tx(system('job:test'), (tx) => tx.registry.entries(listId), 'read');
  const lists = () => world.tx(system('job:test'), (tx) => tx.registry.lists(), 'read');
  const entryById = (id: string) =>
    world.tx(system('job:test'), (tx) => tx.registry.entry(id), 'read');
  return { people, list, entry, entriesOf, lists, entryById };
}
