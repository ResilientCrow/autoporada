import type { PrivacyCopy } from './privacy-types';

/**
 * Plain Czech for readers from 15 years up (GDPR Art. 12). Anything the code
 * does not prove carries a `review` task for the pověřenec or the school's
 * leadership; the notice stays a draft until both sign it off.
 */
export const privacy = {
  approved: false,
  effectiveFrom: null,
  title: 'Ochrana osobních údajů',
  draft:
    'Toto je návrh. Čeká na schválení pověřencem pro ochranu osobních údajů a\u00A0vedením školy. Části označené „K\u00A0ověření“ čekají na potvrzení.',
  summaryTitle: 'Stručně',
  summary: [
    'Autoporada slouží k\u00A0přípravě podkladů pro poradu vedení školy. Zaměstnanci a\u00A0studenti v\u00A0ní píší zprávy o\u00A0akcích a\u00A0další body.',
    'Ukládáme jméno, e-mail a\u00A0zařazení ve škole těch, kdo se přihlásí. Ukládáme také text bodů, včetně jmen a\u00A0vyjádření lidí, kterých se body týkají.',
    'Údaje jsou na\u00A0serveru, který spravuje škola. Microsoft používáme k\u00A0přihlášení a\u00A0k\u00A0e-mailům.',
    'Rozpracované a\u00A0zamítnuté body mažeme na\u00A0konci školního roku. Schválené body patří do\u00A0archivu porad.',
    'Můžete se zeptat, jaké údaje o\u00A0vás máme, a\u00A0požádat o\u00A0opravu. Obraťte se na\u00A0školu nebo na\u00A0pověřence.',
  ],
  tocLabel: 'Obsah stránky',
  reviewLabel: 'K\u00A0ověření',
  reviewBy: {
    dpo: 'Ověří pověřenec:',
    headmaster: 'Ověří vedení školy:',
  },
  effectiveLabel: 'Účinné od',
  sections: [
    {
      id: 'spravce',
      title: 'Kdo vaše údaje zpracovává',
      blocks: [
        {
          kind: 'p',
          text: 'Správcem vašich údajů je škola. Správce rozhoduje, proč a\u00A0jak se údaje zpracovávají.',
        },
        {
          kind: 'facts',
          review: { by: 'dpo', note: 'Ověřit přesný název a\u00A0adresu správce.' },
          rows: [
            { term: 'Název', value: 'Smíchovská střední škola, příspěvková organizace' },
            { term: 'IČO', value: '61386855' },
            { term: 'Adresa', value: 'Preslova 72/25, Smíchov, 150\u00A000 Praha 5' },
            { term: 'Datová schránka', value: 'mgm3z73' },
            { term: 'E-mail', value: 'reditel@ssps.cz' },
            {
              term: 'Další údaje',
              value: [
                {
                  text: 'Povinně zveřejňované údaje',
                  href: 'https://ssps.cz/skola/kontakt/povinne-udaje/',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'poverenec',
      title: 'Pověřenec pro ochranu osobních údajů',
      blocks: [
        {
          kind: 'p',
          text: 'Pověřenec dohlíží na\u00A0to, aby škola zacházela s\u00A0údaji správně. Se\u00A0svými otázkami se na\u00A0něj můžete obrátit.',
        },
        {
          kind: 'facts',
          rows: [
            { term: 'Společnost', value: 'Moore Czech Republic s.r.o.' },
            {
              term: 'E-mail',
              value: 'gdpr@moore-czech.cz',
              review: { by: 'dpo', note: 'Ověřit kontaktní adresu pověřence.' },
            },
          ],
        },
      ],
    },
  ],
} as const satisfies PrivacyCopy;
