import type { z } from 'zod';

import type { UserPrincipal } from '@/application/ports';
import {
  documentArchive,
  issuePreview,
  issueWorkspace,
  readOutline,
} from '@/application/use-cases';
import {
  isDownloadError,
  toDeadlineRule,
  toIssueRows,
  type documentInfo,
  type DownloadError,
  type PdfFailure,
  type issuePreviewOutput,
  type issueWorkspaceOutput,
} from '@/contracts';
import { composeDocument, type DocumentModel } from '@/document';
import { issueSlots, planDrop } from '@/domain/calendar';
import {
  formatDayMonth,
  formatNumericDate,
  formatClock,
  formatTitleDate,
  weekdayName,
} from '@/domain/cs';
import { can } from '@/domain/policy';
import type { IssueStatus } from '@/domain/review';
import { instantToWallClock, parseIsoDate, toIsoDate } from '@/domain/time';
import { parseIssueSnapshot } from '@/snapshot';

import { getContainer } from '../container';
import { runPage } from './run-page';

import { orNotFound } from './not-found';
import { first, type SearchParams } from './params';
import { readWindow, standingFrom, type StandingModel } from './standing';
import { getViewer, requestId } from './viewer';

type Workspace = z.output<typeof issueWorkspaceOutput>;

/** A generated document with its date written out, „31. 10. 2026“ and „14:05“. */
interface GeneratedModel {
  readonly monday: string;
  readonly date: string;
  readonly time: string;
  readonly pdf: z.output<typeof documentInfo>['pdfStatus'];
  /** Why the PDF failed; null unless it did, and for a failure from before the reason was kept. */
  readonly pdfFailure: PdfFailure | null;
}

function generatedOf(monday: string, info: z.output<typeof documentInfo>): GeneratedModel {
  const { date, time } = instantToWallClock(new Date(info.generatedAt));
  return {
    monday,
    date: formatNumericDate(date),
    time: formatClock(time),
    pdf: info.pdfStatus,
    pdfFailure: info.pdfFailure,
  };
}

const generatedModel = (monday: string, info: z.output<typeof documentInfo> | null) =>
  info === null ? null : generatedOf(monday, info);

async function readWorkspace(viewer: UserPrincipal, monday?: string): Promise<Workspace | null> {
  return orNotFound(
    'issues.workspace',
    await runPage(issueWorkspace, {
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
  /** The day the porada is held, ISO. */
  readonly meetingDate: string;
  readonly deadline: { readonly weekday: string; readonly date: string; readonly time: string };
  readonly deadlinePassed: boolean;
  readonly status: IssueStatus;
  /** Null for a Monday without a row yet. */
  readonly version: number | null;
  /**
   * The calendar the move and drop dialogs plan on (ADR 0054): `issues.window`, the instant it was
   * read, the rule and the boundary. Null unless the porada is open, and where the use case refuses it.
   */
  readonly calendar: Pick<StandingModel, 'issues' | 'now' | 'rule' | 'plannedThrough'> | null;
  /**
   * What „Porada se nekoná“ does to the prepared program (ADR 0054 item 4): `along` when the
   * porada has one of its own and the heir takes it, `lost` when it has one and the heir cannot,
   * null when it has none. Null unless the porada is open.
   */
  readonly dropProgram: 'along' | 'lost' | null;
  readonly counts: NonNullable<Workspace['slot']>['counts'];
  /** The document of a generated porada; null before. */
  readonly generated: GeneratedModel | null;
}

/** The page of one slot: the headmaster's workspace, or for a staff reviewer the preview to go to. */
export type PoradaPageResult =
  | { readonly kind: 'workspace'; readonly model: PoradaPageModel }
  | { readonly kind: 'preview'; readonly monday: string };

/** Whether the open porada of `monday` has a stored program, and whether its heir can take it. */
async function dropProgramOf(
  viewer: UserPrincipal,
  monday: string,
  window: NonNullable<Awaited<ReturnType<typeof readWindow>>>,
  now: Date,
): Promise<'along' | 'lost' | null> {
  const today = instantToWallClock(now).date;
  const rule = toDeadlineRule(window.rule);
  const slots = issueSlots(
    toIssueRows(window.issues),
    today,
    rule,
    parseIsoDate(window.plannedThrough),
  );
  const slot = slots.find((s) => toIsoDate(s.monday) === monday);
  if (slot === undefined) return null;
  const planned = planDrop(slots, slot, {
    rule,
    plannedThrough: parseIsoDate(window.plannedThrough),
  });
  if (!planned.ok) return null;
  const read = async (key: string) =>
    orNotFound(
      'outline.read',
      await runPage(readOutline, {
        principal: viewer,
        requestId: await requestId(),
        input: { monday: key },
      }),
    );
  const own = await read(monday);
  if (own === null || own.origin.kind !== 'stored') return null;
  if (planned.heir.status !== 'open') return 'lost';
  const heir = await read(toIsoDate(planned.heir.monday));
  return heir !== null && heir.origin.kind !== 'stored' ? 'along' : 'lost';
}

/** The page of one slot, or null (404) for anyone else and for a Monday outside the calendar. */
export async function poradaPage(datum: string): Promise<PoradaPageResult | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.preview' })) return null;
  const read = await readWorkspace(viewer, datum);
  if (read === null || read.slot === null) return null;
  const { slot } = read;
  if (!can(viewer.actor, { action: 'issue.edit' })) return { kind: 'preview', monday: slot.monday };
  const meeting = parseIsoDate(slot.meetingDate);
  const deadlineAt = new Date(slot.deadlineAt);
  const { date, time } = instantToWallClock(deadlineAt);
  const now = getContainer().app.clock.now();
  const window = slot.status === 'open' ? await readWindow(viewer) : null;
  const standing = window && standingFrom(window, now);
  const dropProgram = window && (await dropProgramOf(viewer, slot.monday, window, now));
  return {
    kind: 'workspace',
    model: {
      monday: slot.monday,
      meeting: formatTitleDate(meeting),
      meetingLabel: formatNumericDate(meeting),
      meetingDate: slot.meetingDate,
      deadline: { weekday: weekdayName(date), date: formatDayMonth(date), time: formatClock(time) },
      deadlinePassed: deadlineAt.getTime() <= now.getTime(),
      status: slot.status,
      version: slot.version,
      calendar: standing && {
        issues: standing.issues,
        now: standing.now,
        rule: standing.rule,
        plannedThrough: standing.plannedThrough,
      },
      dropProgram,
      counts: slot.counts,
      generated: generatedModel(slot.monday, slot.document),
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
  /** The headmaster's generate form for an open porada; null otherwise. */
  readonly generate: {
    readonly monday: string;
    readonly version: number | null;
    readonly blocked: boolean;
  } | null;
  /** A generated porada: its document; the paper is the snapshot it was generated from. */
  readonly generated: GeneratedModel | null;
}

/** The preview of one slot, or null (404) for anyone but the staff and for a Monday outside the calendar. */
export async function previewPage(datum: string): Promise<PreviewPageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.preview' })) return null;
  const read = await readWorkspace(viewer, datum);
  if (read === null || read.slot === null) return null;
  const preview = orNotFound(
    'issues.preview',
    await runPage(issuePreview, {
      principal: viewer,
      requestId: await requestId(),
      input: { monday: read.slot.monday },
    }),
  );
  if (preview === null) return null;
  // The use case cannot name the snapshot type (contracts) and sends it as JSON text, so the page parses what it composes.
  const parsed =
    preview.snapshot === null ? null : parseIssueSnapshot(JSON.parse(preview.snapshot) as unknown);
  const { slot } = read;
  const generate =
    slot.status === 'open' && can(viewer.actor, { action: 'issue.generate' })
      ? {
          monday: slot.monday,
          version: slot.version,
          blocked: preview.findings.some((f) => f.level === 'block'),
        }
      : null;
  return {
    monday: slot.monday,
    meeting: formatTitleDate(parseIsoDate(slot.meetingDate)),
    canEdit: can(viewer.actor, { action: 'issue.edit' }),
    // TODO(m9-verify): composeDocument asserts its model invariants; a throw is a fault, not a finding.
    document: parsed?.ok ? composeDocument(parsed.snapshot) : null,
    findings: preview.findings,
    generate,
    generated: generatedModel(slot.monday, preview.document),
  };
}

/** /porada/archiv: every generated porada, the latest meeting first, with its files. */
export interface ArchivePageModel {
  /** Why the download that sent the reader here gave no file; null when none did. */
  readonly problem: DownloadError | null;
  readonly documents: readonly (GeneratedModel & {
    /** „pondělí 9. listopadu 2026“: the day it was held. */
    readonly meeting: string;
  })[];
}

/**
 * The archive, or null (404) for anyone but the headmaster and the staff reviewers. `chyba` is
 * what a download that gave no file wrote; a value outside its set is ignored.
 */
export async function archivePage(params: SearchParams): Promise<ArchivePageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'archive.view' })) return null;
  const read = orNotFound(
    'documents.archive',
    await runPage(documentArchive, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  );
  if (read === null) return null;
  const chyba = first(params['chyba']);
  return {
    problem: isDownloadError(chyba) ? chyba : null,
    documents: read.documents.map((document) => ({
      ...generatedOf(document.monday, document),
      meeting: formatTitleDate(parseIsoDate(document.meetingDate)),
    })),
  };
}
