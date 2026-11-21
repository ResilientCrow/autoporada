import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { snapshotFixture } from '../../test/support/snapshots';
import { composeDocument } from '../document/compose';
import { parseIssueSnapshot } from './index';

/** A schema 1 item as the old generator stored it, with its people as data. */
const item = (id: string, responsible?: Record<string, unknown>) => ({
  id,
  kind: 'akce',
  title: `Akce ${id}`,
  date: '2026-10-13',
  ...(responsible && { responsible }),
});

/** The replica (schema 1) with only these future items. */
function parseV1(items: unknown[], options?: Record<string, unknown>) {
  return parseIssueSnapshot({ ...rawReplica(), futureItems: items, ...(options && { options }) });
}

const rawReplica = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      new URL('../../test/fixtures/snapshots/template-replica.json', import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;

const organizerOf = (items: unknown[], options?: Record<string, unknown>) => {
  const result = parseV1(items, options);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.snapshot.futureItems.map((f) => f.organizer);
};

const pan = (given: string, family: string) => ({
  salutation: 'pan',
  givenName: given,
  familyName: family,
});

describe('upcasting a schema 1 snapshot', () => {
  it('turns the stored people into the organizer text the old document printed', () => {
    const result = parseIssueSnapshot(rawReplica());
    expect(result.ok && result.snapshot.schema).toBe(2);
    // The old text carries its verb, so no role: it prints as typed (ADR 0063).
    expect(result.ok && result.snapshot.futureItems.some((f) => f.organizerRole)).toBe(false);
    const byId = Object.fromEntries(
      result.ok
        ? result.snapshot.futureItems.map((f) => [f.id, f.organizer?.replaceAll('\u00a0', ' ')])
        : [],
    );
    expect(byId).toMatchObject({
      'f-rodice': 'vede třídní učitelka paní Jana Nováková',
      'f-piskvorky': 'organizují pánové Jakub Svoboda a Martin Král (oba 2.GB)',
      'f-vaib': 'za Next Zone Event Space koordinuje absolvent pan Jan Absolon',
      'f-cern': 'organizuje pan Petr Dvořák',
      'f-mc': undefined,
    });
  });

  it('drops the structured field, so the result is a valid schema 2 snapshot', () => {
    const result = parseIssueSnapshot(rawReplica());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.stringify(result.snapshot)).not.toContain('responsible');
    }
  });

  it('puts „za …“ first and the plural verb for several people', () => {
    expect(
      organizerOf([
        item('a', {
          verb: 'zajišťuje',
          behalfOf: 'Next Zone',
          people: [pan('Jan', 'Novák'), pan('Petr', 'Malý')],
        }),
      ]),
    ).toEqual(['za Next Zone zajišťují pánové Jan Novák a Petr Malý']);
  });

  it('keeps the group order the snapshot options asked for', () => {
    const people = [
      pan('Jan', 'Novák'),
      { salutation: 'pani', givenName: 'Jana', familyName: 'Malá' },
    ];
    const verb = (options?: Record<string, unknown>) =>
      organizerOf([item('a', { verb: 'vede', people })], options)[0]?.replaceAll('\u00a0', ' ');
    expect(verb({ groupOrder: ['pan', 'pani', 'slecna'] })).toMatch(
      /pan.* Jan Novák.*paní.* Jana Malá/,
    );
    expect(verb({ groupOrder: ['pani', 'pan', 'slecna'] })).toMatch(
      /paní.* Jana Malá.*pan.* Jan Novák/,
    );
  });

  it('leaves an item without people without an organizer', () => {
    expect(organizerOf([item('a')])).toEqual([undefined]);
  });

  it('refuses a schema 1 snapshot that was not valid schema 1', () => {
    const result = parseV1([item('a', { verb: 'řídí', people: [pan('Jan', 'Novák')] })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('futureItems');
  });

  it('refuses a schema 1 item whose people list is empty', () => {
    expect(parseV1([item('a', { verb: 'vede', people: [] })]).ok).toBe(false);
  });

  it('still renders: the old line prints from the organizer text', () => {
    const snapshot = snapshotFixture('template-replica');
    const model = composeDocument(snapshot);
    const printed = model.sections
      .flatMap((s) => s.blocks)
      .flatMap((b) => (b.kind === 'bullet' ? [b.runs.map((r) => r.text).join('')] : []))
      .join('\n')
      .replaceAll('\u00a0', ' ');
    expect(printed).toContain('organizuje pan Petr Dvořák');
  });
});
