import { describe, expect, it } from 'vitest';

import { requestInput } from './inputs';

describe('requestInput', () => {
  it('sends the reason as typed', () => {
    const data = new FormData();
    data.set('reason', '  Chci posílat zprávy\n');
    expect(requestInput(data)).toEqual({ reason: '  Chci posílat zprávy\n' });
  });

  it('sends an empty reason when the field is missing, for the server to refuse', () => {
    expect(requestInput(new FormData())).toEqual({ reason: '' });
  });
});
