import { describe, expect, it } from 'vitest';

import { snapshotFixture } from '../../../test/support/snapshots';
import type { Block, DocumentModel } from '../model';
import { composeDocument } from './index';

const NB = '\u00A0';
const replica = composeDocument(snapshotFixture('template-replica'));

const allBlocks = (m: DocumentModel) => m.sections.flatMap((s) => s.blocks);
const text = (b: Block): string => {
  switch (b.kind) {
    case 'body':
    case 'bullet':
    case 'rich':
      return b.runs.map((r) => r.text).join('');
    case 'reportLine':
    case 'dash':
      return `${b.label}${b.runs.map((r) => r.text).join('')}`;
    case 'partner':
      return `${b.label} ${b.quote}`;
    case 'label':
      return `${b.label} ${b.text}`;
    case 'closing':
      return `${b.place} / ${b.signature}`;
    case 'studentTable':
      return b.rows.map((r) => `${r.name}|${r.classCode}${r.isNew ? '*' : ''}`).join(', ');
    case 'spacer':
    case 'pageBreak':
      return '';
    case 'title':
    case 'section':
    case 'point':
    case 'annex':
    case 'annexTitle':
      return b.text;
  }
};
/** The blocks following point `n` up to the next point. */
function pointContent(model: DocumentModel, n: number): Block[] {
  const blocks = allBlocks(model);
  const start = blocks.findIndex((b) => b.kind === 'point' && b.number === n);
  const end = blocks.findIndex(
    (b, i) => i > start && (b.kind === 'point' || b.kind === 'section' || b.kind === 'closing'),
  );
  return blocks.slice(start + 1, end).filter((b) => b.kind !== 'spacer');
}

describe('composeDocument on the template replica', () => {
  it('numbers the points exactly as the template does, straight through all sections', () => {
    const points = allBlocks(replica).flatMap((b) =>
      b.kind === 'point' ? [`${b.number}) ${b.text}`] : [],
    );
    expect(points.map((p) => p.replaceAll(NB, ' '))).toEqual([
      '1) Zatím známá jednání v týdnu od 12. října do 19. října 2026',
      '2) Zatím známé akce v týdnech od 12. října do 26. října 2026',
      '3) Studenti v ředitelském „Programu na podporu talentovaných a aktivních studentů“',
      '4) Uvolnění z výuky na základě odborných certifikátů či přezkoušení',
      '5) Provozní pokyny pro zaměstnance a studenty',
      '6) Zapsané MVOP, OSE a zapsaná témata STP a MAP, výzva ředitele',
      '7) Přijímání studentů do MVOP a OSE, kontrola přihlášení',
      '8) Studentské a Maturitní projekty, kontrola přihlášení, konzultanti',
      '9) Kritéria hodnocení učitelů, zadávání testů, domácích úkolů, doporučení na samostudium',
      '10) Výuka v oboru Hotelnictví v 1. ročníku, třída L1B v prvním ročníku',
      '11) Ohlasy Smíchovské střední či jejího ředitele v médiích',
      '12) Ohlasy sociálních partnerů',
      '13) Provozní pokyny k Hotelu Voyager – vedení hotelu a kontakty',
      '14) Hospodaření Hotelu Voyager',
      '15) Seminář Matika Česku',
      '16) Vesmírný seminář',
      '17) Další doposud známé akce školy',
    ]);
  });

  it('opens with the title, attendees and the first big section, spaced like the template', () => {
    const head = allBlocks(replica)
      .slice(0, 9)
      .map((b) => `${b.kind}:${text(b)}`.replaceAll(NB, ' '));
    expect(head).toEqual([
      'title:PORADA VEDENÍ ŠKOLY – pondělí 12. října 2026',
      'spacer:',
      'spacer:',
      'label:Přítomni: Mgr. Jan Novák, Ing. Petra Svobodová, Mgr. Tomáš Veselý',
      'label:Hosté: Ing. Karel Dvořák (Next Zone)',
      'spacer:',
      'section:POKYNY PRO ZAMĚSTNANCE, ORGANIZAČNÍ ZÁLEŽITOSTI',
      'spacer:',
      'spacer:',
    ]);
  });

  it('writes future items in the headmaster’s agenda format, routed by date', () => {
    const plain = (n: number) => pointContent(replica, n).map((b) => text(b).replaceAll(NB, ' '));
    expect(plain(1)).toEqual([
      'pondělí 12. října 2026, 10.00 až 11.00 hodin, ředitelna, Preslova, jednání s MČ Praha 5 o rekonstrukci dvora',
      'středa 14. října 2026, 14.00 až 16.00 hodin, areál Smíchov, učebna S206, schůzka s rodiči 1.A, vede třídní učitelka paní Mgr. Jana Nováková',
    ]);
    expect(plain(2)).toEqual([
      'pondělí 12. října 2026, 8.00 až 12.00 hodin, areál Smíchov, celoškolní piškvorkový turnaj, kvalifikace do oblastního kola celostátní soutěže plšQworky, organizují pánové Jakub Svoboda a Martin Král (oba 2.GB)',
      'úterý 13. října 2026, areál Smíchov, Den otevřených dveří',
      'úterý 13. října 2026, 7.00 až 14.00 hodin, areál Smíchov, Next Zone Event Space, akce Vaib, za Next Zone Event Space koordinuje absolvent pan Jan Absolon',
      '20. až 22. října 2026, exkurze 2.B do CERNu, organizuje pan Mgr. Petr Dvořák',
    ]);
    expect(plain(17)).toEqual([
      'čtvrtek 12. listopadu 2026, 8.00 hodin, areál Radlice, školní kolo matematické olympiády',
    ]);
  });

  it('lists exemptions inline with new students in bold, and points to Příloha 1', () => {
    const [intro, ...lines] = pointContent(replica, 4);
    expect(text(intro ?? { kind: 'spacer' })).toContain('pro školní rok 2026/2027');
    expect(lines.map((b) => text(b).replaceAll(NB, ' '))).toEqual([
      'seznam studentů uvolněných z Anglického jazyka na základě získaných certifikátů: Tomáš Černý (1.A), Eva Malá (2.B)',
      'seznam studentů uvolněných z Anglického jazyka na základě přezkoušení: Adam Čermák (1.B)',
      'seznam studentů uvolněných z Německého jazyka na základě získaných certifikátů: Jan Novák (2.A)',
    ]);
    const first = lines[0];
    expect(first?.kind === 'dash' && first.runs.filter((r) => r.bold).map((r) => r.text)).toEqual([
      'Tomáš Černý (1.A)',
    ]);
    expect(text(pointContent(replica, 3).at(-1) ?? { kind: 'spacer' }).replaceAll(NB, ' ')).toBe(
      'seznam studentů: je uveden v Příloze 1 této porady vedení',
    );
  });

  it('writes standing content with the template levels and forces level „o“ to bold italic', () => {
    const [first, second] = pointContent(replica, 5);
    expect(first).toMatchObject({
      kind: 'rich',
      level: 0,
      runs: [
        { text: 'používání programu Techambition na výuku matematiky', bold: true, italic: true },
      ],
    });
    expect(second).toEqual({ kind: 'rich', level: 1, runs: [] });
  });

  it('writes reports with their participant and statement lines', () => {
    expect(
      pointContent(replica, 16).map((b) => `${b.kind}:${text(b)}`.replaceAll(NB, ' ')),
    ).toEqual([
      'body:V pátek 9. října 2026 od 10.00 do 12.00 hodin v areálu Smíchov v Laboratoři fyziky v učebně S8 proběhl Vesmírný seminář, který organizovali slečna Lucie Králová a pan Petr Dvořák (oba 3.C).',
      'reportLine:účast studentů: slečna Eva Malá (2.B), pánové Tomáš Černý, John Doe (oba 1.A)',
      'reportLine:vyjádření pana Johna Doe (1.A): „Nejvíc mě zaujala přednáška o černých dírách.“',
    ]);
  });

  it('quotes partners in Czech quotes', () => {
    expect(pointContent(replica, 12).map(text)).toEqual([
      'vyjádření pana Johna Doe (Next Zone): „Spolupráce se studenty nás velmi těší.“',
    ]);
  });

  it('closes with the place, date and signature, then starts Příloha 1 on a new page', () => {
    const blocks = allBlocks(replica);
    const closing = blocks.findIndex((b) => b.kind === 'closing');
    expect(
      blocks.slice(closing, closing + 9).map((b) => `${b.kind}:${text(b)}`.replaceAll(NB, ' ')),
    ).toEqual([
      'closing:V Praze dne 12. října 2026 / Zpracoval Autonomní systém Autoporada',
      'spacer:',
      'pageBreak:',
      'spacer:',
      'spacer:',
      'annex:PŘÍLOHA 1',
      'spacer:',
      'spacer:',
      'annexTitle:Studenti v ředitelském „Programu na podporu talentovaným a aktivním studentům“',
    ]);
  });

  it('sorts Příloha 1 by class and surname, marking new students', () => {
    expect(replica.sections[1]).toMatchObject({ layout: 'twoColumn' });
    expect(text(replica.sections[1]?.blocks[0] ?? { kind: 'spacer' })).toBe(
      'John Doe|1.A, Joe Dohn|1.A*, Ola Bílá|L1B, Petr Dvořák|3.C*, Lucie Králová|3.C',
    );
  });

  it('applies Czech typography to the output', () => {
    expect(
      allBlocks(replica).find((b) => b.kind === 'section' && b.text.includes('PROVOZU')),
    ).toMatchObject({
      text: `INFORMACE Z${NB}PROVOZU ŠKOLY`,
    });
  });

  it('is deterministic', () => {
    expect(composeDocument(snapshotFixture('template-replica'))).toEqual(replica);
  });
});

describe('optional parts', () => {
  const lean = composeDocument(
    snapshotFixture('template-replica', (raw) => {
      const pokyny = raw['pokyny'] as Record<string, unknown>[];
      raw['pokyny'] = pokyny
        .filter((i) => i['slot'] !== 'media')
        .map((i) => (i['slot'] === 'partners' ? { ...i, quotes: [] } : i));
      raw['hospodareni'] = [];
      raw['reports'] = [];
      raw['futureItems'] = [];
      raw['annex2'] = null;
      (raw['registry'] as Record<string, unknown>[]).forEach((l) => (l['entries'] = []));
    }),
  );
  const kinds = allBlocks(lean).map((b) => `${b.kind}:${text(b)}`.replaceAll(NB, ' '));

  it('leaves out empty ohlasy, HOSPODAŘENÍ, PROVOZ and Příloha 2', () => {
    expect(kinds.some((k) => k.includes('Ohlasy'))).toBe(false);
    expect(kinds.some((k) => k.includes('HOSPODAŘENÍ') || k.includes('PROVOZU'))).toBe(false);
    expect(lean.sections).toHaveLength(2);
  });

  it('keeps points 1 and 2 and says that nothing is known yet', () => {
    expect(pointContent(lean, 1).map(text)).toEqual(['zatím žádná']);
    expect(pointContent(lean, 2).map(text)).toEqual(['zatím žádné']);
  });

  it('drops empty exemption lists and keeps Příloha 1 with an empty table', () => {
    expect(pointContent(lean, 4).filter((b) => b.kind === 'dash')).toEqual([]);
    expect(lean.sections[1]?.blocks[0]).toEqual({ kind: 'studentTable', rows: [] });
  });

  it('adds Příloha 2 on its own page when it has content', () => {
    const withAnnex2 = composeDocument(
      snapshotFixture('template-replica', (raw) => {
        raw['annex2'] = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: { indent: 1 },
              content: [{ type: 'text', text: 'Harmonogram' }],
            },
          ],
        };
      }),
    );
    expect(withAnnex2.sections[2]).toMatchObject({
      layout: 'nextPage',
      blocks: [
        { kind: 'annex', text: 'PŘÍLOHA 2' },
        { kind: 'spacer' },
        { kind: 'rich', level: 0 },
      ],
    });
  });
});

describe('statement quotes', () => {
  const statementOf = (quote: string) => {
    const model = composeDocument(
      snapshotFixture('template-replica', (raw) => {
        const reports = raw['reports'] as Record<string, unknown>[];
        reports[1] = {
          ...reports[1],
          statements: [{ speakerGenitive: 'pana Testa', quote }],
        };
      }),
    );
    const line = allBlocks(model).find((b) => b.kind === 'reportLine' && b.label.includes('Testa'));
    return line?.kind === 'reportLine' ? line.runs.map((r) => r.text).join('') : '';
  };

  it.each([
    ['Super seminář', ' „Super seminář“'],
    ['"Super seminář"', ' „Super seminář“'],
    ['„Super seminář“', ' „Super seminář“'],
    ['Hrál jsem "Hamleta" a bavilo mě to', ' „Hrál jsem ‚Hamleta‘ a\u00A0bavilo mě to“'],
    ['"Hamlet" byl skvělý', ' „‚Hamlet‘ byl skvělý“'],
    ['"Hamlet" a "Othello"', ' „‚Hamlet‘ a\u00A0‚Othello‘“'],
    ['Viz ssps.cz/', ' „Viz ssps.cz/“'],
  ])('%j → %j', (quote, expected) => {
    expect(statementOf(quote)).toBe(expected);
  });
});

describe('report eligibility', () => {
  it('leaves out reports of events that have not ended before the meeting', () => {
    const model = composeDocument(
      snapshotFixture('template-replica', (raw) => {
        const reports = raw['reports'] as Record<string, unknown>[];
        reports[0] = { ...reports[0], date: '2026-10-12' };
      }),
    );
    const titles = allBlocks(model).flatMap((b) => (b.kind === 'point' ? [b.text] : []));
    expect(titles).not.toContain('Seminář Matika Česku');
    expect(titles).toContain('Vesmírný seminář');
  });
});
