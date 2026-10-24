/** „Žádost o přístup“: one text per state of the person's standing. */
export const access = {
  title: 'Žádost o\u00A0přístup',
  member: {
    title: 'Přístup už máte',
    overview: 'Přejít na přehled',
  },
  open: {
    title: 'Požádejte o\u00A0přístup',
    text: 'Podklady k\u00A0poradě mohou posílat jen schválení uživatelé. Napište vedení školy, proč přístup potřebujete.',
    previousCancelled: 'Předchozí žádost byla zrušena.',
    previousRejected: 'Předchozí žádost byla zamítnuta. Nyní lze podat novou.',
    reason: {
      label: 'Důvod žádosti',
      description: `Například: jsem třídní učitelka 2.A a\u00A0chci posílat zprávy o\u00A0akcích třídy. Nejvýše 1\u00A0000\u00A0znaků.`,
      tooLong: `Zkraťte prosím důvod na nejvýše 1\u00A0000\u00A0znaků.`,
    },
    send: 'Odeslat žádost',
    note: 'Žádost uvidí jen vedení školy.',
  },
  pending: {
    title: 'Žádost čeká na rozhodnutí',
    sent: (date: string) => `Žádost byla odeslána ${date}.`,
    afterApproval: 'Po schválení vás Autoporada odhlásí; přihlaste se pak prosím znovu.',
    reason: 'Váš důvod',
    cancel: 'Zrušit žádost',
    cancelHint: 'Žádost lze kdykoli podat znovu.',
  },
  cooldown: {
    title: 'Žádost byla zamítnuta',
    text: (decided: string, from: string) =>
      `Vedení školy žádost zamítlo ${decided}. Novou žádost lze podat od ${from}. Pokud jde podle vás o\u00A0omyl, obraťte se přímo na vedení školy.`,
  },
  blocked: {
    title: 'Další žádosti nelze podat',
    text: 'Pokud přístup potřebujete, obraťte se prosím přímo na vedení školy.',
  },
  said: {
    sent: 'Žádost byla odeslána. Čeká na rozhodnutí vedení školy.',
    cancelled: 'Žádost byla zrušena.',
  },
} as const;
