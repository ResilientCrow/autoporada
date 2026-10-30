import { POINT_LIMITS } from '@/domain/report';

/** „Typy bodů“: where the headmaster edits what each kind of point offers. */
export const pointTypes = {
  title: 'Typy bodů',
  intro:
    'Typ určuje, jaké odrážky bod nabízí předem a\u00A0jak se skloňuje úvodní věta bodu. Odrážky se do bodu zkopírují při jeho založení. Rozepsané body si ponechají své odrážky, ale\u00A0povinnost odrážky, organizátory a\u00A0rod názvu v\u00A0úvodní větě berou vždy z\u00A0aktuálního typu. Uložená odrážka si ponechá svůj druh.',
  list: { title: 'Existující typy', off: 'vypnutý', empty: 'Zatím není žádný typ.' },
  create: { title: 'Nový typ', save: 'Přidat typ' },
  save: 'Uložit typ',
  locked: 'Tento typ je vždy zapnutý.',
  said: {
    created: 'Typ je přidán.',
    changed: 'Typ je uložen.',
    unchanged: 'Nic se nezměnilo.',
  },
  fields: {
    name: {
      label: 'Název',
      tooLong: `Název může mít nejvýše ${POINT_LIMITS.typeName}\u00A0znaků.`,
    },
    titleGender: {
      label: 'Rod názvu',
      description: 'Podle něj se ohýbá úvodní věta bodu („proběhl“, „proběhla“ …).',
      options: {
        none: 'Neurčeno (věta začne slovem „akce“)',
        m: 'Mužský rod (proběhl)',
        f: 'Ženský rod (proběhla)',
        n: 'Střední rod (proběhlo)',
        pl: 'Množné číslo (proběhly)',
        npl: 'Střední rod v\u00A0množném čísle (proběhla)',
      },
    },
    position: {
      label: 'Pořadí',
      description: 'Číslo od 1 do 999; prázdné pole zařadí typ na konec.',
      descriptionSaved: 'Číslo od 1 do 999; prázdné pole ponechá typ na jeho místě.',
    },
    active: { label: 'Nabízet při zakládání bodu' },
  },
  bullets: {
    title: 'Odrážky',
    empty: 'Typ zatím nenabízí žádnou odrážku.',
    add: 'Přidat odrážku',
    remove: (n: number) => `Odebrat odrážku ${n}`,
    row: (n: number) => `Odrážka ${n}`,
    label: 'název',
    kind: 'druh',
    kinds: { people: 'Lidé', text: 'Text' },
    kindFixed: (kind: string) => `Druh: ${kind} (u\u00A0uložené odrážky se nemění)`,
    required: 'povinná',
    organisers: 'určuje organizátory v\u00A0úvodní větě',
    tooMany: `Odrážek může být nejvýše ${POINT_LIMITS.bullets}.`,
    invalid: 'Jen jedna odrážka smí určovat organizátory.',
  },
} as const;
