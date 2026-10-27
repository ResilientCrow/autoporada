'use client';

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
import { bulletsEdit, withPatch, type Edit, type Patch } from './report-patch';
import { issuesAfter, issuesAfterRows, saveIssues } from './save-issues';

export type SavePointAction = ServerAction<
  z.input<typeof savePointInput>,
  z.output<typeof savePointOutput>
>;
export type PointStatusAction = ServerAction<
  z.input<typeof pointStatusInput>,
  z.output<typeof pointStatusOutput>
>;

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
  today,
  recents,
  directory,
  savePoint,
  pointStatus,
}: {
  readonly id: string;
  /** The type's name, or the kind's for a point without a type. */
  readonly typeLabel: string;
  readonly version: number;
  readonly content: PointContentWire;
  /** The type's bullets: which the author must keep, and which they may take out. */
  readonly spec: readonly BulletSpec[];
  /** The day the people's classes are worked out for. */
  readonly today: CalDate;
  /** The people this author put on their latest points, to offer first. */
  readonly recents: readonly RecentPerson[];
  /** Whether the school directory is searched at all (`DIRECTORY=off` is `off`). */
  readonly directory: Directory;
  readonly savePoint: SavePointAction;
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

  const apply = (next: Edit) => {
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
    apply(next);
    setRefused((previous) => issuesAfterRows(previous, before, next.bullets));
  };

  // Inline only: the form's own issues would lead with the error summary and take focus.
  const shown = refused === null ? null : saveIssues(refused, content, spec);
  const state = { ...EDITOR_FORM_STATE, problem: shown?.problem ?? null };
  const issues = shown?.messages ?? NO_MESSAGES;

  return (
    <Form id={EDITOR_FORM_ID} spec={editorSpec(bullets, spec)} state={state}>
      <AutosaveStatus {...autosave.status} />
      <dl>
        <dt className="font-bold">{points.editor.type}</dt>
        <dd>{typeLabel}</dd>
      </dl>
      <ReportFields
        content={content}
        issues={issues}
        readOnly={autosave.readOnly}
        onChange={change}
        onBlur={autosave.onBlur}
      />
      {/* The opening sentence belongs after the bullets, before the body. */}
      <Bullets
        bullets={bullets}
        spec={spec}
        issues={issues}
        readOnly={autosave.readOnly}
        today={today}
        recents={recents}
        directory={directory}
        onChange={changeBullets}
        onBlur={autosave.onBlur}
      />
      <BodyField
        text={bodyInput}
        issue={issues['body']}
        readOnly={autosave.readOnly}
        onChange={(text, body) => {
          setBodyInput(text);
          change({ body });
        }}
        onBlur={autosave.onBlur}
      />
      {shown?.notice ? <Notice tone="problem">{shown.notice}</Notice> : null}
      {/* The statements follow the body; the readiness list and the submit button come last. */}
    </Form>
  );
}
