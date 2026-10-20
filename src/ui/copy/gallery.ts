export const gallery = {
  title: 'Vzorník',
  intro:
    'Tato stránka existuje jen ve vývoji a\u00A0v\u00A0testech. Ukazuje části, které žádná skutečná stránka nepoužívá.',
  errorPage: 'Ukázat chybovou stránku',
  statuses: {
    title: 'Stavy',
    neutral: 'Koncept',
    waiting: 'Odesláno',
    done: 'Schváleno',
    attention: 'Vráceno',
    stopped: 'Zamítnuto',
  },
  buttons: {
    title: 'Tlačítka',
    primary: 'Hlavní akce',
    secondary: 'Vedlejší akce',
    disabled: 'Nedostupná akce',
    pending: 'Odesílá se',
    onDark: 'Na tmavém pozadí',
  },
  notices: {
    title: 'Oznámení',
    info: 'Změny se ukládají průběžně.',
    problem: 'Zprávu se nepodařilo odeslat.',
  },
  forms: {
    title: 'Formulář',
    submit: 'Odeslat',
    plain: {
      name: 'Jméno',
      nickname: 'Přezdívka',
      nicknameHint: 'Zobrazí se ostatním žákům.',
      reason: 'Důvod žádosti',
    },
    failed: {
      name: 'Jméno',
      reason: 'Důvod žádosti',
      reasonTooLong: 'Důvod je delší, než je povoleno.',
    },
  },
} as const;
