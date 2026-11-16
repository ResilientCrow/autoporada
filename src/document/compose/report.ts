import { renderPeople, type Salutation } from '@/domain/cs';
import {
  OPENING_KEYS,
  reportBody,
  type DraftBullet,
  type DraftPerson,
  type DraftStatement,
  type PointContent,
} from '@/domain/report';
import { singleLine } from '@/domain/richtext';
import { compareDates, compareTimes, toIsoDate, toIsoTime } from '@/domain/time';
import type { SnapshotBullet, SnapshotReport, SnapshotStatement } from '@/snapshot';

import type { Block } from '../model';
import {
  finalRuns,
  finalText,
  point,
  quoted,
  richBlocks,
  statementLabel,
  type Tokens,
} from './text';

function bulletLine(bullet: SnapshotBullet, groupOrder?: readonly Salutation[]): Block {
  const text =
    bullet.kind === 'text'
      ? bullet.text
      : renderPeople(bullet.people, {
          join: 'comma',
          order: bullet.order,
          ...(groupOrder && { groupOrder }),
        });
  return {
    kind: 'reportLine',
    label: finalText(`${bullet.label}:`),
    runs: finalRuns([{ text: ` ${text}` }]),
  };
}

/** What a placeholder report says besides its paragraph (ADR 0060): one line; the page of the paragraph shows it too. */
export const MISSING_REPORT_LINES: readonly string[] = ['vyjádření organizátora: nebylo dodáno'];

/**
 * One report as a numbered point: body, labelled bullets, then statements. The provoz section
 * and the single-point preview (fed by reportFromContent) both build on it.
 */
export function reportBlocks(
  report: SnapshotReport,
  opts: { groupOrder?: readonly Salutation[]; tokens: Tokens },
): Block[] {
  return point(report.title, [
    ...richBlocks(report.body, opts.tokens),
    ...(report.missing
      ? MISSING_REPORT_LINES.map((line): Block => ({
          kind: 'body',
          runs: finalRuns([{ text: line }], opts.tokens),
        }))
      : []),
    ...report.bullets.map((b) => bulletLine(b, opts.groupOrder)),
    ...report.statements.map((s) => ({
      kind: 'reportLine' as const,
      label: statementLabel(s.speakerGenitive, s.affiliation),
      runs: [{ text: ` ${quoted(s.quote)}` }],
    })),
  ]);
}

/** What `reportFromContent` left out, by kind. */
export interface Omitted {
  /** People without a salutation (or without a family name). */
  readonly people: number;
  /** People bullets with nobody left, or without a label. */
  readonly peopleBullets: number;
  /** Text bullets with no text, or without a label. */
  readonly textBullets: number;
  /** Statements without a speaker genitive or a quote. */
  readonly statements: number;
}

type SnapshotPerson = Extract<SnapshotBullet, { kind: 'people' }>['people'][number];

/** Optional text the snapshot stores: on one line, and absent when blank. */
const optional = <K extends string>(key: K, value: string | undefined) => {
  const text = singleLine(value ?? '');
  return text ? ({ [key]: text } as { [P in K]: string }) : {};
};

/** The snapshot's person, or null when it cannot show them: no salutation, no family name. */
export function snapshotPerson(p: DraftPerson): SnapshotPerson | null {
  const familyName = singleLine(p.familyName);
  if (p.salutation === null || familyName === '') return null;
  return {
    salutation: p.salutation,
    ...optional('titlesBefore', p.titlesBefore),
    givenName: singleLine(p.givenName),
    familyName,
    ...optional('titlesAfter', p.titlesAfter),
    ...optional('affiliation', p.affiliation),
  };
}

function snapshotStatement(s: DraftStatement): SnapshotStatement | null {
  const speakerGenitive = singleLine(s.speakerGenitive);
  const quote = singleLine(s.quote);
  if (speakerGenitive === '' || quote === '') return null;
  return { speakerGenitive, ...optional('affiliation', s.affiliation), quote };
}

/**
 * The bullets that survive, with the counts of what did not (rules 2 to 4). The organisers' row
 * prints no line of its own: the opening sentence names them.
 */
function snapshotBullets(bullets: readonly DraftBullet[]): {
  kept: SnapshotBullet[];
  omitted: Pick<Omitted, 'people' | 'peopleBullets' | 'textBullets'>;
} {
  const kept: SnapshotBullet[] = [];
  const omitted = { people: 0, peopleBullets: 0, textBullets: 0 };
  for (const bullet of bullets) {
    if (bullet.kind === 'people' && OPENING_KEYS.includes(bullet.key)) continue;
    const label = singleLine(bullet.label);
    if (bullet.kind === 'text') {
      const text = singleLine(bullet.text);
      if (label === '' || text === '') omitted.textBullets++;
      else kept.push({ kind: 'text', label, text });
      continue;
    }
    const people = bullet.people.flatMap((p) => snapshotPerson(p) ?? []);
    omitted.people += bullet.people.length - people.length;
    if (label === '' || people.length === 0) omitted.peopleBullets++;
    else kept.push({ kind: 'people', label, order: bullet.order, people });
  }
  return { kept, omitted };
}

/**
 * The dates and times the snapshot accepts: an end before the start, a time to
 * without a time from and a time to that is not after the time from on one day
 * are left out, so a half-filled form still previews. Readiness reports them.
 */
function snapshotDates(c: PointContent & { eventDate: NonNullable<PointContent['eventDate']> }) {
  const date = toIsoDate(c.eventDate);
  const endDate =
    c.endDate && compareDates(c.endDate, c.eventDate) >= 0 ? toIsoDate(c.endDate) : undefined;
  const oneDay = endDate === undefined || endDate === date;
  const timeFrom = c.timeFrom ?? undefined;
  const timeTo =
    c.timeTo && timeFrom && !(oneDay && compareTimes(c.timeTo, timeFrom) <= 0)
      ? c.timeTo
      : undefined;
  return {
    date,
    ...(endDate !== undefined && { endDate }),
    ...(timeFrom && { timeFrom: toIsoTime(timeFrom) }),
    ...(timeTo && { timeTo: toIsoTime(timeTo) }),
  };
}

/**
 * A point's content as the snapshot's report, for the live preview and for the
 * snapshot builder (M9). Whatever the snapshot would refuse is left out and
 * counted instead, in this order: the opening sentence leads the body; people
 * without a salutation go; people bullets left with nobody go; blank text bullets
 * go; statements without a genitive or a quote go. With no title or no start date
 * there is no report, never an invented one, but the counts are still given.
 * Plain fields are trimmed the way the snapshot trims them, and a newline or a
 * tab in one becomes a space, so the preview shows what the document prints.
 *
 * A submitted point passes readiness, so for M9 every count is zero and `report`
 * is never null; the snapshot builder asserts that.
 */
export function reportFromContent(
  content: PointContent,
  meta: { id: string },
): { report: SnapshotReport | null; omitted: Omitted } {
  const { kept, omitted: dropped } = snapshotBullets(content.bullets);
  const statements = content.statements.flatMap((s) => snapshotStatement(s) ?? []);
  const omitted: Omitted = {
    ...dropped,
    statements: content.statements.length - statements.length,
  };
  const title = singleLine(content.title);
  if (title === '' || content.eventDate === null) return { report: null, omitted };

  const report: SnapshotReport = {
    id: meta.id,
    title,
    ...snapshotDates({ ...content, eventDate: content.eventDate }),
    body: reportBody(content.opening, content.body),
    bullets: kept,
    statements,
  };
  return { report, omitted };
}
