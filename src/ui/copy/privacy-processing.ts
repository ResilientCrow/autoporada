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
              'jméno, e-mail, pracovní zařazení a\u00A0oddělení, role v\u00A0Autoporadě, zda jde o\u00A0studenta, stav účtu a\u00A0nastavení upozornění',
          },
          {
            term: 'Žádosti o\u00A0přístup',
            value: 'jméno a\u00A0důvod, který v\u00A0žádosti uvedete',
          },
          {
            term: 'Přihlášení',
            value: 'jen otisk přihlašovacího kódu a\u00A0čas přihlášení, ne kód samotný',
          },
          {
            term: 'Body k\u00A0poradě',
            value:
              'jména, tituly, třídy nebo funkce lidí, včetně nezletilých studentů, a\u00A0jejich vyjádření',
          },
          { term: 'Porady', value: 'přítomní a\u00A0hosté porady' },
          {
            term: 'Seznamy studentů',
            value: 'jméno a\u00A0třída, pro přílohy dokumentu porady',
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
          'ze školního adresáře Microsoft: vyhledáváme podle jména a\u00A0Autoporada si pamatuje jen osoby, které někdo vybral,',
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
          'Přispěvatelé vidí své body a\u00A0schválené akce.',
          'Kontroloři a\u00A0ředitel vidí podklady k\u00A0poradě.',
          'Studenti nikdy nevidí registr ani archiv.',
        ],
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
