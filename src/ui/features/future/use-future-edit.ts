'use client';

import { useCallback, useRef, useState } from 'react';

import type { ActionResult, FieldIssues } from '@/contracts';

import {
  issuesOf,
  messagesOf,
  patchFor,
  refusedAfter,
  sameContent,
  startEdit,
  withPatch,
  withResponsible,
  type FutureContentWire,
  type FutureEdit,
  type PatchName,
  type ResponsibleDraft,
} from './edit';

/**
 * An item's fields being edited (design section 12): the content in the wire form the save takes,
 * the responsible people as the field holds them, and what the contract refused in the last save.
 * Every change goes through one way in, which hands the new content to `onChange` unless it is the
 * content already held (a verb picked while nobody is named saves nothing). The owner saves: the
 * autosave for a draft, one press for an approved akce; the autosave passes each answer to
 * `afterSave`.
 */
export function useFutureEdit({
  initial,
  onChange,
}: {
  readonly initial: FutureContentWire;
  readonly onChange: (content: FutureContentWire) => void;
}) {
  const [edit, setEdit] = useState<FutureEdit>(() => startEdit(initial));
  // The latest edit, for a change that follows another before the page renders again.
  const latest = useRef(edit);
  const [refused, setRefused] = useState<FieldIssues | null>(null);

  const apply = (next: FutureEdit) => {
    const changed = !sameContent(latest.current.content, next.content);
    latest.current = next;
    setEdit(next);
    if (changed) onChange(next.content);
  };

  const afterSave = useCallback(
    (result: ActionResult<{ readonly version: number }>) =>
      setRefused((previous) => refusedAfter(previous, result)),
    [],
  );

  // Inline only: the form's own issues would lead with the error summary and take focus.
  const found = refused === null ? null : issuesOf(refused);
  return {
    edit,
    latest,
    afterSave,
    /** The messages of the last refused save, by field name. */
    messages: found === null ? {} : messagesOf(found.known, edit.content),
    patch: (name: PatchName, value: string) => {
      const { content } = latest.current;
      apply(withPatch(latest.current, patchFor(name, value, content)));
    },
    setResponsible: (change: Partial<ResponsibleDraft>) =>
      apply(withResponsible(latest.current, change)),
  };
}
