'use client';

import { useEffect, useRef, useState } from 'react';

import { POINT_LIMITS, type BulletSpec } from '@/domain/report';
import { points } from '@/ui/copy';
import { fieldId, LiveStatus } from '@/ui/form';
import { buttonStyles } from '@/ui/kit';

import type { KeyedBullet } from './bullet-chips';
import { BulletRow, type PickerContext } from './BulletRow';
import {
  applyRowOp,
  isCustom,
  peopleLimit,
  removable,
  renameBullet,
  restorable,
  setOrder,
  setPeople,
  setText,
  type RowFocus,
  type RowOp,
} from './bullets-state';
import { bulletField, EDITOR_FORM_ID } from './editor-form';

const { bullets: copy } = points;

const CONTROLS = 'input, textarea, select';

function focusTarget(target: RowFocus, rows: HTMLElement | null, add: HTMLElement | null) {
  if (target === 'add') return add?.focus();
  if (target.control === 'label') {
    // The field's id sits on its wrapper, not on the input.
    const wrapper = document.getElementById(
      fieldId(EDITOR_FORM_ID, bulletField(target.row, 'label')),
    );
    return wrapper?.querySelector<HTMLElement>(CONTROLS)?.focus();
  }
  rows?.children[target.row]?.querySelector<HTMLElement>(CONTROLS)?.focus();
}

/** A change to the bullets, worked out from the bullets as they are when it is applied. */
export type BulletsUpdate = (previous: readonly KeyedBullet[]) => KeyedBullet[];

/**
 * The type's bullets and the author's own (design section 7): the rows, then the buttons
 * that add a row or bring back one of the type's that the author took out. Every change
 * goes out as an update of the bullets through `onChange`, which applies it to the latest
 * ones (so two changes before a render both stay); the rules are in `bullets-state`,
 * which also says where focus goes: to the new row's „Název řádku“, to a restored row,
 * or after a removal to the row that took its place, or to the add buttons when it was
 * the last. Past the cap an add or a restore says so instead.
 */
export function Bullets({
  bullets,
  spec,
  issues,
  readOnly,
  today,
  recents,
  directory,
  onChange,
  onBlur,
}: PickerContext & {
  readonly bullets: readonly KeyedBullet[];
  readonly spec: readonly BulletSpec[];
  readonly issues: Readonly<Record<string, string>>;
  readonly readOnly: boolean;
  readonly onChange: (update: BulletsUpdate) => void;
  readonly onBlur: () => void;
}) {
  const [said, setSaid] = useState({ message: '', count: 0 });
  const [focusing, setFocusing] = useState<{ target: RowFocus; n: number } | null>(null);
  const rows = useRef<HTMLDivElement>(null);
  const addFirst = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusing !== null) focusTarget(focusing.target, rows.current, addFirst.current);
  }, [focusing]);

  const say = (message: string) => setSaid((before) => ({ message, count: before.count + 1 }));
  const focusOn = (target: RowFocus) =>
    setFocusing((before) => ({ target, n: (before?.n ?? 0) + 1 }));
  const picker = { today, recents, directory };

  /** The message and focus come from the rows on screen; the change itself from the latest. */
  function run(op: RowOp) {
    const applied = applyRowOp(bullets, spec, op);
    if (!applied.ok)
      return applied.code === 'limit' ? say(copy.full(POINT_LIMITS.bullets)) : undefined;
    say('');
    onChange((previous) => {
      const next = applyRowOp(previous, spec, op);
      return next.ok ? next.bullets : [...previous];
    });
    focusOn(applied.focus);
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={rows} className="flex flex-col gap-4">
        {bullets.map((bullet, index) => (
          <BulletRow
            key={bullet.key}
            bullet={bullet}
            index={index}
            custom={isCustom(bullet, spec)}
            removable={removable(bullet, spec)}
            limit={peopleLimit(bullets, bullet.key)}
            issues={issues}
            readOnly={readOnly}
            picker={picker}
            onPeople={(chips) => onChange((previous) => setPeople(previous, bullet.key, chips))}
            onOrder={(order) => onChange((previous) => setOrder(previous, bullet.key, order))}
            onText={(text) => onChange((previous) => setText(previous, bullet.key, text))}
            onLabel={(label) =>
              onChange((previous) => renameBullet(previous, bullet.key, label, spec))
            }
            onRemove={() => run({ kind: 'remove', key: bullet.key })}
            onBlur={onBlur}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          ref={addFirst}
          disabled={readOnly}
          onClick={() => run({ kind: 'add', rowKind: 'people' })}
          className={buttonStyles('secondary')}
        >
          {copy.addPeopleRow}
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => run({ kind: 'add', rowKind: 'text' })}
          className={buttonStyles('secondary')}
        >
          {copy.addTextRow}
        </button>
        {restorable(bullets, spec).map((missing) => (
          <button
            key={missing.key}
            type="button"
            disabled={readOnly}
            onClick={() => run({ kind: 'restore', key: missing.key })}
            className={buttonStyles('secondary')}
          >
            {copy.restore(missing.label)}
          </button>
        ))}
      </div>
      <LiveStatus message={said.message} count={said.count} />
    </div>
  );
}
