'use client';

import { useEffect, useId, useRef, useState, type RefCallback } from 'react';

import { SALUTATION, SALUTATIONS, type Salutation } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import type { DraftPerson } from '@/domain/report';
import type { CalDate } from '@/domain/time';
import { people } from '@/ui/copy';
import { buttonStyles } from '@/ui/kit';

import { LiveStatus } from '../LiveStatus';

import {
  addChip,
  confirmClass,
  DEFAULT_LIMIT,
  editChip,
  finishEdit,
  flagsOf,
  moveChip,
  removeChip,
  salutateAll,
  settleClass,
  showsBulk,
  switchEditor,
  type Change,
  type Chip,
  type ChipButton,
  type Editing,
  type Focus,
} from './chips-state';
import { ChipEditor } from './ChipEditor';
import type { Directory } from './directory-state';
import { PersonChip } from './PersonChip';
import { SearchBox } from './SearchBox';
import type { DirectoryFetcher } from './use-directory';

const { chips: copy } = people;

/**
 * The people of one bullet (design section 5): the search box, the chips it
 * adds, and the bulk salutation setter. The chips are the owner's (`value`,
 * `onChange`), so the editor can keep them with the rest of the point. The
 * field has one live region and says everything in it: an add (or why it was
 * refused at `limit`), a removal, a move, the bulk setter. `today` decides which classes are
 * stale; it is a prop, never read from the clock.
 */
export function PeopleField({
  label,
  listLabel,
  value,
  onChange,
  today,
  recents,
  directory,
  fetcher,
  limit = DEFAULT_LIMIT,
}: {
  /** The search box's label. */
  readonly label: string;
  /** Names the list of chips, so several fields on a page are told apart. */
  readonly listLabel: string;
  readonly value: readonly Chip[];
  readonly onChange: (chips: readonly Chip[]) => void;
  readonly today: CalDate;
  readonly recents: readonly RecentPerson[];
  readonly directory: Directory;
  readonly fetcher?: DirectoryFetcher;
  readonly limit?: number;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const [focusing, setFocusing] = useState<{ focus: Focus; n: number } | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // What the editor's handlers read: a blur that fires while the editor closes still
  // sees the chips and the editor as the last step left them, not as its render did.
  const latest = useRef({ chips: value, editing });
  const bulkId = useId();
  const editorId = useId();

  useEffect(() => {
    latest.current.chips = value;
  });

  // Focus moves after the render that holds the new chips, so a moved chip's button exists again.
  useEffect(() => {
    if (focusing === null) return;
    const { focus } = focusing;
    if (focus === 'search') search.current?.focus();
    else buttons.current.get(`${focus.key}:${focus.button}`)?.focus();
  }, [focusing]);

  const say = (message: string) => setSaid((before) => ({ message, count: before.count + 1 }));
  const focusOn = (focus: Focus) => setFocusing((before) => ({ focus, n: (before?.n ?? 0) + 1 }));
  const emit = (chips: readonly Chip[]) => {
    latest.current.chips = chips;
    onChange(chips);
  };
  const edit = (next: Editing | null) => {
    latest.current.editing = next;
    setEditing(next);
  };
  const register =
    (key: string) =>
    (button: ChipButton): RefCallback<HTMLButtonElement> =>
    (element) => {
      if (element === null) buttons.current.delete(`${key}:${button}`);
      else buttons.current.set(`${key}:${button}`, element);
    };

  function commit(change: Change) {
    if (change.chips !== latest.current.chips) emit(change.chips);
    if (change.focus !== null) focusOn(change.focus);
    if (change.say !== null) say(change.say);
  }

  /** The search box's add: taken, or refused at the cap with a notice that is said as well. */
  function add(person: DraftPerson): boolean {
    const added = addChip(latest.current.chips, person, crypto.randomUUID(), limit);
    if (!added.ok) {
      say(copy.full(limit));
      return false;
    }
    emit(added.chips);
    setInserted(true);
    say(added.say);
    return true;
  }

  /** Upravit: the open editor is finished first; if it cannot be, it stays and shows why. */
  function toggle(key: string) {
    const switched = switchEditor(latest.current.chips, latest.current.editing, key, today);
    if (!switched.ok) return setAttempted(true);
    if (switched.chips !== latest.current.chips) emit(switched.chips);
    edit(switched.editing);
    setAttempted(false);
  }

  function done() {
    const open = latest.current.editing;
    if (open === null) return;
    const finished = finishEdit(latest.current.chips, open, today);
    if (!finished.ok) return setAttempted(true);
    emit(finished.chips);
    edit(null);
    setAttempted(false);
    focusOn(finished.focus);
  }

  /** Leaving the class field. After „Hotovo“ there is no editor, so a late blur settles nothing. */
  function settleOpenClass() {
    const settled = settleClass(latest.current.chips, latest.current.editing, today);
    if (settled.chips !== latest.current.chips) emit(settled.chips);
    if (settled.editing !== latest.current.editing) edit(settled.editing);
  }

  const bulk = (salutation: Salutation) => commit(salutateAll(latest.current.chips, salutation));

  return (
    <div className="flex flex-col gap-3">
      <SearchBox
        label={label}
        recents={recents}
        directory={directory}
        onAdd={add}
        fetcher={fetcher}
        inputRef={search}
      />
      {showsBulk(value, inserted) ? (
        <div role="group" aria-labelledby={bulkId} className="flex flex-wrap items-center gap-2">
          <span id={bulkId} className="font-bold">
            {copy.bulk.label}
          </span>
          {SALUTATIONS.map((salutation) => (
            <button
              key={salutation}
              type="button"
              aria-label={copy.bulk.setLabel(SALUTATION[salutation].label)}
              onClick={() => bulk(salutation)}
              className={buttonStyles('secondary')}
            >
              {SALUTATION[salutation].label}
            </button>
          ))}
        </div>
      ) : null}
      {value.length === 0 ? null : (
        <ul aria-label={listLabel} className="flex flex-col gap-2">
          {value.map((chip) => {
            const open = editing?.key === chip.key;
            const finished = open ? finishEdit(value, editing, today) : null;
            const issues = attempted && finished !== null && !finished.ok ? finished.issues : null;
            return (
              <PersonChip
                key={chip.key}
                chip={chip}
                flags={flagsOf(chip.person, today)}
                open={open}
                editorId={`${editorId}-${chip.key}`}
                onEdit={() => toggle(chip.key)}
                onRemove={() => {
                  if (open) edit(null);
                  commit(removeChip(latest.current.chips, chip.key));
                }}
                register={register(chip.key)}
              >
                {open ? (
                  <ChipEditor
                    id={`${editorId}-${chip.key}`}
                    person={chip.person}
                    issues={issues}
                    register={register(chip.key)}
                    onPatch={(patch) => emit(editChip(latest.current.chips, chip.key, patch))}
                    onSettleClass={settleOpenClass}
                    onConfirmClass={() => emit(confirmClass(latest.current.chips, chip.key, today))}
                    onMove={(by) => commit(moveChip(latest.current.chips, chip.key, by))}
                    onDone={done}
                  />
                ) : null}
              </PersonChip>
            );
          })}
        </ul>
      )}
      {/* Not hidden from assistive technology while the search list is open (see SearchNotice). */}
      <div data-live-announcer="true">
        <LiveStatus message={said.message} count={said.count} />
      </div>
    </div>
  );
}
