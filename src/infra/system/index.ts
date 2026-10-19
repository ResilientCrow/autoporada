import type { Clock } from '@/application/ports';

/** The wall clock of the server. */
export const systemClock: Clock = { now: () => new Date() };
