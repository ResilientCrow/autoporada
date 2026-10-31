import { readDeadlineRule, readSettingValue } from '@/application/core';
import type { Tx } from '@/application/ports';
import { deadline } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import { singleLine } from '@/domain/richtext';
import { toIsoDate, type CalDate } from '@/domain/time';
import { parseIssueSnapshot } from '@/snapshot';

import { futureItemOf, inAgendaWindow } from './assemble-future';
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
 * first, before any issue row (lock order, row 12b). The snapshot is null when it fails its own
 * schema; the problems say what was left out or why.
 */
export async function assembleIssueSnapshot(
  tx: Tx,
  monday: CalDate,
  options: { readonly now: Date; readonly lock?: boolean },
): Promise<AssemblyResult> {
  const rule = await readDeadlineRule(tx);
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

  const points = await tx.points.eligibleFor(monday, meeting, { lock: options.lock ?? false });
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
  const { reports, problems } = assembleReports(points);

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
      origin: outline.loaded.origin,
      sourceStatus: outline.loaded.sourceStatus,
      waiting,
      akceWaiting: waitingAkce
        .filter((i) => inAgendaWindow(i, meeting))
        .map((i) => ({ id: i.id, title: singleLine(i.content.title) })),
      lateExpected: late.expected,
      lateDraftsHidden: late.hiddenDrafts,
      dropped: outline.dropped,
      annex1Entries: registry.annex1Entries,
      newEntries: registry.newEntries,
      ohlasyEmpty: outline.ohlasyEmpty,
    },
    publish: { points, entryIds: registry.unstamped },
  };
}
