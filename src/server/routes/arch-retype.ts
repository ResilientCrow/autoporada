const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RetypeRequest {
  readonly id: string;
  readonly expectedVersion: number;
  readonly kind: 'finance' | 'pokyn';
}

/**
 * Arch's `{ id, expectedVersion, kind }`: a draft proposal switches between finance and pokyn
 * (a report has no type, ADR 0067). Anything else is null.
 */
export function retypeRequest(input: unknown): RetypeRequest | null {
  const { id, expectedVersion, kind } = (input ?? {}) as Record<string, unknown>;
  if (typeof id !== 'string' || !UUID.test(id) || typeof expectedVersion !== 'number') return null;
  if (kind === 'finance' || kind === 'pokyn') return { id, expectedVersion, kind };
  return null;
}
