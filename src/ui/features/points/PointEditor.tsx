'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { z } from 'zod';

import type {
  pointStatusInput,
  pointStatusOutput,
  savePointInput,
  savePointOutput,
  ServerAction,
} from '@/contracts';
import type { TitleGender } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import type { BulletSpec, PointKind } from '@/domain/report';
import type { CalDate } from '@/domain/time';
import { points } from '@/ui/copy';
import { AutosaveStatus, Form, useAutosave, type Directory } from '@/ui/form';

import { saveAnswer, statusAnswer } from './answers';
import { EDITOR_FORM_ID, EDITOR_FORM_STATE, pointFormSpec } from './editor-form';
import type { PointContentWire } from './fields';
import { LayoutToggle } from './LayoutToggle';
import { PointTransitions } from './PointTransitions';
import { ProposalFields } from './ProposalFields';
import { ReportForm } from './ReportForm';
import { SubmitPanel } from './SubmitPanel';
import { readOnlyWhile } from './submit-press';
import type { StandingInput } from './standing';
import type { PointMoves } from './transition-call';
import { useReportEdit } from './use-report-edit';
import { useSubmit, type SubmitPointAction } from './use-submit';

export type SavePointAction = ServerAction<
  z.input<typeof savePointInput>,
  z.output<typeof savePointOutput>
>;
export type PointStatusAction = ServerAction<
  z.input<typeof pointStatusInput>,
  z.output<typeof pointStatusOutput>
>;

// Loaded as its own chunk, and still rendered on the server: the page shows the paper
// without waiting for the script. The form works without it either way.
const Preview = dynamic(() => import('./Preview').then((loaded) => loaded.Preview));

/**
 * The author's editor of a point (design sections 6, 8 and 11, ADR 0017): the fields are
 * `useReportEdit`'s and `ReportForm`'s, and every change goes to the autosave hook, which
 * saves it after a pause, on leaving a field and when the page is left. The page keys the
 * editor by `editorKey`, so „Načíst aktuální stav“ starts it again from the server's values.
 * Nothing here submits a form; the status line leads the form. A save the contract refuses
 * (end before start, a body too long) parks the text unsaved and shows its message under
 * the field, with no summary and no focus move.
 */
export function PointEditor({
  id,
  kind,
  typeLabel,
  version,
  content: initial,
  spec,
  titleGender,
  typeName,
  today,
  readinessSchoolYear,
  previewSchoolYear,
  standing,
  moves,
  recents,
  directory,
  savePoint,
  submitPoint,
  pointStatus,
}: {
  readonly id: string;
  /** A report gets all of `ReportForm`; a finance or pokyn proposal only its title and text. */
  readonly kind: PointKind;
  /** The type's name, or the kind's for a point without a type. */
  readonly typeLabel: string;
  readonly version: number;
  readonly content: PointContentWire;
  /** The type's bullets: which the author must keep, and which they may take out. */
  readonly spec: readonly BulletSpec[];
  /** The type's grammatical gender for the opening sentence; null where it is not known („Jiné“). */
  readonly titleGender: TitleGender | null;
  readonly typeName: string | null;
  /** The day the people's classes are worked out for. */
  readonly today: CalDate;
  /** Today's school year („2026/2027“): the one the submit checks the classes against (use-cases/points/submit.ts), so the readiness list must too. */
  readonly readinessSchoolYear: string;
  /** The school year of the porada the point goes to: the paper's {skolniRok}. Differs from today's around 1 September. */
  readonly previewSchoolYear: string;
  /** Where the point goes and when that closes, shown with the submit button; null while no porada is open. */
  readonly standing: StandingInput | null;
  /** „Stáhnout“ and „Zrušit bod“ as far as the state allows; withdraw waits for the autosave to land. */
  readonly moves: PointMoves;
  /** The people this author put on their latest points, to offer first. */
  readonly recents: readonly RecentPerson[];
  /** Whether the school directory is searched at all (`DIRECTORY=off` is `off`). */
  readonly directory: Directory;
  readonly savePoint: SavePointAction;
  readonly submitPoint: SubmitPointAction;
  readonly pointStatus: PointStatusAction;
}) {
  const router = useRouter();
  // `autosave` is read when a change comes, after this render has made it.
  const report = useReportEdit({
    initial,
    titleGender,
    typeName,
    spec,
    recents,
    onChange: (next) => autosave.onChange(next),
  });
  const { afterSave } = report;

  // Stable, since the hook hands its runner the latest closures whenever they change.
  const save = useCallback(
    async ({
      content: next,
      expectedVersion,
    }: {
      content: PointContentWire;
      expectedVersion: number;
    }) => {
      const result = await savePoint({ id, expectedVersion, content: next });
      afterSave(result);
      return saveAnswer(result);
    },
    [id, savePoint, afterSave],
  );
  const status = useCallback(
    async () => statusAnswer(await pointStatus({ id })),
    [id, pointStatus],
  );
  const onRefresh = useCallback(() => router.refresh(), [router]);
  const autosave = useAutosave<PointContentWire>({
    initialVersion: version,
    save,
    status,
    onRefresh,
  });
  // „Odeslat ke kontrole“ is never disabled for what is missing: a press with problems lists them
  // (the client's own check first, the server's as the backstop). The form holds still while a send is
  // on its way.
  const submit = useSubmit({
    id,
    kind,
    spec,
    schoolYear: readinessSchoolYear,
    latest: report.latest,
    submitPoint,
    afterLanded: autosave.afterLanded,
  });
  const readOnly = readOnlyWhile(autosave.readOnly, submit.sending);
  const { content, bullets, shown } = report;
  const state = {
    ...EDITOR_FORM_STATE,
    problem: submit.problem ?? shown?.problem ?? null,
    attempt: submit.problemAttempt,
  };

  const form = (
    <div className="bar-room">
      <Form
        id={EDITOR_FORM_ID}
        spec={pointFormSpec(kind, bullets, spec, content.statements.length)}
        state={state}
      >
        <AutosaveStatus {...autosave.status} />
        <dl>
          <dt className="font-bold">{points.editor.type}</dt>
          <dd>{typeLabel}</dd>
        </dl>
        {kind === 'report' ? (
          <ReportForm
            edit={report}
            readOnly={readOnly}
            today={today}
            recents={recents}
            directory={directory}
            onBlur={autosave.onBlur}
          />
        ) : (
          <ProposalFields edit={report} readOnly={readOnly} onBlur={autosave.onBlur} />
        )}
        <SubmitPanel
          kind={kind}
          content={content}
          spec={spec}
          schoolYear={readinessSchoolYear}
          standing={standing}
          summary={submit.summary}
          attempt={submit.summaryAttempt}
          pending={submit.sending}
          held={autosave.readOnly}
          onSubmit={() => void submit.press()}
        />
      </Form>
      {/* Its own form after the editor's: forms do not nest. */}
      <PointTransitions
        id={id}
        version={version}
        moves={moves}
        around={autosave.afterLanded}
        held={readOnly}
      />
    </div>
  );
  return (
    <LayoutToggle
      form={form}
      preview={<Preview kind={kind} content={content} schoolYear={previewSchoolYear} />}
    />
  );
}
