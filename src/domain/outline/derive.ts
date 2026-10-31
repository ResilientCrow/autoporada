import { emptyRichDoc, type RichDoc } from '@/domain/richtext';
import type { CalDate } from '@/domain/time';

import { planCarryOver } from './carry-over';
import { SECTIONS, type Outline, type OutlineOrigin, type OutlineRow } from './model';

/** The latest earlier issue that has item rows. */
export interface DeriveSource {
  readonly status: 'open' | 'skipped' | 'generated';
  readonly meetingDate: CalDate;
  readonly outline: Outline;
}

export interface Derived {
  readonly outline: Outline;
  readonly origin: OutlineOrigin;
}

function carrySection(rows: readonly OutlineRow[]): OutlineRow[] {
  return planCarryOver<RichDoc | null, OutlineRow & { readonly position: number }>(
    rows.map((row, position) => ({ ...row, position })),
    emptyRichDoc(),
  ).map(({ position: _position, ...row }) => ({
    ...row,
    // Ohlasy are news of one week: the partners' quotes go with their body.
    ...(row.slot === 'partners' && { quotes: [] }),
  }));
}

/**
 * The outline of an issue that has no rows of its own: a skipped source passes unchanged (that
 * meeting did not happen), any other source is carried over, and with no source the seed starts.
 */
export function derive(source: DeriveSource | null, seed: Outline): Derived {
  if (!source) return { outline: seed, origin: { kind: 'seed' } };
  if (source.status === 'skipped') {
    return {
      outline: source.outline,
      origin: { kind: 'derived', from: source.meetingDate, how: 'pass' },
    };
  }
  const [pokyny, hospodareni] = SECTIONS.map((section) => carrySection(source.outline[section]));
  return {
    outline: { pokyny: pokyny ?? [], hospodareni: hospodareni ?? [] },
    origin: { kind: 'derived', from: source.meetingDate, how: 'carry' },
  };
}
