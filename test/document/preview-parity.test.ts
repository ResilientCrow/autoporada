import { describe, expect, it } from 'vitest';

import { composeDocument, composePointPreview, reportFromContent } from '@/document';
import type { Block } from '@/document';
import type { Salutation } from '@/domain/cs';
import type { DraftPerson, PointContent } from '@/domain/report';
import { richDocFromText } from '@/domain/richtext';
import { calDate } from '@/domain/time';

import { snapshotFixture } from '../support/snapshots';

const SCHOOL_YEAR = '2026/2027';
// The fixture's issue is the Monday 2026-10-12, so these events are finished and go under PROVOZ.

const person = (given: string, family: string, over: Partial<DraftPerson> = {}): DraftPerson => ({
  salutation: 'pan',
  givenName: given,
  familyName: family,
  ...over,
});

const base: PointContent = {
  title: '',
  eventDate: calDate(2026, 10, 7),
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: '',
  openingEdited: false,
  body: richDocFromText('Proběhl seminář.'),
  bullets: [],
  statements: [],
};

const FIXTURES: Record<string, { content: PointContent; groupOrder?: readonly Salutation[] }> = {
  plain: { content: { ...base, title: 'Seminář Matika Česku' } },
  everything: {
    groupOrder: ['pani', 'slecna', 'pan'],
    content: {
      ...base,
      title: 'Vesmírný seminář',
      eventDate: calDate(2026, 10, 9),
      endDate: calDate(2026, 10, 10),
      timeFrom: { hour: 10, minute: 0 },
      timeTo: { hour: 12, minute: 0 },
      opening:
        'V pátek 9. října 2026 proběhl Vesmírný seminář, který {skolniRok} organizovali žáci.',
      body: richDocFromText('První odstavec.\nDruhý odstavec s {skolniRok}.'),
      bullets: [
        {
          key: 'participants',
          label: 'účast studentů',
          kind: 'people',
          order: 'class-surname',
          people: [
            person('Jan', 'Novák', { affiliation: '2.A' }),
            person('Eva', 'Malá', { salutation: 'slecna', affiliation: '1.B' }),
            person('Petra', 'Dvořáková', { salutation: 'pani' }),
            person('Bez', 'Oslovení', { salutation: null }),
          ],
        },
        { key: 'results', label: 'výsledky', kind: 'text', text: '  Dobré výsledky.  ' },
        { key: 'empty', label: 'prázdné', kind: 'text', text: ' ' },
      ],
      statements: [
        {
          speaker: person('Jan', 'Novák'),
          speakerGenitive: 'pana Jana Nováka',
          affiliation: '2.A',
          quote: '„Bylo to "skvělé".“',
        },
        { speaker: null, speakerGenitive: '', quote: 'Bez mluvčího.' },
      ],
    },
  },
  'quotes and typography': {
    content: {
      ...base,
      title: 'Soutěž v programování k 100 % úspěchu',
      body: richDocFromText('Ve třídě s 25 žáky a v 9 hodin.'),
      statements: [{ speaker: null, speakerGenitive: 'ředitele školy', quote: 'Díky všem.' }],
    },
  },
};

/** The composed document's PROVOZ point for the one report: from its heading to the closing. */
function composedPoint(blocks: readonly Block[]): Block[] {
  const start = blocks.findLastIndex((b) => b.kind === 'point');
  const end = blocks.findIndex((b) => b.kind === 'closing');
  // The closing is preceded by one spacer of its own, which is not part of the point.
  expect(blocks[end - 1]).toEqual({ kind: 'spacer' });
  return blocks.slice(start, end - 1);
}

describe('preview parity with the document', () => {
  it.each(Object.entries(FIXTURES))('%s: the preview is the point the document prints', (_n, f) => {
    const { report, omitted } = reportFromContent(f.content, { id: 'p-1' });
    expect(report).not.toBeNull();
    const snapshot = snapshotFixture('template-replica', (raw) => {
      raw['reports'] = [report];
      raw['futureItems'] = [];
      if (f.groupOrder) raw['options'] = { groupOrder: f.groupOrder };
    });
    const model = composeDocument(snapshot);
    const printed = composedPoint(model.sections.flatMap((s) => s.blocks)).map((b) =>
      b.kind === 'point' ? { ...b, number: 1 } : b,
    );

    const preview = composePointPreview(f.content, {
      schoolYear: SCHOOL_YEAR,
      kind: 'report',
      ...(f.groupOrder && { groupOrder: f.groupOrder }),
    });

    expect(preview.blocks).toEqual(printed);
    expect(preview.blocks.length).toBeGreaterThan(2);
    expect(preview.omitted).toEqual(omitted);
  });
});
