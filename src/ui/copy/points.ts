import type { Campus } from '@/domain/cs';
import type { PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';

/** „Body“: starting a point and the header and values of one point. */
export const points = {
  title: {
    new: 'Nový bod',
    point: 'Bod',
  },
  chooser: {
    legend: 'Typ bodu',
    start: 'Začít',
    required: 'Vyberte typ bodu.',
    invalid: 'Tento typ už není v\u00A0nabídce. Vyberte jiný.',
  },
  untitled: 'Bez názvu',
  kind: {
    report: 'Zpráva',
    finance: 'Hospodaření',
    pokyn: 'Pokyn',
  } as const satisfies Record<PointKind, string>,
  /** One label per state, singular: it names the point, not a list. */
  state: {
    draft: 'Rozpracovaný',
    submitted: 'Čeká na kontrolu',
    returned: 'Vrácený k\u00A0úpravě',
    approved: 'Schválený',
    rejected: 'Zamítnutý',
    withdrawn: 'Zrušený',
    published: 'Zařazený do porady',
  } as const satisfies Record<PointState, string>,
  campus: {
    smichov: 'Šmíchov',
    radlice: 'Radlice',
    'na-vidouli': 'Na Vidouli',
    jinde: 'Jinde',
  } as const satisfies Record<Campus, string>,
  facts: {
    eventDate: 'Datum začátku',
    endDate: 'Datum konce',
    timeFrom: 'Čas od',
    timeTo: 'Čas do',
    campus: 'Areál',
    place: 'Místo',
    none: 'Zatím bez údajů.',
  },
} as const;
