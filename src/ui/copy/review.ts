import { POINT_LIMITS, type PointKind } from '@/domain/report';
import type { ReviewDecision } from '@/domain/review';

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
  /** The akce and jednání section of the queue (design section 12). */
  future: {
    title: 'Akce a\u00A0jednání',
    /** An approved akce its author changed: it waits for a new decision. */
    revised: 'Změna schválené akce',
    /** More items wait than the section lists; `n` is its limit. */
    capped: (n: number) => `Zobrazeno je jen ${n}\u00A0nejstarších položek.`,
  },
  /** The decision bar under a point (design section 10). */
  decision: {
    label: 'Rozhodnutí kontroly',
    approve: 'Schválit',
    approveNext: 'Schválit a\u00a0pokračovat',
    return: 'Vrátit k\u00a0úpravě',
    reject: 'Zamítnout',
    /** A reviewer's own submitted point, in place of „Schválit“. */
    ownPoint: 'Vlastní bod schvaluje jiný kontrolor nebo ředitel.',
    note: 'Poznámka pro autora',
    noteRequired: 'Napište prosím autorovi, co je potřeba.',
    noteTooLong: `Poznámka může mít nejvýše ${POINT_LIMITS.note}\u00a0znaků.`,
    /** Under the note: how long it is of the most it may be. */
    count: (n: number) => `${n} z\u00a0${POINT_LIMITS.note}\u00a0znaků`,
    phrasesLabel: 'Rychlé věty',
    /** Each press adds its sentence to the note. */
    phrases: [
      'Doplňte prosím vyjádření.',
      'Zkontrolujte prosím jména a\u00a0třídy.',
      'Zkraťte prosím text.',
      'Bod patří do jiné porady.',
    ],
    back: 'Zpět',
    /** Said once a decision went through, by the decision („Schválit a pokračovat“ is an approval). */
    said: {
      approve: 'Bod byl schválen.',
      return: 'Bod byl vrácen autorovi k\u00a0úpravě.',
      reject: 'Bod byl zamítnut.',
    } as const satisfies Record<ReviewDecision, string>,
  },
  /** A reviewer's edit of the point (design section 10): the author is told in the history. */
  edit: {
    open: 'Upravit',
    label: 'Úprava bodu',
    save: 'Uložit úpravy',
    cancel: 'Zrušit úpravy',
    /** Said once an edit went through, or when there was nothing to save. */
    saved: 'Úpravy byly uloženy.',
    unchanged: 'Nic se nezměnilo, nebylo co uložit.',
  },
  /** The card on the Přehled, for reviewers. */
  card: {
    title: 'Kontrola',
    waiting: (n: number) => `Ke kontrole: ${n}`,
  },
} as const;
