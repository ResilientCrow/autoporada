import type { PointKind } from '@/domain/report';

/** „Kontrola“: the review queue, its card on the Přehled and a point under review (design section 10). */
export const review = {
  title: 'Kontrola',
  /** The tab title of a point under review; never its own title, which can name people. */
  point: 'Kontrola bodu',
  /** A Monday of the queue; `date` is day and month, „16.\u00a03.“. */
  porada: (date: string) => `Porada ${date}`,
  /** The points no Monday of the window takes: every one skipped or generated. */
  unplaced: 'Porada zatím neurčena',
  /** The parts of the porada, in its order. */
  kind: {
    report: 'Provoz a\u00a0akce',
    finance: 'Hospodaření',
    pokyn: 'Pokyny',
  } as const satisfies Record<PointKind, string>,
  /** When the point was last handed in; `date` is day and month. */
  submitted: (date: string) => `Odesláno ${date}`,
  /** A point handed in again after a return. */
  returnedBefore: 'Vráceno dříve',
  approved: 'Schválené, čekají na poradu',
  /** No submitted point waits for a decision; approved ones may still wait for their porada. */
  empty: 'Ve frontě už nic nečeká.',
  /** More points wait than the queue lists; `n` is its limit. */
  capped: (n: number) => `Zobrazeno je jen ${n}\u00a0nejstarších bodů.`,
  /** The card on the Přehled, for reviewers. */
  card: {
    title: 'Kontrola',
    waiting: (n: number) => `Ke kontrole: ${n}`,
  },
} as const;
