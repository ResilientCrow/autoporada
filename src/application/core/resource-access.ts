import type { Tx } from '@/application/ports';
import type { Check } from '@/domain/policy';

import type { ResourceAccess } from './spec';

/** What every write to a resource names: the resource and the version the page showed. */
interface VersionedWrite {
  readonly id: string;
  readonly expectedVersion: number;
}

/**
 * The access of a write to a resource (ADR 0011): `load` takes the row under its lock through the
 * scoped repository, so one the user may not write is not-found; then the version, so a stale page
 * is a conflict whatever the state; then the use case's own `check` on the locked row.
 */
export function writeAccess<I extends VersionedWrite, R>(
  load: (tx: Tx, id: string) => Promise<R | null>,
  check: (resource: R, input: I) => Check,
): ResourceAccess<I, R> {
  return {
    kind: 'resource',
    load: (tx, input) => load(tx, input.id),
    expectedVersion: (input) => input.expectedVersion,
    check,
  };
}

/**
 * The access of a read of one resource: `load` goes through the scoped repository without the row
 * lock, so one outside the reader's scope is not-found; no version is compared.
 */
export function readAccess<I extends { readonly id: string }, R>(
  load: (tx: Tx, id: string) => Promise<R | null>,
  check: (resource: R, input: I) => Check,
): ResourceAccess<I, R> {
  return {
    kind: 'resource',
    load: (tx, input) => load(tx, input.id),
    expectedVersion: 'unversioned',
    check,
  };
}
