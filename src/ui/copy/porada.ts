import { countWord, type PluralForms } from '@/domain/cs';

const POINT: PluralForms = { one: 'bod', few: 'body', many: 'bodů' };
const NAME: PluralForms = { one: 'jméno', few: 'jména', many: 'jmen' };

/** „Porada“: where the headmaster prepares the weekly meeting and its document. */
export const porada = {
  title: 'Porada',
  none: {
    title: 'Žádná porada k\u00a0přípravě',
    text: 'V\u00a0kalendáři teď není žádná porada, kterou by bylo třeba připravit.',
  },
  /** `meeting` arrives written, „pondělí 9. listopadu 2026“. */
  meeting: (meeting: string) => `Porada se koná ${meeting}`,
  /** `monday` arrives written, „2.\u00a011.“. */
  moved: (monday: string) => `Přesunuto z\u00a0pondělí ${monday}`,
  deadline: {
    ahead: (weekday: string, date: string, time: string) =>
      `Uzávěrka: ${weekday} ${date} v\u00a0${time}`,
    passed: (weekday: string, date: string, time: string) =>
      `Uzávěrka proběhla: ${weekday} ${date} v\u00a0${time}`,
  },
  counts: {
    title: 'Co čeká na tuto poradu',
    waiting: (n: number) => `Ke kontrole: ${countWord(n, POINT)}`,
    returned: (n: number) => `Vráceno autorům: ${countWord(n, POINT)}`,
    approved: (n: number) => `Schváleno: ${countWord(n, POINT)}`,
    later: (n: number) => `Zprávy čekající na konec akce: ${n}`,
  },
  steps: {
    title: 'Příprava dokumentu',
    details: 'Údaje',
    outline: 'Pokyny a\u00a0hospodaření',
    annex2: 'Příloha\u00a02',
    preview: 'Náhled',
  },
  generate: { button: 'Vygenerovat', later: 'Generování přijde v\u00a0další verzi.' },
  skip: {
    title: 'Porada se nekoná',
    /** `next` arrives written, „10. 11. 2026“. */
    afterDeadline: (next: string) =>
      `Uzávěrka už proběhla; schválené body se přesunou na poradu ${next}.`,
    noNext: 'Uzávěrka už proběhla a\u00a0po této poradě žádná další není v\u00a0kalendáři.',
    kept: (next: string) => `Body odevzdané během zrušení zůstávají na poradě ${next}.`,
  },
  preview: {
    title: 'Náhled',
    back: 'Zpět na přípravu porady',
    paper: 'Náhled dokumentu',
    invalid: 'Dokument teď nelze sestavit. Příčiny jsou v\u00a0seznamu výše.',
  },
  preflight: {
    title: 'Před vygenerováním',
    none: 'Nic nebrání vygenerování a nic nestojí za kontrolu.',
    level: {
      block: 'Brání vygenerování',
      warn: 'Stojí za kontrolu',
      info: 'Pro informaci',
    },
    code: {
      'issue-not-open': 'Porada se nekoná nebo už je vygenerovaná.',
      'snapshot-invalid': 'Údaje nesplňují požadavky šablony. Chybí nebo nesedí:',
      'report-incomplete': 'Zpráva je neúplná a\u00a0v\u00a0dokumentu chybí:',
      'points-waiting': 'Body čekají na kontrolu a\u00a0v\u00a0dokumentu zatím nejsou:',
      'points-returned': 'Body jsou vrácené autorům a\u00a0v\u00a0dokumentu zatím nejsou:',
      'akce-waiting': 'Akce čekají na kontrolu a\u00a0v\u00a0dokumentu zatím nejsou:',
      'proposal-dropped':
        'Návrhy zařazené v\u00a0pokynech už nejsou schválené, a\u00a0proto se z\u00a0dokumentu vynechaly:',
      'deadline-ahead': 'Uzávěrka ještě neproběhla, body mohou ještě přibýt.',
      'source-not-generated':
        'Pokyny se převzaly z\u00a0porady, která se nevygenerovala ani neodpadla. Jednorázové body a\u00a0ohlasy se do nich nepřenesly.',
      'annex1-empty': 'Seznam pro Přílohu\u00a01 je prázdný.',
      'reports-later': 'Tyto zprávy čekají na konec akce a\u00a0do dokumentu zatím nejdou:',
      'ohlasy-empty':
        'Ohlasy v\u00a0médiích i\u00a0partneři jsou prázdní, v\u00a0dokumentu nebudou.',
      'meeting-moved': 'Porada se nekoná v\u00a0pondělí, ale v\u00a0jiný den.',
    },
    /** `registry-new`: how many entries the document marks NOVÉ. */
    newEntries: (n: number) => `Označeno NOVÉ bude ${countWord(n, NAME)}.`,
  },
} as const;
