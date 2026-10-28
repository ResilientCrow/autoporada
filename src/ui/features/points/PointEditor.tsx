'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
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
import type { BulletSpec } from '@/domain/report';
import type { CalDate } from '@/domain/time';
import { points } from '@/ui/copy';
import { AutosaveStatus, Form, useAutosave, type Directory } from '@/ui/form';
import { Notice } from '@/ui/kit';

import type { FieldIssues } from '@/contracts';

import { saveAnswer, statusAnswer } from './answers';
import { keyBullets } from './bullet-chips';
import { Bullets, type BulletsUpdate } from './Bullets';
import { EDITOR_FORM_ID, EDITOR_FORM_STATE, editorSpec } from './editor-form';
import { bodyText, type PointContentWire } from './fields';
import { BodyField, ReportFields } from './ReportFields';
import { OpeningSentence } from './OpeningSentence';
import {
  basisAfterTyping,
  generated,
  keptBasis,
  noticeShown,
  replaced,
  typed,
  withOpeningEdit,
  type OpeningContext,
} from './opening-state';
import { LayoutToggle } from './LayoutToggle';
import { PointTransitions } from './PointTransitions';
import { SubmitPanel } from './SubmitPanel';
import { bulletsEdit, statementsEdit, withPatch, type Edit, type Patch } from './report-patch';
import { issuesAfter, issuesAfterRows, issuesAfterStatementRows, saveIssues } from './save-issues';
import { Statements, type StatementsUpdate } from './Statements';
import { withSyncedSpeakers } from './statements-state';
import { readOnlyWhile } from './submit-press';
import type { StandingInput } from './standing';
import type { PointMoves } from './transition-call';
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

const NO_MESSAGES: Readonly<Record<string, string>> = {};

/**
 * The author's editor of a report (design sections 6 and 8, ADR 0017): the content
 * lives here, in the wire form the save takes, and every change goes to the autosave
 * hook, which saves it after a pause, on leaving a field and when the page is left. The
 * page keys the editor by `editorKey`, so „Načíst aktuální stav“ starts it again from
 * the server's values. Nothing here submits a form; the status line leads the form. A
 * save the contract refuses (end before start, a body too long) parks the text unsaved
 * and shows its message under the field, with no summary and no focus move.
 */
export function PointEditor({
  id,
  typeLabel,
  version,
  content: initial,
  spec,
  titleGender,
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
  /** The type's name, or the kind's for a point without a type. */
  readonly typeLabel: string;
  readonly version: number;
  readonly content: PointContentWire;
  /** The type's bullets: which the author must keep, and which they may take out. */
  readonly spec: readonly BulletSpec[];
  /** The type's grammatical gender for the opening sentence; null where it is not known („Jiné“). */
  readonly titleGender: TitleGender | null;
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
  // The chips carry the keys a people field tracks them by, minted once here and kept
  // through every edit; the content holds the bullets without them, as the save takes them.
  const [edit, setEdit] = useState<Edit>(() => ({
    content: initial,
    bullets: keyBullets(initial.bullets),
  }));
  // The latest edit, for a change that follows another before the page renders again.
  const latest = useRef(edit);
  const { content, bullets } = edit;
  const [bodyInput, setBodyInput] = useState(() => bodyText(initial.body));
  // What the contract refused in the last save, until a save is accepted.
  const [refused, setRefused] = useState<FieldIssues | null>(null);

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
      setRefused((previous) => issuesAfter(previous, result));
      return saveAnswer(result);
    },
    [id, savePoint],
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
    spec,
    schoolYear: readinessSchoolYear,
    latest,
    submitPoint,
    afterLanded: autosave.afterLanded,
  });
  const readOnly = readOnlyWhile(autosave.readOnly, submit.sending);

  const ctx: OpeningContext = { titleGender, spec };
  // What the fields made when the text became the author's or when they chose to keep it,
  // in this page's memory only: a reload starts from what the loaded fields make, with no
  // notice. Only those two moments (and the load) move it; an answer resolves a notice.
  const [basis, setBasis] = useState(() => generated(initial, titleGender, spec));
  // The question „Nahradit vaši větu novou?“ is open.
  const [asking, setAsking] = useState(false);

  // The one way in for a change, fields and bullets alike: a sentence the author has not
  // edited is made again from the fields before it is shown and saved, and after a change to
  // the bullets the statements' speakers follow the people they name.
  const apply = (changed: Edit) => {
    const next = withSyncedSpeakers(latest.current, withOpeningEdit(changed, ctx), recents);
    latest.current = next;
    setEdit(next);
    autosave.onChange(next.content);
  };
  const change = (patch: Patch) =>
    apply({ ...latest.current, content: withPatch(latest.current.content, patch) });
  // A refusal names bullets by their place, so a change of the rows retires those messages.
  const changeBullets = (update: BulletsUpdate) => {
    const before = latest.current.bullets;
    const next = bulletsEdit(latest.current, update);
    // A change that changes nothing (a refused add) is no change: nothing to save.
    if (next === latest.current) return;
    apply(next);
    setRefused((previous) => issuesAfterRows(previous, before, next.bullets));
  };

  // A refusal names statements by their place too: adding, removing or moving retires those messages.
  const changeStatements = (update: StatementsUpdate, rows: boolean) => {
    const next = statementsEdit(latest.current, update);
    // A change that changes nothing (a blur without an edit) is no change: nothing to save.
    if (next === latest.current) return;
    apply(next);
    if (rows) setRefused((previous) => issuesAfterStatementRows(previous));
  };

  // Typing closes the question, so „Ano, nahradit“ never overwrites text typed after asking.
  const typeOpening = (text: string) => {
    const before = latest.current.content;
    setBasis((current) => basisAfterTyping(before, current, ctx));
    setAsking(false);
    apply({ ...latest.current, content: typed(before, text) });
  };
  // The recompute in `apply` writes the sentence once the flag is cleared.
  const replaceOpening = () => {
    setAsking(false);
    apply({ ...latest.current, content: replaced(latest.current.content) });
  };
  const keepOpening = () => {
    setAsking(false);
    setBasis(keptBasis(latest.current.content, ctx));
  };

  // Inline only: the form's own issues would lead with the error summary and take focus.
  const shown = refused === null ? null : saveIssues(refused, content, spec);
  const state = {
    ...EDITOR_FORM_STATE,
    problem: submit.problem ?? shown?.problem ?? null,
    attempt: submit.problemAttempt,
  };
  const issues = shown?.messages ?? NO_MESSAGES;

  const form = (
    <div className="bar-room">
      <Form
        id={EDITOR_FORM_ID}
        spec={editorSpec(bullets, spec, content.statements.length)}
        state={state}
      >
        <AutosaveStatus {...autosave.status} />
        <dl>
          <dt className="font-bold">{points.editor.type}</dt>
          <dd>{typeLabel}</dd>
        </dl>
        <ReportFields
          content={content}
          issues={issues}
          readOnly={readOnly}
          onChange={change}
          onBlur={autosave.onBlur}
        />
        <Bullets
          bullets={bullets}
          spec={spec}
          issues={issues}
          readOnly={readOnly}
          today={today}
          recents={recents}
          directory={directory}
          onChange={changeBullets}
          onBlur={autosave.onBlur}
        />
        <OpeningSentence
          text={content.opening}
          stale={noticeShown(content, ctx, basis)}
          asking={asking}
          issue={issues['opening']}
          readOnly={readOnly}
          onType={typeOpening}
          onAsk={() => setAsking(true)}
          onReplace={replaceOpening}
          onKeep={keepOpening}
          onBlur={autosave.onBlur}
        />
        <BodyField
          text={bodyInput}
          issue={issues['body']}
          readOnly={readOnly}
          onChange={(text, body) => {
            setBodyInput(text);
            change({ body });
          }}
          onBlur={autosave.onBlur}
        />
        <Statements
          bullets={content.bullets}
          statements={content.statements}
          issues={issues}
          readOnly={readOnly}
          today={today}
          recents={recents}
          directory={directory}
          onChange={changeStatements}
          onBlur={autosave.onBlur}
        />
        {shown?.notice ? <Notice tone="problem">{shown.notice}</Notice> : null}
        <SubmitPanel
          kind="report"
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
      preview={<Preview content={content} schoolYear={previewSchoolYear} />}
    />
  );
}
