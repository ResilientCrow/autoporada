import type { FutureKind } from '@/domain/calendar';
import type { FutureState } from '@/domain/review';

/** What an item of the overview does in the porada on one Monday; see `placement.ts`. */
export type StripSlot = 'meetings' | 'events' | 'later' | 'hidden' | 'skipped';

/** „Akce“: the jednání and akce of the school (design section 12), listed and read here. */
export const future = {
  title: 'Akce',
  /** The tab title of one item; never its own title, which can name people. */
  item: 'Položka přehledu',
  kind: {
    jednani: 'Jednání',
    akce: 'Akce',
  } as const satisfies Record<FutureKind, string>,
  /** One label for either kind, so it carries no gender. */
  state: {
    draft: 'Rozpracováno',
    submitted: 'Čeká na kontrolu',
    returned: 'Vráceno k\u00A0úpravě',
    approved: 'Schváleno',
    rejected: 'Zamítnuto',
    withdrawn: 'Staženo',
    cancelled: 'Zrušeno',
  } as const satisfies Record<FutureState, string>,
  empty: 'Zatím tu nejsou žádné akce.',
  older: 'Starší akce',
  back: 'Všechny akce',
  facts: {
    when: 'Kdy',
    responsible: 'Zajišťují',
    expectsReport: 'Zpráva do porady',
    expectsReportYes: 'Po akci bude následovat zpráva do porady.',
  },
  /** Where the item lands in the overview of the next porady (design section 12). */
  strip: {
    title: 'Kde bude v\u00A0přehledu',
    /** What follows „16.\u00A03.: “ for each Monday. */
    slot: {
      meetings: 'v\u00A0přehledu jednání',
      events: 'v\u00A0přehledu akcí',
      later: 'mezi dalšími známými akcemi',
      hidden: 'už ne',
      skipped: 'porada se nekoná',
    } as const satisfies Record<StripSlot, string>,
  },
} as const;
