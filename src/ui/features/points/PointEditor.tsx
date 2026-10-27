'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { z } from 'zod';

import type {
  pointStatusInput,
  pointStatusOutput,
  savePointInput,
  savePointOutput,
  ServerAction,
} from '@/contracts';
import { points } from '@/ui/copy';
import { AutosaveStatus, Form, useAutosave } from '@/ui/form';

import type { FieldIssues } from '@/contracts';

import { saveAnswer, statusAnswer } from './answers';
import { EDITOR_FORM_ID, EDITOR_FORM_STATE, EDITOR_SPEC } from './editor-form';
import { bodyText, type PointContentWire } from './fields';
import { BodyField, ReportFields } from './ReportFields';
import { withPatch, type Patch } from './report-patch';
import { issuesAfter, saveIssues } from './save-issues';

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
  savePoint,
  pointStatus,
}: {
  readonly id: string;
  /** The type's name, or the kind's for a point without a type. */
  readonly typeLabel: string;
  readonly version: number;
  readonly content: PointContentWire;
  readonly savePoint: SavePointAction;
  readonly pointStatus: PointStatusAction;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initial);
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

  const change = (patch: Patch) => {
    const next = withPatch(content, patch);
    setContent(next);
    autosave.onChange(next);
  };

  // Inline only: the form's own issues would lead with the error summary and take focus.
  const shown = refused === null ? null : saveIssues(refused, content);
  const state = { ...EDITOR_FORM_STATE, problem: shown?.problem ?? null };

  return (
    <Form id={EDITOR_FORM_ID} spec={EDITOR_SPEC} state={state}>
      <AutosaveStatus {...autosave.status} />
      <dl>
        <dt className="font-bold">{points.editor.type}</dt>
        <dd>{typeLabel}</dd>
      </dl>
      <ReportFields
        content={content}
        issues={shown?.messages ?? NO_MESSAGES}
        readOnly={autosave.readOnly}
        onChange={change}
        onBlur={autosave.onBlur}
      />
      {/* The people bullets and the opening sentence belong here, before the body. */}
      <BodyField
        text={bodyInput}
        issue={shown?.messages['body']}
        readOnly={autosave.readOnly}
        onChange={(text, body) => {
          setBodyInput(text);
          change({ body });
        }}
        onBlur={autosave.onBlur}
      />
      {/* The statements follow the body; the readiness list and the submit button come last. */}
    </Form>
  );
}
