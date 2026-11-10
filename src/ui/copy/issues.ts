/** „Nejbližší porady“: the headmaster's strip on the Přehled. */
export const issues = {
  strip: {
    title: 'Nejbližší porady',
    unconfirmed: 'Potvrďte prosím změnu.',
    stale: 'Tato porada už není v\u00a0kalendáři. Načtěte prosím stránku.',
    /** The dialog beside the strip that adds a porada (ADR 0054 item 5). */
    add: {
      title: 'Přidat poradu',
      lead: 'Nová porada se koná v\u00a0den, který zvolíte. Každý týden má nejvýš jednu poradu.',
      day: 'Den porady',
      hint: 'Zvolte den od dneška, nejpozději v\u00a0okně kalendáře.',
      invalid: 'V\u00a0tento den porada být nemůže. Zvolte prosím jiný den.',
      /** `meeting` arrives written, „pondělí 9. listopadu 2026“; `closes` „sobota 7. 11. v 20:00“. */
      effect: (meeting: string, closes: string) => `Nová porada ${meeting}, uzávěrka ${closes}.`,
      closed: 'Uzávěrka už minula, body už odevzdat nepůjde.',
      /** Why the chosen day cannot be a porada's; dates arrive written, „6. 11. 2026“. */
      refused: {
        early: 'Zvolte den od dneška.',
        late: (last: string) => `Zvolte den nejpozději ${last}.`,
        'later-generated': 'Pozdější porada je už vygenerovaná, novou před ni přidat nelze.',
      },
      submit: 'Přidat poradu',
      cancel: 'Zrušit',
      /** `meeting` arrives written, „9. 11. 2026“. */
      said: (meeting: string) => `Porada ${meeting} je přidaná.`,
    },
  },
} as const;
