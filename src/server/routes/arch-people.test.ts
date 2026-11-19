import { describe, expect, it } from 'vitest';

import type { Tier } from '@/domain/actor';

import { peopleFor } from './arch-people';

const row = (id: string, tier: Tier | null, role = 'submitter') => ({
  id,
  version: 3,
  displayName: `Jana ${id}`,
  email: `${id}@ssps.cz`,
  role,
  status: 'active',
  tier,
  jobTitle: null,
  department: null,
});
const ROWS = [row('me', 'ucitel'), row('kolega', 'absolvent'), row('nikdo', null)];
const people = (head: boolean) =>
  peopleFor({
    rows: ROWS,
    actorId: 'me',
    head,
    staff: true,
    named: new Set(ROWS.map((r) => r.id)),
    vers: {},
  });
const byId = (list: ReturnType<typeof people>, id: string) => list.find((p) => p.id === id);

describe('peopleFor: the tier (ADR 0072)', () => {
  it('gives the headmaster everyone’s tier, null while unset', () => {
    const list = people(true);
    expect(byId(list, 'me')).toMatchObject({ tier: 'ucitel', isStudent: false });
    expect(byId(list, 'kolega')).toMatchObject({ tier: 'absolvent', isStudent: true });
    expect(byId(list, 'nikdo')).toMatchObject({ tier: null });
  });

  it('gives anyone else their own tier only', () => {
    const list = people(false);
    expect(byId(list, 'me')).toMatchObject({ tier: 'ucitel' });
    expect(byId(list, 'kolega')).not.toHaveProperty('tier');
    expect(byId(list, 'kolega')).toMatchObject({ isStudent: false });
  });
});
