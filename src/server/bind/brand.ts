import type { LimitName } from '../rate-limit';

/** What defineRoute recorded about an entry point (inventory test). */
export interface WrappedInfo {
  readonly kind: 'route';
  readonly name: string;
  readonly access: 'public' | 'session';
  readonly rateLimit: LimitName | 'none';
}

/** A WeakMap, not a property, so the wrapped functions stay unfrozen. */
const WRAPPED = new WeakMap<object, WrappedInfo>();

export function markWrapped(entry: object, info: WrappedInfo): void {
  WRAPPED.set(entry, info);
}

/** How an exported function was wrapped; undefined if it was not. */
export function wrappedInfo(value: unknown): WrappedInfo | undefined {
  return typeof value === 'function' ? WRAPPED.get(value) : undefined;
}
