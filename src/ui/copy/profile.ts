/** „Profil“: what a signed-in user sets for themselves. */
export const profile = {
  title: 'Profil',
  reminders: {
    title: 'E-mailové připomínky',
    label: 'Posílat mi připomínky uzávěrky',
    description:
      'Týká se e-mailu dva dny před uzávěrkou porady, který dostávají ti, kdo v\u00A0tomto školním roce odeslali bod nebo akci. Upozornění v\u00A0den uzávěrky na rozepsaný nebo vrácený bod se posílá vždy.',
    save: 'Uložit',
    said: { changed: 'Nastavení je uloženo.', unchanged: 'Nic se nezměnilo.' },
  },
} as const;
