import { readSettingValue, readSlots, readReportsSince } from '@/application/core';
import type { Tx } from '@/application/ports';
import { deadline } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import { singleLine } from '@/domain/richtext';
import { compareDates, toIsoDate, type CalDate } from '@/domain/time';
import { parseIssueSnapshot } from '@/snapshot';

import { futureItemOf, inAgendaWindow } from './assemble-future';
import { missingReports, owedAkce, placeholderReports } from './assemble-missing';
import { assembleOutline } from './assemble-outline';
import { assembleRegistry } from './assemble-registry';
import { assembleReports } from './assemble-reports';
import type { AssemblyResult } from './assemble-types';
import { lateReportsExpected } from './late-reports';
import { loadTexts } from './outline-store';

/** The id a Monday without a row gets in a preview; no stored row has it. */
const virtualId = (monday: CalDate) => `neulozena-${toIsoDate(monday)}`;

/**
 * The snapshot of one issue as the document would print it now, read from the data (design §4).
 * A Monday without a row assembles as an untouched issue. Read-only; `issues.generate` calls it
 * with `lock: true` so the points it reads cannot change under it, and publishes `publish`. The deadline rule is read
 * first, before any issue row (lock order, row 12b), with the calendar that says which earlier
 * porada is still open (ADR 0040). The snapshot is null when it fails its own schema; the
 * problems say what was left out or why.
 */
export async function assembleIssueSnapshot(
  tx: Tx,
  monday: CalDate,
  options: { readonly now: Date; readonly lock?: boolean },
): Promise<AssemblyResult> {
  const { slots, rule } = await readSlots(tx, options.now);
  const earlier = slots.find((s) => s.status === 'open' && compareDates(s.monday, monday) < 0);
  const [row] = await tx.issues.between(monday, monday);
  const issue = {
    id: row?.id ?? null,
    monday,
    meetingDate: row?.meetingDate ?? monday,
    schoolYear: row?.schoolYear ?? schoolYear(monday),
    status: row?.status ?? ('open' as const),
    deadlineAt: row?.deadlineAt ?? deadline(monday, rule),
  };
  const meeting = issue.meetingDate;
  const outlineIssue = { id: issue.id, monday };

  const since = await readReportsSince(tx, monday);
  const points = await tx.points.eligibleFor(monday, meeting, {
    since,
    lock: options.lock ?? false,
  });
  const owed = await owedAkce(tx, since, meeting);
  const missing = await missingReports(tx, owed, points);
  const texts = await loadTexts(tx, outlineIssue);
  const outline = await assembleOutline(tx, outlineIssue, points);
  const registry = await assembleRegistry(tx, issue.id ?? virtualId(monday));
  const annex1 = await readSettingValue(tx, 'texts.annex1');
  const future = await tx.futureItems.forIssue(meeting);
  const waiting = await tx.points.waitingFor(monday, meeting);
  const waitingAkce = await tx.futureItems.waitingFor(meeting);
  const late = await lateReportsExpected(tx, {
    meetingDate: meeting,
    deadlineAt: issue.deadlineAt,
  });
  const answered = new Map(
    owed.flatMap((a) => (a.reportPointId ? [[a.reportPointId, a] as const] : [])),
  );
  const assembled = assembleReports(points, answered);
  const reports = [...assembled.reports, ...(await placeholderReports(tx, missing))];
  const { problems } = assembled;

  const candidate = {
    schema: 1,
    issue: {
      id: issue.id ?? virtualId(monday),
      monday: toIsoDate(monday),
      meetingDate: toIsoDate(meeting),
      schoolYear: issue.schoolYear,
    },
    presentText: texts.present,
    guestsText: texts.guests,
    pokyny: outline.items.pokyny,
    hospodareni: outline.items.hospodareni,
    reports,
    futureItems: future.flatMap(futureItemOf),
    registry: registry.lists,
    annex1: { heading: annex1.heading, intro: annex1.intro },
    annex2: texts.annex2,
    // Branch arch-ui: the porada's further annexes, kept in settings until they get a table.
    annexes: withoutIds(
      await tx.settings.value(`arch.annexes.${toIsoDate(monday).replaceAll('-', '')}`),
    ),
  };
  const parsed = parseIssueSnapshot(candidate);
  // Only the path of a refusal is kept: the message may quote what people wrote (ADR 0015).
  const invalid = parsed.ok
    ? []
    : [
        {
          code: 'snapshot-invalid' as const,
          paths: parsed.errors.map((e) => e.split(': ')[0] ?? ''),
        },
      ];

  return {
    snapshot: parsed.ok ? parsed.snapshot : null,
    problems: [...problems, ...invalid],
    facts: {
      issue: {
        id: issue.id,
        monday,
        meetingDate: meeting,
        status: issue.status,
        deadlineAt: issue.deadlineAt,
      },
      earlierOpen: earlier ? { monday: earlier.monday, meetingDate: earlier.meetingDate } : null,
      origin: outline.loaded.origin,
      sourceStatus: outline.loaded.sourceStatus,
      waiting,
      akceWaiting: waitingAkce
        .filter((i) => inAgendaWindow(i, meeting))
        .map((i) => ({ id: i.id, title: singleLine(i.content.title) })),
      lateExpected: late.expected,
      lateDraftsHidden: late.hiddenDrafts,
      dropped: outline.dropped,
      missingReports: missing.map(({ akce, report }) => ({
        id: akce.id,
        title: singleLine(akce.content.title),
        state: report?.state ?? ('none' as const),
      })),
      annex1Entries: registry.annex1Entries,
      newEntries: registry.newEntries,
      ohlasyEmpty: outline.ohlasyEmpty,
    },
    publish: { points, missing, entryIds: registry.unstamped },
  };
}

/** Branch arch-ui: the client keys annexes and parts by id; the snapshot keeps the content only. */
function withoutIds(v: unknown): unknown {
  if (!Array.isArray(v)) return [];
  return v.map((a: { id?: unknown; parts?: unknown }) => {
    const { id: _a, ...annex } = a;
    const parts = Array.isArray(a.parts)
      ? a.parts.map((p: { id?: unknown }) => {
          const { id: _p, ...part } = p;
          return part;
        })
      : a.parts;
    return { ...annex, parts };
  });
}
