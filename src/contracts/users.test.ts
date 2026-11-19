import { describe, expect, it } from 'vitest';

import { changeUserAccessInput, changeUserAccessOutput } from './users';

const form = {
  userId: '00000000-0000-4000-8000-000000000001',
  version: 1,
  role: 'submitter',
  tier: 'ucitel',
  status: 'active',
};

describe('changeUserAccessInput', () => {
  it('takes the tier, or none yet', () => {
    expect(changeUserAccessInput.safeParse(form).success).toBe(true);
    expect(changeUserAccessInput.safeParse({ ...form, tier: null }).success).toBe(true);
  });

  it('needs the tier the form shows, and refuses an unknown one', () => {
    const { tier: _tier, ...noTier } = form;
    expect(changeUserAccessInput.safeParse(noTier).success).toBe(false);
    expect(changeUserAccessInput.safeParse({ ...form, tier: 'rodic' }).success).toBe(false);
  });

  it('no longer takes an audience', () => {
    expect(changeUserAccessInput.safeParse({ ...form, audience: 'staff' }).success).toBe(false);
  });
});

describe('changeUserAccessOutput', () => {
  it('carries the version the row has now', () => {
    expect(changeUserAccessOutput.parse({ changed: true, version: 3 })).toEqual({
      changed: true,
      version: 3,
    });
    expect(changeUserAccessOutput.safeParse({ changed: true }).success).toBe(false);
  });
});
