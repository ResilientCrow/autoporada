import { describe, expect, it } from 'vitest';

import { scopeWhere } from './scope-sql';
import { points } from './schema';

const reviewer = { kind: 'own-or-submitted', userId: 'u1' } as const;

describe('scopeWhere', () => {
  it('refuses own-or-submitted without the state or the submittedAt column', () => {
    const message = /own-or-submitted needs state and submittedAt columns/;
    expect(() => scopeWhere(reviewer, { owner: points.authorId, state: points.state })).toThrow(
      message,
    );
    expect(() =>
      scopeWhere(reviewer, { owner: points.authorId, submittedAt: points.submittedAt }),
    ).toThrow(message);
  });

  it('refuses own-or-approved-akce without the kind or the state column', () => {
    const scope = { kind: 'own-or-approved-akce', userId: 'u1' } as const;
    const message = /own-or-approved-akce needs kind and state columns/;
    expect(() => scopeWhere(scope, { owner: points.authorId, state: points.state })).toThrow(
      message,
    );
    expect(() => scopeWhere(scope, { owner: points.authorId, kind: points.kind })).toThrow(message);
  });
});
