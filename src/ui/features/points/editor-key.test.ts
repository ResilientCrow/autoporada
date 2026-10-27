import { describe, expect, it } from 'vitest';

import { editorKey } from './editor-key';

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';

describe('editorKey', () => {
  it('is the point id and the version the page loaded, joined by a colon', () => {
    expect(editorKey({ id: ID, version: 3 })).toBe(`${ID}:3`);
  });

  it('changes with the version, so a reload to a newer one remounts the editor', () => {
    expect(editorKey({ id: ID, version: 3 })).not.toBe(editorKey({ id: ID, version: 4 }));
  });

  it('changes with the point', () => {
    expect(editorKey({ id: ID, version: 1 })).not.toBe(editorKey({ id: `${ID}x`, version: 1 }));
  });
});
