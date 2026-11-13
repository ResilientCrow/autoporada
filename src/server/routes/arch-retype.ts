import { isPointTypeId, type PointTypeId } from '@/domain/report';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RetypeRequest {
  readonly id: string;
  readonly expectedVersion: number;
  readonly patch: { typeId: PointTypeId } | { kind: 'finance' | 'pokyn' };
}

/**
 * Arch's `{ id, expectedVersion, typeId? | kind? }`: a draft report takes one of the coded types
 * by key (ADR 0064), a draft proposal switches between finance and pokyn. Anything else is null.
 */
export function retypeRequest(input: unknown): RetypeRequest | null {
  const { id, expectedVersion, typeId, kind } = (input ?? {}) as Record<string, unknown>;
  if (typeof id !== 'string' || !UUID.test(id) || typeof expectedVersion !== 'number') return null;
  if (isPointTypeId(typeId)) return { id, expectedVersion, patch: { typeId } };
  if (kind === 'finance' || kind === 'pokyn') return { id, expectedVersion, patch: { kind } };
  return null;
}
