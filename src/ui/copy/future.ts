import type { FutureKind } from '@/domain/calendar';
import type { ResponsibleVerb } from '@/domain/cs';
import type { FutureState } from '@/domain/review';

import { rules } from './forms';

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
  /** The link on the list, the page heading and the tab title of /akce/novy. */
  new: 'Nová akce',
  empty: 'Zatím tu nejsou žádné akce.',
  older: 'Starší akce',
  back: 'Všechny akce',
  facts: {
    when: 'Kdy',
    responsible: 'Zajišťují',
    expectsReport: 'Zpráva do porady',
    expectsReportYes: 'Po akci bude následovat zpráva do porady.',
  },
  /** /akce/novy: what to start. */
  chooser: {
    legend: 'Co chcete přidat?',
    start: 'Začít',
    required: 'Vyberte, co chcete přidat.',
    invalid: 'Tuto možnost nelze použít. Vyberte jinou.',
  },
  /** The editor of an item (design section 12); the labels it shares with a point are `points.facts`. */
  editor: {
    type: 'Druh',
    responsible: {
      legend: 'Kdo to zajišťuje',
      hint: 'Uveďte vyučující, kteří akci zajišťují.',
      verb: 'Jak se podílejí',
      behalfOf: 'Za koho',
      behalfOfHint: 'například 8.\u00A0A\u00A0nebo předmětová komise',
      people: 'Vyučující',
      add: 'Přidat vyučujícího',
      list: 'Vyučující, kteří akci zajišťují',
      verbs: {
        organizuje: 'Organizují',
        koordinuje: 'Koordinují',
        zajišťuje: 'Zajišťují',
        vede: 'Vedou',
      } as const satisfies Record<ResponsibleVerb, string>,
    },
    expectsReport: 'Po akci bude následovat zpráva do porady',
    submit: 'Odeslat ke kontrole',
    /** An approved akce is not autosaved: one press hands the change in. */
    revise: 'Uložit změny',
    reviseNotice: 'Po úpravě akce zmizí z\u00A0přehledu, dokud ji kontrola znovu neschválí.',
    retract: { button: 'Stáhnout', hint: 'Položka se vrátí mezi rozpracované.' },
    /** The locked banner of this editor. */
    locked: rules['future-not-editable'],
    endBeforeStart: 'Datum konce nesmí být před datem začátku.',
    endWithoutStart: 'Vyplňte také datum začátku.',
    timeTo: 'Čas do musí být později než čas od.',
    tooMany: 'Je tu příliš mnoho vyučujících.',
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
