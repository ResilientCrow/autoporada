'use client';

import { useEffect, useRef, useState } from 'react';

import {
  participantsOf,
  POINT_LIMITS,
  type DraftBullet,
  type DraftStatement,
} from '@/domain/report';
import { points } from '@/ui/copy';
import { fieldId, LiveStatus } from '@/ui/form';
import { buttonStyles } from '@/ui/kit';

import type { PickerContext } from './BulletRow';
import { EDITOR_FORM_ID, statementField } from './editor-form';
import { StatementCard } from './StatementCard';
import {
  applyStatementOp,
  NEW_STATEMENT,
  type StatementFocus,
  type StatementOp,
} from './statements-state';

const { statements: copy } = points;

function focusTarget(target: StatementFocus, add: HTMLElement | null) {
  if (target === 'add') return add?.focus();
  // The id sits on the control itself, a select or a button.
  document
    .getElementById(fieldId(EDITOR_FORM_ID, statementField(target.row, target.control)))
    ?.focus();
}

/** A change to the statements, worked out from the statements as they are when it is applied. */
export type StatementsUpdate = (previous: readonly DraftStatement[]) => readonly DraftStatement[];

/**
 * The statements of a report (design section 7): a card each, then „Přidat vyjádření“.
 * Every change goes out as an update of the statements through `onChange`, which applies
 * it to the latest ones; `rows` says the cards themselves changed (an add, a removal or a
 * move), so a refused save's messages, which name cards by place, are retired. The rules
 * are in `statements-state`, which also says where focus goes. The cards carry keys of
 * their own that follow them through a move, so what a card holds in itself stays with it.
 */
export function Statements({
  bullets,
  statements,
  issues,
  readOnly,
  today,
  recents,
  directory,
  onChange,
  onBlur,
}: PickerContext & {
  readonly bullets: readonly DraftBullet[];
  readonly statements: readonly DraftStatement[];
  readonly issues: Readonly<Record<string, string>>;
  readonly readOnly: boolean;
  readonly onChange: (update: StatementsUpdate, rows: boolean) => void;
  readonly onBlur: () => void;
}) {
  const [ids, setIds] = useState<readonly number[]>(() => statements.map((_, i) => i));
  const nextId = useRef(statements.length);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const [focusing, setFocusing] = useState<{ target: StatementFocus; n: number } | null>(null);
  const add = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusing !== null) focusTarget(focusing.target, add.current);
  }, [focusing]);

  const say = (message: string) => setSaid((before) => ({ message, count: before.count + 1 }));
  const picker = { today, recents, directory };
  const participants = participantsOf({ bullets });

  /** The message and focus come from the cards on screen; the change itself from the latest. */
  function run(op: StatementOp) {
    const applied = applyStatementOp(statements, op, NEW_STATEMENT);
    if (!applied.ok)
      return applied.code === 'limit' ? say(copy.full(POINT_LIMITS.statements)) : undefined;
    say('');
    if (applied.list !== statements) {
      const fresh = op.kind === 'add' ? nextId.current++ : -1;
      const keys = applyStatementOp(ids, op, fresh);
      if (keys.ok) setIds(keys.list);
      onChange((previous) => {
        const next = applyStatementOp(previous, op, NEW_STATEMENT);
        return next.ok ? [...next.list] : previous;
      }, true);
    }
    setFocusing((before) => ({ target: applied.focus, n: (before?.n ?? 0) + 1 }));
  }

  /** An edit inside one card, applied to the latest statements; one that changes nothing hands them back. */
  const edit = (index: number, change: (statement: DraftStatement) => DraftStatement) =>
    onChange((previous) => {
      const found = previous[index];
      if (found === undefined) return previous;
      const changed = change(found);
      return changed === found ? previous : previous.with(index, changed);
    }, false);

  return (
    <section className="flex flex-col gap-4">
      <h2>{copy.heading}</h2>
      <div className="flex flex-col gap-4">
        {statements.map((statement, index) => (
          <StatementCard
            key={ids[index] ?? `at-${index}`}
            statement={statement}
            index={index}
            participants={participants}
            recents={recents}
            issues={issues}
            readOnly={readOnly}
            picker={picker}
            onEdit={(change) => edit(index, change)}
            onUp={() => run({ kind: 'up', index })}
            onDown={() => run({ kind: 'down', index })}
            onRemove={() => run({ kind: 'remove', index })}
            onBlur={onBlur}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          ref={add}
          disabled={readOnly}
          onClick={() => run({ kind: 'add' })}
          className={buttonStyles('secondary')}
        >
          {copy.add}
        </button>
      </div>
      <LiveStatus message={said.message} count={said.count} />
    </section>
  );
}
