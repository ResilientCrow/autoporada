'use client';

import { porada } from '@/ui/copy';
import { Form, SubmitButton, useActionForm } from '@/ui/form';
import { ArrowLink, StatusChip } from '@/ui/kit';

import {
  moveInput,
  removeInput,
  type OutlineMoveAction,
  type OutlineRemoveAction,
  type OutlineRowView,
} from './outline';

const { outline } = porada;

/** A proposal nobody placed yet asks for attention; a placed one is settled. */
const toneOf = (isNew: boolean) => (isNew ? NEW_TONE : PLACED_TONE);
const NEW_TONE = 'attention';
const PLACED_TONE = 'done';

/** The ↑↓ pair of one item; the first cannot go up and the last cannot go down. */
function MoveButtons({
  action,
  monday,
  version,
  row,
  first,
  last,
  onDone,
}: {
  readonly action: OutlineMoveAction;
  readonly monday: string;
  readonly version: number | null;
  readonly row: OutlineRowView;
  readonly first: boolean;
  readonly last: boolean;
  readonly onDone: () => void;
}) {
  const state = useActionForm({
    action,
    toInput: moveInput(monday, version, row.lineageId),
    onSuccess: onDone,
  });
  return (
    <Form id={`poradi-${row.lineageId}`} spec={{}} state={state}>
      <div role="group" aria-label={outline.move.label(row.title)} className="flex gap-3">
        <SubmitButton name="direction" value="up" variant="secondary" isDisabled={first}>
          {outline.move.up}
        </SubmitButton>
        <SubmitButton name="direction" value="down" variant="secondary" isDisabled={last}>
          {outline.move.down}
        </SubmitButton>
      </div>
    </Form>
  );
}

function RemoveButton({
  action,
  monday,
  version,
  row,
  titleId,
  onDone,
}: {
  readonly action: OutlineRemoveAction;
  readonly monday: string;
  readonly version: number | null;
  readonly row: OutlineRowView;
  readonly titleId: string;
  readonly onDone: () => void;
}) {
  const state = useActionForm({
    action,
    toInput: removeInput(monday, version, row.lineageId),
    onSuccess: onDone,
  });
  return (
    <Form id={`odebrat-${row.lineageId}`} spec={{}} state={state}>
      <SubmitButton variant="secondary" describedBy={titleId}>
        {outline.remove}
      </SubmitButton>
    </Form>
  );
}

/**
 * One item of a section: its title with a badge for a slot, a chip for how long it stays and a
 * flag for a newly approved proposal, then the order buttons, „Upravit“ (for a proposal a link to
 * its review instead) and, for an item the headmaster added, „Odebrat“.
 */
export function OutlineRow({
  monday,
  version,
  row,
  first,
  last,
  move,
  remove,
  onMoved,
  onRemoved,
}: {
  readonly monday: string;
  readonly version: number | null;
  readonly row: OutlineRowView;
  readonly first: boolean;
  readonly last: boolean;
  readonly move: OutlineMoveAction;
  readonly remove: OutlineRemoveAction;
  readonly onMoved: () => void;
  readonly onRemoved: () => void;
}) {
  const { proposal } = row;
  const titleId = `bod-${row.lineageId}`;
  return (
    <li className="space-y-3 rounded-brand border-2 border-ink p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span id={titleId} className="font-bold">
          {row.title}
        </span>
        {row.slot !== null && <StatusChip tone="neutral">{outline.slot}</StatusChip>}
        {proposal === null ? (
          <StatusChip tone="waiting">{outline.chip[row.persistence]}</StatusChip>
        ) : (
          <StatusChip tone={toneOf(proposal.isNew)}>
            {proposal.isNew ? outline.proposal.new : outline.proposal.placed}
          </StatusChip>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <MoveButtons
          action={move}
          monday={monday}
          version={version}
          row={row}
          first={first}
          last={last}
          onDone={onMoved}
        />
        {proposal === null ? (
          <ArrowLink href={`/porada/${monday}/pokyny/${row.lineageId}`} describedBy={titleId}>
            {outline.edit}
          </ArrowLink>
        ) : (
          <div className="space-y-1">
            <p>{outline.proposal.edit}</p>
            <ArrowLink href={`/kontrola/${proposal.pointId}`}>{outline.proposal.open}</ArrowLink>
          </div>
        )}
        {proposal === null && row.slot === null && (
          <RemoveButton
            action={remove}
            monday={monday}
            version={version}
            row={row}
            titleId={titleId}
            onDone={onRemoved}
          />
        )}
      </div>
    </li>
  );
}
