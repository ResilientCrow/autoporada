import { describe, expect, it } from 'vitest';

import {
  FUTURE_RETURN_PARTS,
  MAX_RETURN_PARTS,
  POINT_RETURN_PARTS,
  pointReturnPartsFor,
} from './parts';

describe('return parts', () => {
  it('names the parts of a point and of a future item, at most MAX_RETURN_PARTS each', () => {
    expect(POINT_RETURN_PARTS).toEqual(['heading', 'body', 'people', 'statements']);
    expect(FUTURE_RETURN_PARTS).toEqual(['title', 'when', 'place', 'who', 'note']);
    expect(MAX_RETURN_PARTS).toBe(5);
    expect(POINT_RETURN_PARTS.length).toBeLessThanOrEqual(MAX_RETURN_PARTS);
    expect(FUTURE_RETURN_PARTS).toHaveLength(MAX_RETURN_PARTS);
  });

  it('gives a report all four parts', () => {
    expect(pointReturnPartsFor('report')).toEqual(['heading', 'body', 'people', 'statements']);
  });

  it.each(['finance', 'pokyn'] as const)('gives a %s proposal only heading and body', (kind) => {
    expect(pointReturnPartsFor(kind)).toEqual(['heading', 'body']);
  });
});
