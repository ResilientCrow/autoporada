import { describe, expect, it } from 'vitest';

import { setupTestDatabase } from '../../support/database';

const database = setupTestDatabase();

interface ListRow {
  id: string;
  key: string;
  title: string;
  doc_label: string;
  purpose: string;
  position: number;
  active: boolean;
  version: number;
}

describe('registry seeds (migration 0032)', () => {
  const lists = () =>
    database.owner<ListRow>(
      `SELECT id, key, title, doc_label, purpose, position, active, version
         FROM registry_lists ORDER BY position`,
    );

  it('has the four lists of the template, in order, active, at version 1', async () => {
    const rows = await lists();
    expect(rows.map((r) => [r.key, r.title, r.purpose, r.position, r.active, r.version])).toEqual([
      ['talent', 'Talentovaní studenti', 'annex1', 1, true, 1],
      ['aj-certifikat', 'Angličtina – certifikáty', 'point4', 2, true, 1],
      ['aj-prezkouseni', 'Angličtina – přezkoušení', 'point4', 3, true, 1],
      ['nj-certifikat', 'Němčina – certifikáty', 'point4', 4, true, 1],
    ]);
  });

  it('prints the labels of the template', async () => {
    expect((await lists()).map((r) => r.doc_label)).toEqual([
      'Program na podporu talentovaných a aktivních studentů',
      'seznam studentů uvolněných z Anglického jazyka na základě získaných certifikátů',
      'seznam studentů uvolněných z Anglického jazyka na základě přezkoušení',
      'seznam studentů uvolněných z Německého jazyka na základě získaných certifikátů',
    ]);
  });

  it('has exactly one Příloha 1 list and no students', async () => {
    expect((await lists()).filter((r) => r.purpose === 'annex1')).toHaveLength(1);
    const [count] = await database.owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM registry_entries`,
    );
    expect(count?.n).toBe(0);
  });

  it('keeps the fixed ids, so a document can name a list across installations', async () => {
    expect((await lists()).map((r) => r.id)).toEqual([
      '0198f000-0000-7000-8000-000000000001',
      '0198f000-0000-7000-8000-000000000002',
      '0198f000-0000-7000-8000-000000000003',
      '0198f000-0000-7000-8000-000000000004',
    ]);
  });
});
