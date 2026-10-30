import { describe, expect, it } from 'vitest';

import { keepRef, proposalInput, startInput } from './inputs';

const REF = '7e7d7f64-9b0d-4c1c-8d44-2f6c0a6c8f10';
const TYPE = '5d0c1d2e-3f40-4152-8364-758697a8b9c1';

describe('startInput', () => {
  it('starts a report of the chosen type, under the ref it was given', () => {
    const data = new FormData();
    data.set('typeId', TYPE);
    expect(startInput(data, REF)).toEqual({ clientRef: REF, kind: 'report', typeId: TYPE });
  });

  it('sends no type when none was chosen, for the server to refuse', () => {
    expect(startInput(new FormData(), REF)).toEqual({
      clientRef: REF,
      kind: 'report',
      typeId: null,
    });
  });
});

describe('proposalInput', () => {
  it.each(['finance', 'pokyn'] as const)('starts a %s with no type, under the ref', (kind) => {
    const data = new FormData();
    data.set('kind', kind);
    expect(proposalInput(data, REF)).toEqual({ clientRef: REF, kind, typeId: null });
  });

  it('ignores a type the form should not have sent', () => {
    const data = new FormData();
    data.set('kind', 'finance');
    data.set('typeId', TYPE);
    expect(proposalInput(data, REF).typeId).toBeNull();
  });

  it.each([undefined, '', 'report', 'akce'])(
    'throws for the choice %j, which no control offers',
    (kind) => {
      const data = new FormData();
      if (kind !== undefined) data.set('kind', kind);
      expect(() => proposalInput(data, REF)).toThrow('kind');
    },
  );
});

describe('keepRef', () => {
  it('makes the ref on the first press and keeps it for every retry', () => {
    const holder = { current: null };
    let made = 0;
    const make = () => `${REF.slice(0, -1)}${++made}`;
    const first = keepRef(holder, make);
    expect(keepRef(holder, make)).toBe(first);
    expect(keepRef(holder, make)).toBe(first);
    expect(made).toBe(1);
  });
});
