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
    case 'dataTable':
      return b.rows.map((r) => r.join('|')).join(', ');
    case 'image':
      return b.alt;
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
      'úterý 13. října 2026, 7.00 až 14.00 hodin, areál Smíchov, Next Zone Event Space, akce Vaib, za Next Zone Event Space koordinuje absolvent pan Jan Absolon',
      'úterý 13. října 2026, areál Smíchov, Den otevřených dveří',
      'úterý 20. října až čtvrtek 22. října 2026, exkurze 2.B do CERNu, organizuje pan Mgr. Petr Dvořák',
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

describe('free-text akce lines (ADR 0060)', () => {
  const akce = (id: string, title: string, over: Record<string, unknown> = {}) => ({
    id,
    kind: 'akce',
    title,
    date: '2026-10-13',
    ...over,
  });
  /** The replica with only these agenda items, in schema 2, and the lines of point 2. */
  const lines = (items: Record<string, unknown>[]) =>
    pointContent(
      composeDocument(
        snapshotFixture('template-replica', (raw) => {
          raw['schema'] = 2;
          raw['futureItems'] = items;
        }),
      ),
      2,
    ).map((b) => text(b).replaceAll(NB, ' '));

  it('prints date, time, areál, místo, název, poznámka, organizátor, účastníci, joined by commas', () => {
    expect(
      lines([
        akce('f-1', 'Stáž', {
          timeFrom: '14:00',
          timeTo: '16:00',
          campus: 'smichov',
          place: 'Divadlo Viola, Národní 7, Praha 1',
          note: 'téma kybernetická bezpečnost',
          organizer: 'organizuje paní zástupkyně Jana Nováková',
          participants: 'účast slečny a pánové z 2.B',
        }),
      ]),
    ).toEqual([
      'úterý 13. října 2026, 14.00 až 16.00 hodin, areál Smíchov, Divadlo Viola, Národní 7, Praha 1, Stáž, téma kybernetická bezpečnost, organizuje paní zástupkyně Jana Nováková, účast slečny a pánové z 2.B',
    ]);
  });

  it('prints a multi-day akce as a range across months and years, and no time', () => {
    expect(
      lines([
        akce('f-1', 'Výlet', {
          date: '2026-10-13',
          endDate: '2026-11-04',
          timeFrom: '08:00',
          timeTo: '10:00',
        }),
      ]),
    ).toEqual(['úterý 13. října až středa 4. listopadu 2026, Výlet']);
  });

  it('sorts a start day: multi-day first, then timed by time, then untimed, ties by title', () => {
    const order = lines([
      akce('f-1', 'Beta'),
      akce('f-2', 'Alfa'),
      akce('f-3', 'Zeta', { timeFrom: '09:00' }),
      akce('f-4', 'Yankee', { timeFrom: '08:00' }),
      akce('f-5', 'Čtvrtek', { timeFrom: '08:00' }),
      akce('f-6', 'Výlet', { endDate: '2026-10-15' }),
    ]).map((line) =>
      line.replace(/^.*?\d{4}(?: až \w+ \d+\. \w+)?, /, '').replace(/^\d+\.\d+ hodin, /, ''),
    );
    expect(order).toEqual(['Výlet', 'Čtvrtek', 'Yankee', 'Zeta', 'Alfa', 'Beta']);
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

describe('affiliations', () => {
  it('prints them as stored, even when they look like a class', () => {
    const model = composeDocument(
      snapshotFixture('template-replica', (raw) => {
        const reports = raw['reports'] as Record<string, unknown>[];
        reports[1] = {
          ...reports[1],
          statements: [{ speakerGenitive: 'pana Testa', affiliation: ' 3M ', quote: 'Super' }],
        };
      }),
    );
    expect(allBlocks(model).map((b) => text(b).replaceAll(NB, ' '))).toContain(
      'vyjádření pana Testa (3M): „Super“',
    );
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

describe('a placeholder report (ADR 0049)', () => {
  const placeholder = (change?: (report: Record<string, unknown>) => void) =>
    composeDocument(
      snapshotFixture('template-replica', (raw) => {
        const reports = raw['reports'] as Record<string, unknown>[];
        const next: Record<string, unknown> = {
          ...reports[1],
          missing: true,
          bullets: [],
          statements: [],
        };
        change?.(next);
        reports[1] = next;
      }),
    );
  const titleOf = () => {
    const reports = snapshotFixture('template-replica').reports;
    return reports[1]?.title ?? '';
  };

  it('prints the stored paragraph, then the one line that says what was not delivered', () => {
    const model = placeholder();
    const blocks = allBlocks(model);
    const at = blocks.findIndex((b) => b.kind === 'point' && b.text === titleOf());
    expect(at).toBeGreaterThan(-1);
    const lines = blocks.slice(at + 1, at + 4).map((b) => text(b).replaceAll(NB, ' '));
    expect(lines[1]).toBe('vyjádření organizátora: nebylo dodáno');
    expect(lines[2]).not.toContain('nebyl');
  });

  it('leaves a report without the flag as it was', () => {
    expect(allBlocks(replica).map(text).join('\n')).not.toContain('nebyl dodán');
  });

  it('keeps the placeholder in its place by date, with the other reports', () => {
    const titles = allBlocks(placeholder()).flatMap((b) => (b.kind === 'point' ? [b.text] : []));
    expect(titles).toEqual(allBlocks(replica).flatMap((b) => (b.kind === 'point' ? [b.text] : [])));
  });
});

describe('a meeting that is not on the Monday', () => {
  const wednesday = (change?: (raw: Record<string, unknown>) => void) =>
    composeDocument(
      snapshotFixture('template-replica', (raw) => {
        (raw['issue'] as Record<string, unknown>)['meetingDate'] = '2026-10-14';
        change?.(raw);
      }),
    );
  const items = (raw: Record<string, unknown>) => raw['futureItems'] as Record<string, unknown>[];
  const plain = (model: DocumentModel, n: number) =>
    pointContent(model, n).map((b) => text(b).replaceAll(NB, ' '));

  it('drops agenda items that ended before the meeting date', () => {
    const model = wednesday();
    expect(plain(model, 1).join('\n')).not.toContain('jednání s MČ Praha 5');
    expect(plain(model, 1).join('\n')).toContain('schůzka s rodiči 1.A');
    expect(plain(model, 2).join('\n')).not.toContain('piškvorkový');
    expect(plain(model, 2).join('\n')).not.toContain('Den otevřených dveří');
    expect(plain(model, 2).join('\n')).toContain('exkurze 2.B do CERNu');
  });

  it('starts the windows at the meeting date and ends them where the Monday porada would', () => {
    const headings = allBlocks(wednesday()).flatMap((b) =>
      b.kind === 'point' && b.number <= 2 ? [b.text.replaceAll(NB, ' ')] : [],
    );
    expect(headings).toEqual([
      'Zatím známá jednání v týdnu od 14. října do 19. října 2026',
      'Zatím známé akce v týdnech od 14. října do 26. října 2026',
    ]);
  });

  it('lists exactly the items of the shortened windows', () => {
    const model = wednesday((raw) => {
      items(raw).push(
        { id: 'w1', kind: 'jednani', title: 'jednání v pondělí po poradě', date: '2026-10-19' },
        { id: 'w4', kind: 'jednani', title: 'jednání po týdnu', date: '2026-10-20' },
        { id: 'w5', kind: 'akce', title: 'akce v den porady', date: '2026-10-14' },
        { id: 'w2', kind: 'akce', title: 'akce za dva týdny', date: '2026-10-26' },
        { id: 'w3', kind: 'akce', title: 'akce po oknu', date: '2026-10-27' },
      );
    });
    expect(plain(model, 1).join('\n')).toContain('jednání v pondělí po poradě');
    expect(allBlocks(model).map(text).join('\n')).not.toContain('jednání po týdnu');
    expect(plain(model, 2).join('\n')).toContain('akce v den porady');
    expect(plain(model, 2).join('\n')).toContain('akce za dva týdny');
    expect(plain(model, 2).join('\n')).not.toContain('akce po oknu');
    expect(plain(model, 17).join('\n')).toContain('akce po oknu');
  });

  it('prints reports of events that ended before the meeting date, not before the Monday', () => {
    const model = wednesday((raw) => {
      const reports = raw['reports'] as Record<string, unknown>[];
      reports[1] = { ...reports[1], date: '2026-10-13' };
      reports[0] = { ...reports[0], date: '2026-10-14' };
    });
    const titles = allBlocks(model).flatMap((b) => (b.kind === 'point' ? [b.text] : []));
    expect(titles).toContain('Vesmírný seminář');
    expect(titles).not.toContain('Seminář Matika Česku');
  });
});
