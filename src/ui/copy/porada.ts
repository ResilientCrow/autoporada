import { countWord, type PluralForms } from '@/domain/cs';

const POINT: PluralForms = { one: 'bod', few: 'body', many: 'bodů' };

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
} as const;
