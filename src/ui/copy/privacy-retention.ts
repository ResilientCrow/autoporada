import { PRIVACY_FACTS as facts } from './privacy-facts';
import type { Section } from './privacy-types';

/** How long, which cookies, your rights, the complaint, and what is left to say. */
export const retentionSections = [
  {
    id: 'doba',
    title: 'Jak dlouho údaje uchováváme',
    blocks: [
      {
        kind: 'facts',
        review: {
          by: 'dpo',
          note: 'Ověřit dobu uchování záloh, kopií e-mailů, účtů a\u00A0archivních seznamů.',
        },
        rows: [
          {
            term: 'Přihlášení',
            value: `skončí po ${facts.sessionIdleHours}\u00A0hodinách bez činnosti, nejpozději po ${facts.sessionMaxHours}\u00A0hodinách`,
          },
          {
            term: 'Probíhající přihlášení',
            value: `${facts.signInMinutes}\u00A0minut`,
          },
          {
            term: 'Porady, schválené a\u00A0zveřejněné body, vytvořené dokumenty',
            value: 'trvale, jako archiv porad',
            review: {
              by: 'dpo',
              note: 'Ověřit trvalé uchování podle spisového a\u00A0skartačního plánu.',
            },
          },
          {
            term: 'Koncepty, vrácené, zamítnuté a\u00A0stažené body',
            value: 'smažeme 1.\u00A0září, na\u00A0konci školního roku',
          },
          {
            term: 'Schválené, zamítnuté a\u00A0zrušené žádosti o\u00A0přístup',
            value: 'smažeme 1.\u00A0září, na\u00A0konci školního roku',
          },
          {
            term: 'Čekající žádosti o\u00A0přístup',
            value: 'do rozhodnutí vedení školy',
          },
          {
            term: 'Zablokované žádosti o\u00A0přístup',
            value: 'bez časového omezení, aby blokace platila',
            review: { by: 'dpo', note: 'Ověřit dobu uchování zablokovaných žádostí.' },
          },
          { term: 'Záznam změn', value: `${facts.auditYears}\u00A0roky` },
          {
            term: 'Technické záznamy',
            value: `v\u00A0záznamech serveru; jejich rozsah omezuje velikost (${facts.logMegabytes}\u00A0MB, nejvýše ${facts.logFiles}\u00A0souborů na\u00A0službu), ne čas`,
            review: { by: 'dpo', note: 'Ověřit dobu uchování technických záznamů.' },
          },
        ],
      },
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies',
    blocks: [
      { kind: 'p', text: 'Autoporada sama ukládá jen tyto dvě cookies:' },
      {
        kind: 'facts',
        rows: [
          {
            term: facts.sessionCookie,
            value: `díky ní zůstáváte přihlášeni. Zanikne zavřením prohlížeče; server přihlášení ukončí po ${facts.sessionIdleHours}\u00A0hodinách bez činnosti, nejpozději po ${facts.sessionMaxHours}\u00A0hodinách.`,
          },
          {
            term: facts.signInCookie,
            value: `patří k\u00A0právě probíhajícímu přihlášení a\u00A0platí ${facts.signInMinutes}\u00A0minut.`,
          },
        ],
      },
      {
        kind: 'p',
        text: 'Jsou to jen technické cookies, bez kterých přihlášení nefunguje. Proto nepotřebují váš souhlas a\u00A0nezobrazujeme lištu s\u00A0jejich výběrem. V\u00A0prohlížeči neukládáme nic jiného.',
      },
      {
        kind: 'p',
        text: 'Přihlašovací stránka Microsoftu používá vlastní cookies podle smlouvy školy.',
        review: { by: 'dpo', note: 'Ověřit znění o\u00A0cookies Microsoftu.' },
      },
    ],
  },
  {
    id: 'prava',
    title: 'Vaše práva',
    blocks: [
      { kind: 'p', text: 'Můžete se na\u00A0školu obrátit s\u00A0těmito požadavky:' },
      {
        kind: 'list',
        items: [
          'zjistit, jaké údaje o\u00A0vás máme (čl.\u00A015),',
          'nechat opravit nepřesné údaje (čl.\u00A016),',
          'nechat údaje smazat (čl.\u00A017); někdy to nejde, protože škola musí údaje uchovat pro svůj úkol ve\u00A0veřejném zájmu,',
          'omezit zpracování (čl.\u00A018),',
          'vznést námitku proti zpracování (čl.\u00A021).',
        ],
      },
      {
        kind: 'p',
        text: 'Přenositelnost údajů se u\u00A0nás neuplatní (čl.\u00A020 odst.\u00A03). Škola odpoví do\u00A0jednoho měsíce. Požádat můžete školu nebo pověřence.',
        review: { by: 'dpo', note: 'Ověřit, jak se žádosti podávají.' },
      },
    ],
  },
  {
    id: 'stiznost',
    title: 'Kam se můžete stěžovat',
    blocks: [
      {
        kind: 'p',
        text: 'Pokud si myslíte, že s\u00A0vašimi údaji zacházíme špatně, můžete podat stížnost u\u00A0úřadu, který na\u00A0ochranu údajů dohlíží.',
      },
      {
        kind: 'facts',
        rows: [
          { term: 'Úřad', value: 'Úřad pro ochranu osobních údajů' },
          { term: 'Adresa', value: 'Pplk. Sochora 27, 170\u00A000 Praha 7' },
          { term: 'Datová schránka', value: 'qkbaa2n' },
          { term: 'E-mail', value: 'posta@uoou.gov.cz' },
          {
            term: 'Web',
            value: [{ text: 'uoou.gov.cz', href: 'https://uoou.gov.cz' }],
          },
        ],
      },
    ],
  },
  {
    id: 'rozhodovani',
    title: 'Automatizované rozhodování',
    blocks: [
      {
        kind: 'p',
        text: 'Nic se o\u00A0vás nerozhoduje automaticky. Každý bod kontroluje člověk a\u00A0o\u00A0změně role také rozhoduje člověk.',
      },
    ],
  },
  {
    id: 'povinnost',
    title: 'Musíte údaje poskytnout?',
    blocks: [
      {
        kind: 'p',
        text: 'Žádný zákon vám neukládá, abyste Autoporadu používali. Bez přihlášení ji ale používat nelze.',
        review: { by: 'headmaster', note: 'Ověřit, zda lze podklady posílat i\u00A0jinou cestou.' },
      },
    ],
  },
  {
    id: 'zmeny',
    title: 'Změny a\u00A0účinnost',
    blocks: [
      {
        kind: 'p',
        text: [
          'Toto oznámení se může změnit. Aktuální znění najdete vždy na\u00A0této stránce. Další zpracování údajů ve škole popisují ',
          { text: 'Podmínky GDPR', href: 'https://ssps.cz/skola/kontakt/gdpr/' },
          ' na\u00A0stránkách školy.',
        ],
        review: { by: 'dpo', note: 'Stanovit datum účinnosti.' },
      },
    ],
  },
] as const satisfies readonly Section[];
