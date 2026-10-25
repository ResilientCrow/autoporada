import type { Clock } from '@/application/ports';

/** Where every FixedClock starts unless told otherwise: Monday 19 October 2026, 10.00 in Prague. */
export const CLOCK_START = new Date('2026-10-19T08:00:00Z');

/** A clock tests move by hand. */
export class FixedClock implements Clock {
  private readonly start: number;
  private at: number;

  constructor(start = CLOCK_START) {
    this.start = start.getTime();
    this.at = this.start;
  }

  now(): Date {
    return new Date(this.at);
  }

  set(instant: Date): void {
    this.at = instant.getTime();
  }

  advance(ms: number): void {
    this.at += ms;
  }

  /** Back to the instant it started at. */
  reset(): void {
    this.at = this.start;
  }
}
