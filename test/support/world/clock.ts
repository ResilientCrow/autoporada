import type { Clock } from '@/application/ports';

/** A clock tests move by hand. */
export class FixedClock implements Clock {
  private at: number;

  constructor(start = new Date('2026-10-19T08:00:00Z')) {
    this.at = start.getTime();
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
}
