'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { TitleGender } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import type { BulletSpec, PointKind } from '@/domain/report';
import type { CalDate } from '@/domain/time';
import { review } from '@/ui/copy';
import { Form, type Directory, type Problem } from '@/ui/form';
import { Button } from '@/ui/kit';

import { EDITOR_FORM_ID, EDITOR_FORM_STATE, pointFormSpec } from './editor-form';
import type { PointContentWire } from './fields';
import { ProposalFields } from './ProposalFields';
import { ReportForm } from './ReportForm';
import { reviewEditOutcome, type ReviewEditAction } from './review-edit';
import { useReportEdit } from './use-report-edit';

/** What the page gives the reviewer's editor (server/pages/review.ts), only when they may edit the point. */
export interface ReviewEditorModel {
  readonly content: PointContentWire;
  /** A report gets all of `ReportForm`; a finance or pokyn proposal only its title and text. */
  readonly kind: PointKind;
  /** The type's bullets: which must stay, and which may be taken out. */
  readonly spec: readonly BulletSpec[];
  readonly titleGender: TitleGender | null;
  readonly typeName: string | null;
  /** The day the people's classes are worked out for. */
  readonly today: CalDate;
  /** The people the reviewer named lately, to offer first. */
  readonly recents: readonly RecentPerson[];
  readonly directory: Directory;
}

/** How the editor closed: the edit was saved, there was nothing to save, or „Zrušit úpravy“. */
export type ReviewEditorClose = 'saved' | 'unchanged' | 'cancelled';

const noBlur = () => undefined;

/**
 * A reviewer's edit of a point (design section 10, D13) at one version of the point: the author's
 * fields, saved only by „Uložit úpravy“, which sends the whole content against the version the page
 * showed; „Zrušit úpravy“ drops the edits. A saved edit refreshes the page (the history then names
 * the fields and keeps their old values) and closes the editor, as does an edit with nothing to
 * save; the host says which. Field issues show under their fields; any other refusal is the form's
 * one problem notice: a conflict with its reload, a point that moved on as locked, a refusal as the
 * point being gone. While edits are unsaved, the browser warns before the page is reloaded or
 * closed (`beforeunload`); a link inside the app is not guarded (ADR 0017 item 9).
 */
export function ReviewEditor({
  id,
  version,
  edit,
  reviewEditPoint,
  onClosed,
}: {
  readonly id: string;
  readonly version: number;
  readonly edit: ReviewEditorModel;
  readonly reviewEditPoint: ReviewEditAction;
  readonly onClosed: (how: ReviewEditorClose) => void;
}) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const report = useReportEdit({
    initial: edit.content,
    titleGender: edit.titleGender,
    typeName: edit.typeName,
    spec: edit.spec,
    recents: edit.recents,
    onChange: () => setDirty(true),
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setSending(true);
    const { content } = report.latest.current;
    // A call that failed (the action's promise rejected) is the network problem.
    const result: Awaited<ReturnType<ReviewEditAction>> | null = await reviewEditPoint({
      id,
      expectedVersion: version,
      content,
    }).catch(() => null);
    setSending(false);
    if (result !== null) report.afterSave(result);
    const outcome = reviewEditOutcome(result);
    if (outcome.kind === 'saved' || outcome.kind === 'unchanged') {
      setDirty(false);
      onClosed(outcome.kind);
      if (outcome.kind === 'saved') router.refresh();
      return;
    }
    setProblem(outcome.kind === 'problem' ? outcome.problem : null);
    if (outcome.kind === 'problem') setAttempt((n) => n + 1);
  };

  const { bullets, content, shown } = report;
  const state = {
    ...EDITOR_FORM_STATE,
    problem: problem ?? shown?.problem ?? null,
    attempt,
    submitting: sending ? 'save' : null,
  };
  return (
    <section aria-label={review.edit.label} className="space-y-4">
      <Form
        id={EDITOR_FORM_ID}
        spec={pointFormSpec(edit.kind, bullets, edit.spec, content.statements.length)}
        state={state}
      >
        {edit.kind === 'report' ? (
          <ReportForm
            edit={report}
            readOnly={sending}
            today={edit.today}
            recents={edit.recents}
            directory={edit.directory}
            onBlur={noBlur}
          />
        ) : (
          <ProposalFields edit={report} readOnly={sending} onBlur={noBlur} />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button isPending={sending} onPress={() => void save()}>
            {review.edit.save}
          </Button>
          <Button variant="secondary" isDisabled={sending} onPress={() => onClosed('cancelled')}>
            {review.edit.cancel}
          </Button>
        </div>
      </Form>
    </section>
  );
}
