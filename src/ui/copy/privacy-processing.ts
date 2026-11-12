import { PRIVACY_FACTS as facts } from './privacy-facts';
import type { Section } from './privacy-types';

/** Why, what, from where, to whom and where to: the middle of the notice. */
export const processingSections = [
  {
    id: 'ucely',
    title: 'Proč údaje zpracováváme',
    blocks: [
      { kind: 'p', text: 'Údaje používáme jen k\u00A0těmto účelům:' },
      {
        kind: 'list',
        items: [
          'přihlášení a\u00A0řízení přístupu,',
          'příprava podkladů pro poradu (body, akce, vyjádření, seznamy studentů),',
          'vytvoření a\u00A0archiv dokumentu porady (DOCX a\u00A0PDF),',
          'e-mailová upozornění a\u00A0připomínky,',
          'bezpečnost (omezení počtu pokusů, hledání chyb) a\u00A0záznam změn,',
          'zálohy.',
        ],
      },
      {
        kind: 'p',
        text: 'Důvodem je plnění úkolu ve veřejném zájmu, kterým je škola pověřena (čl.\u00A06 odst.\u00A01 písm.\u00A0e) GDPR). Zpracování proto nestojí na vašem souhlasu ani na oprávněném zájmu.',
        review: { by: 'dpo', note: 'Ověřit právní odkaz.' },
      },
    ],
  },
  {
    id: 'udaje',
    title: 'Jaké údaje zpracováváme',
    blocks: [
      {
        kind: 'facts',
        rows: [
          {
            term: 'Lidé, kteří se přihlásí',
            value:
              'jméno, e-mail, identifikátor účtu Microsoft, pracovní zařazení a\u00A0oddělení, role v\u00A0Autoporadě, zda jde o\u00A0studenta, stav účtu a\u00A0zda chcete e-mailovou připomínku uzávěrky',
          },
          {
            term: 'Žádosti o\u00A0přístup',
            value: 'jméno a\u00A0důvod, který v\u00A0žádosti uvedete',
          },
          {
            term: 'Přihlášení',
            value:
              'otisk přihlašovacího kódu (ne kód samotný), čas přihlášení, čas poslední činnosti a\u00A0časy, kdy přihlášení vyprší',
          },
          {
            term: 'Body k\u00A0poradě',
            value:
              'jména, tituly, třídy nebo funkce lidí, včetně nezletilých studentů, a\u00A0jejich vyjádření',
          },
          {
            term: 'Akce k\u00A0poradě',
            value:
              'název, termín, místo, organizátor, účastníci a\u00A0poznámka, jak je autor napsal (mohou obsahovat jména a\u00A0třídy lidí, i\u00A0nezletilých studentů), a\u00A0poznámka, kterou kontrola napíše autorovi',
          },
          {
            term: 'Postup bodu',
            value:
              'kdo bod odeslal, vrátil, schválil nebo zamítl a\u00A0kdy, a\u00A0poznámka, kterou kontrola napíše autorovi',
          },
          {
            term: 'Původní znění',
            value: 'když kontrola bod upraví, zůstane u\u00A0něj původní znění upravených polí',
            review: {
              by: 'dpo',
              note: 'Ověřit, že původní znění upravených polí smí zůstat u\u00A0bodu.',
            },
          },
          { term: 'Porady', value: 'přítomní a\u00A0hosté porady' },
          {
            term: 'Seznamy studentů',
            value:
              'jméno a\u00A0třída studentů, včetně nezletilých, pro přílohy a\u00A0seznamy v\u00A0dokumentu porady; seznamy vede ředitel',
            review: {
              by: 'dpo',
              note: 'Ověřit, že seznamy studentů smějí obsahovat jména nezletilých.',
            },
          },
          { term: 'Záznam změn', value: 'kdo, co a\u00A0kdy změnil' },
          {
            term: 'Technické záznamy',
            value:
              'IP adresa, čas a\u00A0adresa požadavku, identifikátor požadavku, údaje o\u00A0prohlížeči',
            review: { by: 'dpo', note: 'Ověřit rozsah technických záznamů.' },
          },
        ],
      },
      {
        kind: 'p',
        text: 'Dříve použité osoby vám Autoporada nabízí jen z\u00A0vašich vlastních bodů. Tuto nabídku vidíte jen vy a\u00A0Autoporada pro ni nevede žádný zvláštní seznam.',
      },
      {
        kind: 'p',
        text: 'Lidé zmínění v\u00A0bodech se do Autoporady nepřihlašují. Údaje o\u00A0nich zadávají jiní lidé.',
        review: { by: 'dpo', note: 'Ověřit informace pro lidi, kteří se nepřihlašují.' },
      },
      {
        kind: 'p',
        text: 'Seznamy studentů obsahují jen jméno a\u00A0třídu, žádné důvody.',
        review: {
          by: 'dpo',
          note: 'Ověřit, že seznamy uvolnění z\u00A0výuky neuvádějí důvody.',
        },
      },
    ],
  },
  {
    id: 'zdroje',
    title: 'Odkud údaje máme',
    blocks: [
      {
        kind: 'list',
        items: [
          'od vás,',
          `ze školního adresáře Microsoft, když je vyhledávání zapnuté: posíláme jen hledaný text (nejméně ${facts.directoryMinQuery}\u00A0znaky), ukazujeme nejvýše ${facts.directoryHits}\u00A0osob a\u00A0do bodu se uloží jen jméno vybrané osoby a\u00A0identifikátor jejího účtu,`,
          'od kolegů, kteří píší body,',
          'ze seznamů, které vede vedení školy.',
        ],
      },
    ],
  },
  {
    id: 'prijemci',
    title: 'Kdo údaje vidí',
    blocks: [
      {
        kind: 'list',
        items: [
          'Přispěvatelé vidí své body a\u00A0poznámky kontroly k\u00A0nim.',
          'Rozepsaný koncept vidí jen autor.',
          'Studenti nikdy nevidí registr ani archiv.',
        ],
      },
      {
        kind: 'p',
        text: 'Kontroloři a\u00A0ředitel vidí body od chvíle, kdy je autor odešle, a\u00A0podklady k\u00A0poradě. Když autor odeslání stáhne, je to zase jen jeho koncept.',
      },
      {
        kind: 'p',
        text: 'Vrácený bod vidí kontroloři a\u00A0ředitel dál, i\u00A0když ho autor znovu upravuje a\u00A0průběžně ukládá, a\u00A0vidí ho i\u00A0po zrušení bodu.',
        review: {
          by: 'dpo',
          note: 'Ověřit, že kontroloři a\u00A0ředitel smějí číst vrácený bod, který autor dál upravuje.',
        },
      },
      {
        kind: 'p',
        text: 'Schválené akce vidí všichni přihlášení, i\u00A0studenti, a\u00A0to včetně organizátora, účastníků a\u00A0poznámky tak, jak je autor napsal. V\u00A0dokumentu porady se tisknou stejně.',
        review: {
          by: 'dpo',
          note: 'Ověřit, že studenti smějí vidět organizátora, účastníky a\u00A0poznámku u\u00A0schválených akcí, včetně jmen a\u00A0tříd nezletilých studentů.',
        },
      },
      {
        kind: 'p',
        text: 'Seznamy studentů upravuje ředitel. Kontroloři, kteří jsou zaměstnanci školy, je vidí také, na\u00A0stránce seznamů i\u00A0v\u00A0náhledu dokumentu porady.',
        review: {
          by: 'dpo',
          note: 'Ověřit, že kontroloři smějí vidět jména studentů v\u00A0seznamech a\u00A0v\u00A0náhledu dokumentu.',
        },
      },
      {
        kind: 'p',
        text: 'Údaje dál zpracovávají tito příjemci:',
      },
      {
        kind: 'list',
        items: [
          'Microsoft jako zpracovatel školy: přihlášení, vyhledávání ve školním adresáři a\u00A0odesílání e-mailů z\u00A0adresy autoporada@ssps.cz,',
          'IT školy, které spravuje server,',
          'šifrované zálohy, které jsou mimo server.',
        ],
        review: { by: 'dpo', note: 'Ověřit, kde budou uložené zálohy.' },
      },
      {
        kind: 'p',
        text: 'Dokument porady dostávají osoby, kterým ho vedení školy předá.',
        review: { by: 'headmaster', note: 'Ověřit, komu se dokument porady předává.' },
      },
      {
        kind: 'p',
        text: 'Nepoužíváme žádnou analytiku ani skripty z\u00A0cizích služeb.',
      },
    ],
  },
  {
    id: 'ulozeni',
    title: 'Kde jsou údaje uložené',
    blocks: [
      {
        kind: 'p',
        text: 'Údaje jsou na serveru, který spravuje škola.',
        review: { by: 'headmaster', note: 'Ověřit umístění serveru.' },
      },
      {
        kind: 'p',
        text: 'Zálohy jsou šifrované a\u00A0jejich kopie je mimo server. Microsoft zpracovává údaje podle smlouvy se školou.',
        review: { by: 'dpo', note: 'Ověřit znění o\u00A0předávání údajů mimo EU.' },
      },
    ],
  },
] as const satisfies readonly Section[];
