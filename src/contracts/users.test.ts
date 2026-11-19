import { describe, expect, it } from 'vitest';

import {
  changeUserAccessInput,
  changeUserAccessOutput,
  setFunctionsInput,
  setFunctionsOutput,
} from './users';

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

describe('setFunctionsInput', () => {
  const base = { userId: form.userId, version: 2 };
  const parse = (functions: unknown) => setFunctionsInput.safeParse({ ...base, functions });

  it('takes a list of heads with a complement or none, and an empty list', () => {
    expect(parse([]).success).toBe(true);
    expect(parse([{ head: 'zastupce', complement: 'pro majetek' }]).success).toBe(true);
    expect(parse([{ head: 'clen', complement: null }]).success).toBe(true);
  });

  it('trims the complement and reads an empty one as none', () => {
    const parsed = setFunctionsInput.parse({
      ...base,
      functions: [
        { head: 'vedouci', complement: '  IT oddělení  ' },
        { head: 'clen', complement: '   ' },
      ],
    });
    expect(parsed.functions).toEqual([
      { head: 'vedouci', complement: 'IT oddělení' },
      { head: 'clen', complement: null },
    ]);
  });

  it('refuses an unknown head, a missing complement and unknown fields', () => {
    expect(parse([{ head: 'reditel', complement: null }]).success).toBe(false);
    expect(parse([{ head: 'clen' }]).success).toBe(false);
    expect(parse([{ head: 'clen', complement: null, extra: 1 }]).success).toBe(false);
  });

  it('caps the complement at 80 characters and refuses line breaks and control characters', () => {
    expect(parse([{ head: 'clen', complement: 'x'.repeat(80) }]).success).toBe(true);
    expect(parse([{ head: 'clen', complement: 'x'.repeat(81) }]).success).toBe(false);
    for (const bad of ['a\nb', 'a\tb', 'a\u0007b', 'a\u202eb']) {
      expect(parse([{ head: 'clen', complement: bad }]).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('holds at most five functions', () => {
    const one = { head: 'clen', complement: null };
    expect(parse(Array(5).fill(one)).success).toBe(true);
    expect(parse(Array(6).fill(one)).success).toBe(false);
  });
});

describe('setFunctionsOutput', () => {
  it('carries the version the row has now', () => {
    expect(setFunctionsOutput.parse({ changed: false, version: 4 })).toEqual({
      changed: false,
      version: 4,
    });
  });
});
