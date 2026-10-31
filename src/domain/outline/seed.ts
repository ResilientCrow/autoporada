import type { Indent, RichDoc } from '@/domain/richtext';

import type { Outline, OutlineRow, OutlineSection, SystemSlot } from './model';

/** One paragraph: its indent (0–3) and text; an empty text is an empty bullet to fill in. */
type Para = readonly [indent: Indent, text: string];

type SeedItem = readonly [
  lineage: number,
  slot: SystemSlot | null,
  title: string,
  body: readonly Para[],
];

/**
 * The blank template's standing content (ADR 0030): titles and the template's own texts, with no
 * names, quotes, media sample or registry entries. The lineage ids are fixed, so the history of an
 * item can be followed from the first issue on.
 */
const POKYNY: readonly SeedItem[] = [
  [1, 'meetings', 'Zatím známá jednání', []],
  [2, 'events', 'Zatím známé akce', []],
  [
    3,
    'talent',
    'Studenti v ředitelském „Programu na podporu talentovaných a aktivních studentů“',
    [
      [
        0,
        'Níže uvedení studenti byli zařazeni ředitelem školy do „Programu na podporu talentovaných a aktivních studentů“. Na níže uvedené studenty se nevztahuje pravidlo 75% docházky do výuky, studenti jsou však povinni aktivně a průběžně komunikovat s učiteli, učitelé jsou povinni jim vyjít vstříc při žádosti o domluvu na přezkoušení či dopsání testu.',
      ],
      [
        0,
        'Pokud někdo ze studentů má zájem být do programu zařazen, musí v novém školním roce {skolniRok} opět o toto požádat ředitele školy. V případě nezletilých studentů tak musí učinit jejich rodiče.',
      ],
    ],
  ],
  [
    4,
    'exemptions',
    'Uvolnění z výuky na základě odborných certifikátů či přezkoušení',
    [
      [
        0,
        'Níže jsou uvedeni studenti, kteří jsou uvolněni z výuky konkrétního předmětu pro školní rok {skolniRok} z důvodů vlastnictví patřičných mezinárodních certifikátů či přezkoušení, nově zařazení studenti oproti minulému týdnu jsou vždy označeni tučně.',
      ],
    ],
  ],
  [
    5,
    null,
    'Provozní pokyny pro zaměstnance a studenty',
    [
      [1, 'používání programu Techambition na výuku matematiky'],
      [2, ''],
      [1, 'nový event manager Next Zone Event Space a Ruby Hall'],
      [2, ''],
      [1, 'pokyny pro rezervaci a využití prostor Next Zone Event Space a Ruby Hall'],
      [2, ''],
      [3, ''],
      [2, ''],
      [1, 'nový vedoucí Inkubátoru startupů Coworkingového centra Smíchovské střední'],
      [2, ''],
      [1, 'správce Audio studia Mediálního domu Preslova v areálu Smíchova'],
      [2, ''],
      [3, 'kontakt:'],
      [1, 'správce 3D tiskáren na Smíchovské střední'],
      [2, ''],
      [3, 'kontakt:'],
      [1, 'pravidla účasti studentů a zaměstnanců na demonstracích či stávkách'],
      [2, ''],
      [1, 'zveřejňování grafických materiálů školy, včetně plakátů na školních televizích'],
      [2, ''],
      [1, 'postup při pořádání mimoškolních akcí'],
      [3, ''],
      [1, 'parkování na školním dvoře v areálu Smíchov:'],
      [2, ''],
      [1, 'hlášení závad zjištěných v prostorách areálu Smíchov'],
      [2, ''],
      [1, 'hlášení závad v areálech Radlice a Na Vidouli'],
      [2, ''],
    ],
  ],
  [6, null, 'Zapsané MVOP, OSE a zapsaná témata STP a MAP, výzva ředitele', []],
  [7, null, 'Přijímání studentů do MVOP a OSE, kontrola přihlášení', []],
  [8, null, 'Studentské a Maturitní projekty, kontrola přihlášení, konzultanti', []],
  [
    9,
    null,
    'Kritéria hodnocení učitelů, zadávání testů, domácích úkolů, doporučení na samostudium',
    [],
  ],
  [10, null, 'Výuka v oboru Hotelnictví v 1. ročníku, třída L1B v prvním ročníku', []],
  [11, 'media', 'Ohlasy Smíchovské střední či jejího ředitele v médiích', []],
  [12, 'partners', 'Ohlasy sociálních partnerů', []],
  [
    13,
    null,
    'Provozní pokyny k Hotelu Voyager – vedení hotelu a kontakty',
    [
      [1, 'vedení hotelu z řad studentů zajišťují:'],
      [2, ''],
      [1, 'požadavky a dotazy směřujte na příslušný e-mail:'],
      [2, ''],
    ],
  ],
];

const HOSPODARENI: readonly SeedItem[] = [[14, null, 'Hospodaření Hotelu Voyager', []]];

const lineageId = (n: number) => `0192f000-0000-7000-8000-${String(n).padStart(12, '0')}`;

function doc(paras: readonly Para[]): RichDoc {
  return {
    type: 'doc',
    content: paras.map(([indent, text]) => ({
      type: 'paragraph',
      attrs: { indent },
      ...(text && { content: [{ type: 'text', text }] }),
    })),
  };
}

function rows(section: OutlineSection, items: readonly SeedItem[]): OutlineRow[] {
  return items.map(([n, slot, title, body]) => ({
    lineageId: lineageId(n),
    section,
    slot,
    persistence: 'standing',
    title,
    body: doc(body),
    quotes: [],
    sourcePointId: null,
  }));
}

/** What the first issue starts with while no earlier issue has item rows. */
export const SEED_OUTLINE: Outline = {
  pokyny: rows('pokyny', POKYNY),
  hospodareni: rows('hospodareni', HOSPODARENI),
};
