import { compareDates, type CalDate } from '@/domain/time';

import type { AssemblyFacts, AssemblyProblem } from './assemble-types';

type FindingCode =
  | 'issue-not-open'
  | 'earlier-open'
  | 'snapshot-invalid'
  | 'report-incomplete'
  | 'points-waiting'
  | 'points-returned'
  | 'akce-waiting'
  | 'late-reports-expected'
  | 'reports-missing'
  | 'placeholders-unchecked'
  | 'proposal-dropped'
  | 'deadline-ahead'
  | 'source-not-generated'
  | 'annex1-empty'
  | 'reports-later'
  | 'ohlasy-empty'
  | 'registry-new'
  | 'meeting-moved';

/** `block` stops the generation of M10, `warn` is shown with a link, `info` is only said. */
export interface Finding {
  readonly code: FindingCode;
  readonly level: 'block' | 'warn' | 'info';
  /** What to look at: a point or an akce, named for a link. */
  readonly refs?: readonly {
    readonly id: string;
    readonly title: string;
    /** `late-reports-expected`: when the report closes. */
    readonly due?: Date;
    /** `late-reports-expected`: whether `id` is an akce or a report draft. */
    readonly of?: 'akce' | 'point';
  }[];
  /** `earlier-open`: the porada to generate or drop first, by its Monday and meeting date. */
  readonly earlier?: { readonly monday: CalDate; readonly meetingDate: CalDate };
  /** `snapshot-invalid`: where the snapshot is wrong. */
  readonly paths?: readonly string[];
  /** `registry-new`: how many entries will be marked NOVÉ. `late-reports-expected`: late drafts of others, not named. */
  readonly count?: number;
}

/**
 * What the headmaster should know before the document is generated (design §11), in the order
 * the screen shows it. Pure; it logs nothing and carries ids, titles and counts only.
 */
export function preflight(
  facts: AssemblyFacts,
  problems: readonly AssemblyProblem[],
  now: Date,
): Finding[] {
  const findings: Finding[] = [];
  const add = (finding: Finding) => findings.push(finding);
  const refs = (list: readonly { readonly id: string; readonly title: string }[]) => ({
    refs: list.map(({ id, title }) => ({ id, title })),
  });

  if (facts.issue.status !== 'open') add({ code: 'issue-not-open', level: 'block' });
  else if (facts.earlierOpen)
    add({ code: 'earlier-open', level: 'block', earlier: facts.earlierOpen });
  for (const problem of problems) {
    if (problem.code === 'snapshot-invalid') {
      add({ code: 'snapshot-invalid', level: 'block', paths: problem.paths });
    }
  }
  const incomplete = problems.flatMap((p) =>
    p.code === 'report-incomplete' ? [{ id: p.pointId, title: p.title }] : [],
  );
  if (incomplete.length > 0) {
    add({ code: 'report-incomplete', level: 'block', ...refs(incomplete) });
  }
  const { submitted, returned, later } = facts.waiting;
  if (submitted.length > 0) add({ code: 'points-waiting', level: 'warn', ...refs(submitted) });
  if (returned.length > 0) add({ code: 'points-returned', level: 'warn', ...refs(returned) });
  if (facts.akceWaiting.length > 0) {
    add({ code: 'akce-waiting', level: 'warn', ...refs(facts.akceWaiting) });
  }
  if (facts.lateExpected.length > 0 || facts.lateDraftsHidden > 0) {
    add({
      code: 'late-reports-expected',
      level: 'warn',
      ...(facts.lateExpected.length > 0 && {
        refs: facts.lateExpected.map(({ id, of, title, due }) => ({ id, of, title, due })),
      }),
      ...(facts.lateDraftsHidden > 0 && { count: facts.lateDraftsHidden }),
    });
  }
  if (facts.missingReports.length > 0) {
    add({
      code: 'reports-missing',
      level: 'warn',
      refs: facts.missingReports.map(({ id, title }) => ({ id, title, of: 'akce' as const })),
    });
  }
  if (facts.uncheckedPlaceholders.length > 0) {
    add({
      code: 'placeholders-unchecked',
      level: 'warn',
      refs: facts.uncheckedPlaceholders.map(({ id, title }) => ({
        id,
        title,
        of: 'akce' as const,
      })),
    });
  }
  if (facts.dropped.length > 0)
    add({ code: 'proposal-dropped', level: 'warn', ...refs(facts.dropped) });
  if (now.getTime() < facts.issue.deadlineAt.getTime()) {
    add({ code: 'deadline-ahead', level: 'warn' });
  }
  if (facts.origin.kind === 'derived' && facts.sourceStatus !== 'generated') {
    add({ code: 'source-not-generated', level: 'warn' });
  }
  if (facts.annex1Entries === 0) add({ code: 'annex1-empty', level: 'warn' });
  if (later.length > 0) add({ code: 'reports-later', level: 'info', ...refs(later) });
  if (facts.ohlasyEmpty) add({ code: 'ohlasy-empty', level: 'info' });
  if (facts.newEntries > 0) add({ code: 'registry-new', level: 'info', count: facts.newEntries });
  if (compareDates(facts.issue.meetingDate, facts.issue.monday) !== 0) {
    add({ code: 'meeting-moved', level: 'info' });
  }
  return findings;
}
