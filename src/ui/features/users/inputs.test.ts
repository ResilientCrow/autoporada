import { describe, expect, it } from 'vitest';

import { blockInput, roleInput } from './inputs';

describe('blockInput', () => {
  it('leaves confirmed out when the box is not ticked', () => {
    const input = blockInput('r1', 3, new FormData());
    expect(input).toEqual({ requestId: 'r1', version: 3, decision: 'block' });
    expect(input).not.toHaveProperty('confirmed');
  });

  it('sends confirmed: true when it is ticked', () => {
    const data = new FormData();
    data.set('confirmed', 'on');
    expect(blockInput('r1', 3, data)).toEqual({
      requestId: 'r1',
      version: 3,
      decision: 'block',
      confirmed: true,
    });
  });
});

describe('roleInput', () => {
  const user = { id: 'u1', version: 4, status: 'blocked' as const };
  const form = (values: Record<string, string>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(values)) data.set(name, value);
    return data;
  };

  it('sends the full state with the status of the props, and no confirmed when unticked', () => {
    const input = roleInput(user, form({ role: 'reviewer', audience: 'staff' }));
    expect(input).toEqual({
      userId: 'u1',
      version: 4,
      role: 'reviewer',
      audience: 'staff',
      status: 'blocked',
    });
    expect(input).not.toHaveProperty('confirmed');
  });

  it('sends confirmed: true when it is ticked', () => {
    const input = roleInput(
      user,
      form({ role: 'submitter', audience: 'student', confirmed: 'on' }),
    );
    expect(input).toMatchObject({ audience: 'student', confirmed: true });
  });

  it('throws on a value the controls never offer', () => {
    expect(() => roleInput(user, form({ role: 'root', audience: 'staff' }))).toThrow('role');
    expect(() => roleInput(user, form({ role: 'reviewer' }))).toThrow('audience');
  });
});
