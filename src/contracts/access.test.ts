import { describe, expect, it } from 'vitest';

import { decideAccessInput } from './access';

const base = { requestId: '00000000-0000-4000-8000-000000000001', version: 1 };

/** The issues of a refused parse as `path:code`, or null when it parsed. */
function issues(input: object) {
  const result = decideAccessInput.safeParse({ ...base, ...input });
  if (result.success) return null;
  return result.error.issues.map(
    (i) => `${i.path.join('.')}:${(i as { params?: { code?: string } }).params?.code ?? i.code}`,
  );
}

describe('decideAccessInput', () => {
  it.each(['reditel', 'vedeni', 'ucitel', 'zamestnanec', 'student', 'absolvent'])(
    'approves with the tier %s',
    (tier) => {
      expect(issues({ decision: 'approve', tier })).toBeNull();
    },
  );

  it('refuses an approval without a tier: the headmaster picks it, there is no default', () => {
    expect(issues({ decision: 'approve' })).toEqual(['tier:required']);
  });

  it('refuses an unknown tier', () => {
    expect(issues({ decision: 'approve', tier: 'rodic' })).toEqual(['tier:invalid_value']);
  });

  it('takes no tier with a rejection or a block', () => {
    expect(issues({ decision: 'reject' })).toBeNull();
    expect(issues({ decision: 'block', confirmed: true })).toBeNull();
    expect(issues({ decision: 'reject', tier: 'ucitel' })).toEqual(['tier:invalid']);
    expect(issues({ decision: 'block', tier: 'student', confirmed: true })).toEqual([
      'tier:invalid',
    ]);
  });

  it.each(['approve-staff', 'approve-student'])('no longer knows the decision %s', (decision) => {
    expect(issues({ decision })).toEqual(['decision:invalid_value']);
  });
});
