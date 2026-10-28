'use client';

import { useCallback, useRef, useState } from 'react';
import type { z } from 'zod';

import type { ActionResult, FieldIssues, savePointOutput } from '@/contracts';
import type { TitleGender } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import type { BulletSpec } from '@/domain/report';

import { keyBullets } from './bullet-chips';
import type { BulletsUpdate } from './Bullets';
import { bodyText, type PointContentWire } from './fields';
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
import { bulletsEdit, statementsEdit, withPatch, type Edit, type Patch } from './report-patch';
import {
  issuesAfter,
  issuesAfterRows,
  issuesAfterStatementRows,
  saveIssues,
  type SaveIssues,
} from './save-issues';
import type { StatementsUpdate } from './Statements';
import { withSyncedSpeakers } from './statements-state';

/** What `useReportEdit` hands the form and its owner. */
export type ReportEdit = ReturnType<typeof useReportEdit>;

/**
 * A report's fields being edited (design sections 6 and 7): the content in the wire form the save
 * takes, the bullets as the rows edit them, the opening sentence's notice and question, and what
 * the contract refused in the last save. Every change goes through one way in, which makes an
 * unedited opening sentence again from the fields and lets the statements' speakers follow the
 * people the bullets name, then hands the new content to `onChange`. The owner saves: the author's
 * editor through the autosave, the reviewer's with an explicit press; either passes the save's
 * answer to `afterSave`.
 */
export function useReportEdit({
  initial,
  titleGender,
  spec,
  recents,
  onChange,
}: {
  readonly initial: PointContentWire;
  /** The type's grammatical gender for the opening sentence; null where it is not known („Jiné“). */
  readonly titleGender: TitleGender | null;
  /** The type's bullets: which must stay, and which may be taken out. */
  readonly spec: readonly BulletSpec[];
  /** The people the editing user named lately, which the speakers follow too. */
  readonly recents: readonly RecentPerson[];
  /** Every change, after the sentence and the speakers followed it. */
  readonly onChange: (content: PointContentWire) => void;
}) {
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
  const afterSave = useCallback(
    (result: ActionResult<z.output<typeof savePointOutput>>) =>
      setRefused((previous) => issuesAfter(previous, result)),
    [],
  );

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
    onChange(next.content);
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

  const changeBody = (text: string, body: PointContentWire['body']) => {
    setBodyInput(text);
    change({ body });
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
  const shown: SaveIssues | null = refused === null ? null : saveIssues(refused, content, spec);

  return {
    content,
    bullets,
    latest,
    bodyInput,
    shown,
    spec,
    stale: noticeShown(content, ctx, basis),
    asking,
    afterSave,
    change,
    changeBullets,
    changeStatements,
    changeBody,
    typeOpening,
    askOpening: () => setAsking(true),
    replaceOpening,
    keepOpening,
  };
}
