import { defineUseCase, fail, fromTransition, ok } from '@/application/core';
import type { AuditTarget, PointRecord, Tx } from '@/application/ports';
import type { MissingReport } from './assemble-types';
import { generateIssueInput, generateIssueOutput } from '@/contracts';
import { composeDocument } from '@/document';
import { renderDocx } from '@/document/render-docx';
import { restoreHeld } from '@/domain/outline';
import { ISSUE_MACHINE, POINT_MACHINE, transition } from '@/domain/review';
import { compareDates, toIsoDate, type CalDate } from '@/domain/time';

import { futureEvent } from '../future/events';
import { pointEvent } from '../points/events';
import { assembleIssueSnapshot } from './assemble';
import { mondayOfText, readWindow } from './calendar';
import { ensureIssue } from './ensure';
import { issueEvent } from './events';
import { loadEditable, writeOutline } from './outline-store';
import { preflight } from './preflight';

/** What a client that saw no row for the Monday read: an untouched issue. */
const UNTOUCHED_VERSION = 1;

/**
 * Writes the derived or seeded outline as the issue's rows, held placements kept (ADR 0036), so
 * the next porada carries on from this one: the carry-over reads the latest issue with rows.
 */
async function materialize(
  tx: Tx,
  issueId: string,
  monday: CalDate,
  points: readonly PointRecord[],
) {
  const loaded = await loadEditable(tx, { id: issueId, monday }, points);
  const { origin } = loaded;
  if (origin.kind === 'stored') return;
  const written = restoreHeld(loaded.outline, loaded.held);
  // The loaded outline already holds its held rows' places: restoring them cannot be refused.
  if (!written.ok) throw new Error(`issues.generate: held rows refused (${written.refusal})`);
  await writeOutline(tx, issueId, written.outline);
  const day = toIsoDate(monday);
  const rows = written.outline.pokyny.length + written.outline.hospodareni.length;
  await tx.audit.record({
    action: 'outline.materialized',
    target: { type: 'issue', id: issueId },
    meta:
      origin.kind === 'derived'
        ? { monday: day, origin: origin.kind, from: toIsoDate(origin.from), how: origin.how, rows }
        : { monday: day, origin: origin.kind, rows },
  });
}

/**
 * Closes the report of every akce the document prints a placeholder for (ADR 0049): the akce's
 * report becomes `missed`, and its report point, if it is still with the author or in review,
 * is withdrawn. Audited by id and state, never by text.
 */
async function closeMissing(tx: Tx, missing: readonly MissingReport[]) {
  for (const { akce, report } of missing) {
    const missed = await tx.futureItems.markMissed(akce.id, akce.version);
    await tx.audit.record(futureEvent('future.report-missed', akce, missed));
    if (report === null || !POINT_MACHINE.close.from.some((from) => from === report.state))
      continue;
    const closed = await tx.points.close(report.id, report.version);
    await tx.audit.record({
      action: 'point.closed',
      target: { type: 'point', id: closed.id },
      diff: { state: { from: closed.from, to: POINT_MACHINE.close.to } },
    });
  }
}

/**
 * „Vygenerovat“ (ADR 0038): the headmaster turns an open porada into its document. In one
 * transaction: the rule is read first (lock order), the issue row is locked, the snapshot is
 * assembled with the points locked, a blocking finding refuses it (`issue-blocked`), and the issue row is taken at the
 * version the preview showed (a second click or an edit since is `conflict`). Then the outline is
 * written if it was derived, the DOCX rendered and stored, every point in it published, the
 * registry entries it printed first marked, the report of every akce it printed a placeholder
 * for closed, and the PDF queued for the worker.
 */
export const generateIssue = defineUseCase({
  name: 'issues.generate',
  mode: 'write',
  input: generateIssueInput,
  output: generateIssueOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.generate' }) },
  async execute({ tx, actor, now }, input) {
    if (!input.confirmed) return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });

    const { slots, rule } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    if (slot.status !== 'open') return fail({ code: 'rule', rule: 'issue-not-open' });

    // The issue row is taken before anything is read, so a placeholder save (which takes it too)
    // is either committed and read here, or waits for this generation and finds the porada closed.
    const { issue: ensured } = await ensureIssue(tx, monday, rule);
    const issue = await tx.issues.lock(ensured.id);
    if (issue.status !== 'open') return fail({ code: 'rule', rule: 'issue-not-open' });
    const step = transition(ISSUE_MACHINE, issue.status, 'generate', {
      kind: 'user',
      role: actor.role,
      isAuthor: false,
    });
    if (!step.ok) return fromTransition(step);
    const expected = input.expectedVersion ?? UNTOUCHED_VERSION;
    if (issue.version !== expected) return fail({ code: 'conflict' });

    // The points are locked, then the row is taken at the version the preview showed: an edit or
    // a second generation that committed in between makes this StaleVersion (`conflict`).
    const { snapshot, problems, facts, publish } = await assembleIssueSnapshot(tx, monday, {
      now,
      lock: true,
    });
    const blocked = preflight(facts, problems, now).some((f) => f.level === 'block');
    if (blocked || snapshot === null) return fail({ code: 'rule', rule: 'issue-blocked' });
    const after = await tx.issues.setStatus(issue.id, expected, step.to);

    const { points, entryIds } = publish;
    await materialize(tx, issue.id, monday, points);
    const docx = await renderDocx(composeDocument(snapshot));
    const document = await tx.documents.insert({ issueId: issue.id, snapshot, docx });

    for (const point of points) {
      const published = transition(POINT_MACHINE, point.state, 'publish', { kind: 'system' });
      if (!published.ok) return fromTransition(published);
      const moved = await tx.points.update(point.id, point.version, { state: published.to });
      await tx.pointEvents.append({
        pointId: point.id,
        event: 'publish',
        fromState: point.state,
        toState: published.to,
      });
      await tx.audit.record(pointEvent('point.published', point, moved));
    }
    await closeMissing(tx, publish.missing);
    const stamped = await tx.registry.stampPublished(issue.id, entryIds);

    await tx.jobs.enqueue(
      'pdf.render',
      { documentId: document.id },
      { dedupeKey: `pdf:${document.id}` },
    );
    const related: AuditTarget[] = [
      { type: 'document', id: document.id },
      ...stamped.map((id) => ({ type: 'registry_entry' as const, id })),
    ];
    await tx.audit.record({
      ...issueEvent('issue.generated', issue, after, {
        monday: toIsoDate(monday),
        documentId: document.id,
        docxSha256: document.docxSha256,
        points: points.length,
        missing: publish.missing.length,
        entries: stamped.length,
      }),
      related,
    });
    return ok({ documentId: document.id, version: after.version });
  },
});
