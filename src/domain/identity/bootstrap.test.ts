import { describe, expect, it } from 'vitest';

import { bootstrapsHeadmaster, type BootstrapFacts } from './index';

const OID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const first: BootstrapFacts = {
  configuredOid: OID,
  oid: OID,
  purpose: 'login',
  role: 'pending',
  status: 'active',
  activeHeadmasters: 0,
};

describe('bootstrapsHeadmaster', () => {
  it('makes the configured account the first headmaster', () => {
    expect(bootstrapsHeadmaster(first)).toBe(true);
    expect(bootstrapsHeadmaster({ ...first, configuredOid: OID.toUpperCase() })).toBe(true);
  });

  it.each<[string, Partial<BootstrapFacts>]>([
    ['without a configured account', { configuredOid: null }],
    ['for another account', { oid: '11111111-2222-4333-8444-555555555555' }],
    ['once a headmaster exists', { activeHeadmasters: 1 }],
    ['at a step-up', { purpose: 'step_up' }],
    ['for a blocked account', { status: 'blocked' }],
    ['for a headmaster already', { role: 'headmaster' }],
  ])('does nothing %s', (_name, change) => {
    expect(bootstrapsHeadmaster({ ...first, ...change })).toBe(false);
  });
});
