import type { z } from 'zod';

import type { UserPrincipal } from '@/application/ports';
import { issuePreview, issueWorkspace } from '@/application/use-cases';
import type { issuePreviewOutput, issueWorkspaceOutput } from '@/contracts';
import { composeDocument, type DocumentModel } from '@/document';
import {
  formatDayMonth,
  formatNumericDate,
  formatClock,
  formatTitleDate,
  weekdayName,
} from '@/domain/cs';
import { can } from '@/domain/policy';
import type { IssueStatus } from '@/domain/review';
import { lastSlotMonday } from '@/domain/calendar';
import { addDays, compareDates, instantToWallClock, parseIsoDate, toIsoDate } from '@/domain/time';
import { parseIssueSnapshot } from '@/snapshot';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { readWindow, standingFrom, type StandingModel } from './standing';
import { getViewer, requestId } from './viewer';

type Workspace = z.output<typeof issueWorkspaceOutput>;

async function readWorkspace(viewer: UserPrincipal, monday?: string): Promise<Workspace | null> {
  return orNotFound(
    'issues.workspace',
    await runRegistered(getContainer(), issueWorkspace, {
      principal: viewer,
      requestId: await requestId(),
      input: monday === undefined ? {} : { monday },
    }),
  );
}

/** /porada: the Monday of the porada to prepare, or null when the calendar has none. */
export interface PoradaIndexModel {
  readonly working: string | null;
  /** A staff reviewer reads the preview only (D14, V11). */
  readonly reviewer: boolean;
}

/** The index of „Porada“, or null (404) for anyone but the headmaster and the staff reviewers. */
export async function poradaIndexPage(): Promise<PoradaIndexModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.preview' })) return null;
  const read = await readWorkspace(viewer);
  return read && { working: read.working, reviewer: !can(viewer.actor, { action: 'issue.edit' }) };
}

/** /porada/[datum]: one porada as the headmaster prepares it, its dates written out. */
interface PoradaPageModel {
  /** The slot's key, in the URLs of its steps. */
  readonly monday: string;
  /** „pondělí 9. listopadu 2026“: where the porada is held. */
  readonly meeting: string;
  /** „9. 11. 2026“. */
  readonly meetingLabel: string;
  /** „9. 11.“ when the porada is held on another day than its Monday. */
  readonly movedFrom: string | null;
  readonly deadline: { readonly weekday: string; readonly date: string; readonly time: string };
  readonly deadlinePassed: boolean;
  readonly status: IssueStatus;
  /** Null for a Monday without a row yet. */
  readonly version: number | null;
  /** „10. 11. 2026“: the porada the approved points move to if this one is skipped. */
  readonly nextLabel: string | null;
  readonly counts: NonNullable<Workspace['slot']>['counts'];
}

/** The page of one slot: the headmaster's workspace, or for a staff reviewer the preview to go to. */
export type PoradaPageResult =
  | { readonly kind: 'workspace'; readonly model: PoradaPageModel }
  | { readonly kind: 'preview'; readonly monday: string };

/** The page of one slot, or null (404) for anyone else and for a Monday outside the calendar. */
export async function poradaPage(datum: string): Promise<PoradaPageResult | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.preview' })) return null;
  const read = await readWorkspace(viewer, datum);
  if (read === null || read.slot === null) return null;
  const { slot } = read;
  if (!can(viewer.actor, { action: 'issue.edit' })) return { kind: 'preview', monday: slot.monday };
  const monday = parseIsoDate(slot.monday);
  const meeting = parseIsoDate(slot.meetingDate);
  const deadlineAt = new Date(slot.deadlineAt);
  const { date, time } = instantToWallClock(deadlineAt);
  return {
    kind: 'workspace',
    model: {
      monday: slot.monday,
      meeting: formatTitleDate(meeting),
      meetingLabel: formatNumericDate(meeting),
      movedFrom: compareDates(monday, meeting) === 0 ? null : formatDayMonth(monday),
      deadline: { weekday: weekdayName(date), date: formatDayMonth(date), time: formatClock(time) },
      deadlinePassed: deadlineAt.getTime() <= getContainer().app.clock.now().getTime(),
      status: slot.status,
      version: slot.version,
      nextLabel: slot.next === null ? null : formatNumericDate(parseIsoDate(slot.next)),
      counts: slot.counts,
    },
  };
}

/** /porada/[datum]/presunout: what the move form needs of the slot and the calendar around it. */
export interface MovePageModel {
  readonly monday: string;
  readonly view: {
    readonly monday: string;
    readonly version: number | null;
    readonly meetingDate: string;
    readonly deadlineAt: string;
    readonly today: string;
    readonly last: string;
    readonly issues: StandingModel['issues'];
    readonly now: string;
    readonly rule: StandingModel['rule'];
  };
  /** „pondělí 9. listopadu 2026“, for the heading. */
  readonly meeting: string;
}

/** The move page of one slot, or null (404) for anyone but the headmaster and for a slot that is not open (unskip it first). */
export async function poradaMovePage(datum: string): Promise<MovePageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.generate' })) return null;
  const [read, window] = await Promise.all([readWorkspace(viewer, datum), readWindow(viewer)]);
  if (read === null || read.slot === null || window === null) return null;
  const { slot } = read;
  if (slot.status !== 'open') return null;
  const now = getContainer().app.clock.now();
  const today = instantToWallClock(now).date;
  const standing = standingFrom(window, now);
  return {
    monday: slot.monday,
    meeting: formatTitleDate(parseIsoDate(slot.meetingDate)),
    view: {
      monday: slot.monday,
      version: slot.version,
      meetingDate: slot.meetingDate,
      deadlineAt: slot.deadlineAt,
      today: toIsoDate(today),
      // The horizon of the calendar (`issues.move` accepts the same).
      last: toIsoDate(addDays(lastSlotMonday(today), 6)),
      issues: standing.issues,
      now: standing.now,
      rule: standing.rule,
    },
  };
}

type Preview = z.output<typeof issuePreviewOutput>;

/** /porada/[datum]/nahled: the document as it would print now and what to know before generating it. */
export interface PreviewPageModel {
  readonly monday: string;
  /** „pondělí 9. listopadu 2026“. */
  readonly meeting: string;
  /** The headmaster may go back to the workspace; a reviewer only reads. */
  readonly canEdit: boolean;
  /** Null when the snapshot is invalid (a `snapshot-invalid` finding says where). */
  readonly document: DocumentModel | null;
  readonly findings: Preview['findings'];
}

/** The preview of one slot, or null (404) for anyone but the staff and for a Monday outside the calendar. */
export async function previewPage(datum: string): Promise<PreviewPageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.preview' })) return null;
  const read = await readWorkspace(viewer, datum);
  if (read === null || read.slot === null) return null;
  const preview = orNotFound(
    'issues.preview',
    await runRegistered(getContainer(), issuePreview, {
      principal: viewer,
      requestId: await requestId(),
      input: { monday: read.slot.monday },
    }),
  );
  if (preview === null) return null;
  // The use case cannot name the snapshot type (contracts) and sends it as JSON text, so the page parses what it composes.
  const parsed =
    preview.snapshot === null ? null : parseIssueSnapshot(JSON.parse(preview.snapshot) as unknown);
  return {
    monday: read.slot.monday,
    meeting: formatTitleDate(parseIsoDate(read.slot.meetingDate)),
    canEdit: can(viewer.actor, { action: 'issue.edit' }),
    // TODO(m9-verify): composeDocument asserts its model invariants; a throw is a fault, not a finding.
    document: parsed?.ok ? composeDocument(parsed.snapshot) : null,
    findings: preview.findings,
  };
}
