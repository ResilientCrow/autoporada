import type { AnyUseCase } from '@/application/core';

import type { LimitName } from '../rate-limit';

/** What defineAction or defineRoute recorded about an entry point (inventory test). */
export type WrappedInfo =
  | {
      readonly kind: 'action';
      readonly useCase: AnyUseCase;
      readonly rateLimit: LimitName | 'none';
    }
  | {
      readonly kind: 'route';
      readonly name: string;
      readonly access: 'public' | 'session';
      readonly rateLimit: LimitName | 'none';
    };

/**
 * A WeakMap, not a property: React defines its own non-configurable
 * properties on server actions, and the functions must stay unfrozen.
 */
const WRAPPED = new WeakMap<object, WrappedInfo>();

export function markWrapped(entry: object, info: WrappedInfo): void {
  WRAPPED.set(entry, info);
}

/** How an exported function was wrapped; undefined if it was not. */
export function wrappedInfo(value: unknown): WrappedInfo | undefined {
  return typeof value === 'function' ? WRAPPED.get(value) : undefined;
}
