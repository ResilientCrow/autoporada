'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { ReviewDecision } from '@/domain/review';
import { review } from '@/ui/copy';
import { fieldId, LiveStatus, NoScriptNotice } from '@/ui/form';

import {
  barChoices,
  REVIEW_HEADING_ID,
  type DecidePointAction,
  type DecisionBarModel,
} from './decision';
import { DecisionPanel } from './DecisionPanel';
import { EDITOR_FORM_ID } from './editor-form';
import { reviewHost, type ReviewEditAction } from './review-edit';
import { ReviewEditor, type ReviewEditorClose, type ReviewEditorModel } from './ReviewEditor';

/**
 * The host of /kontrola/[id] (design section 10, ADR 0013) around the point's read view and the
 * reviewer's decision bar. It outlives the version, so its one status region is mounted before a
 * decision or a saved edit is said into it, while the bar's form and the editor under it are keyed
 * by the version and start afresh after the refresh (a conflict notice, an open note or edits never
 * outlive the version they were about). After a decision or a closed edit it sends focus to the
 * point's title, which stays in place whatever went (the pressed button, the bar, the editor).
 * „Schválit a pokračovat“ says the approval and focuses the title the same way before it opens the
 * next point; that page starts with focus at its top, as any page the app opens does (the route
 * keeps its tab title, so Next.js announces nothing more). „Upravit“ puts the editor in place of
 * the read view and takes the bar away until the editor closes, so no decision is made over edits
 * not yet saved; opening it focuses its first field. Without JavaScript the bar cannot send, and
 * says so once.
 */
export function DecisionBar({
  id,
  version,
  bar,
  decidePoint,
  read = null,
  edit = null,
  reviewEditPoint,
}: {
  readonly id: string;
  readonly version: number;
  readonly bar: DecisionBarModel;
  readonly decidePoint: DecidePointAction;
  /** The point's read view, which the open editor replaces. */
  readonly read?: ReactNode;
  /** Only when the viewer may edit a report: what the editor starts from. */
  readonly edit?: ReviewEditorModel | null;
  readonly reviewEditPoint?: ReviewEditAction;
}) {
  const [said, setSaid] = useState({ message: '', count: 0 });
  const [toTitle, setToTitle] = useState(0);
  const [editing, setEditing] = useState(false);
  const seen = useRef(toTitle);
  useEffect(() => {
    if (toTitle > seen.current) document.getElementById(REVIEW_HEADING_ID)?.focus();
    seen.current = toTitle;
  }, [toTitle]);
  const shows = reviewHost(editing, edit !== null && reviewEditPoint !== undefined);
  useEffect(() => {
    if (shows.editor) document.getElementById(fieldId(EDITOR_FORM_ID, 'title'))?.focus();
  }, [shows.editor]);

  const say = (message: string) => setSaid((s) => ({ message, count: s.count + 1 }));
  const onDecided = (event: ReviewDecision) => {
    say(review.decision.said[event]);
    setToTitle((n) => n + 1);
  };
  const onClosed = (how: ReviewEditorClose) => {
    setEditing(false);
    if (how !== 'cancelled') say(review.edit[how]);
    setToTitle((n) => n + 1);
  };
  const canEdit = edit !== null && reviewEditPoint !== undefined;

  return (
    <>
      {shows.read ? read : null}
      {shows.editor && edit !== null && reviewEditPoint !== undefined ? (
        <ReviewEditor
          key={`edit-${version}`}
          id={id}
          version={version}
          edit={edit}
          reviewEditPoint={reviewEditPoint}
          onClosed={onClosed}
        />
      ) : null}
      {shows.bar ? (
        <DecisionPanel
          key={`decision-${version}`}
          id={id}
          version={version}
          bar={bar}
          decidePoint={decidePoint}
          onDecided={onDecided}
          canEdit={canEdit}
          onEdit={() => setEditing(true)}
        />
      ) : null}
      <LiveStatus message={said.message} count={said.count} />
      {barChoices(bar, canEdit).any && <NoScriptNotice />}
    </>
  );
}
