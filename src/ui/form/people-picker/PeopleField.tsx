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
  DEFAULT_LIMIT,
  flagsOf,
  removeChip,
  salutateAll,
  showsBulk,
  type Change,
  type Chip,
  type ChipButton,
  type Focus,
} from './chips-state';
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
 * refused at `limit`), a removal, the bulk setter. `today` decides which
 * classes are stale; it is a prop, never read from the clock.
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
  const [inserted, setInserted] = useState(false);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const [focusing, setFocusing] = useState<{ focus: Focus; n: number } | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const bulkId = useId();

  // Focus moves after the render that holds the new chips, so the next chip's button exists.
  useEffect(() => {
    if (focusing === null) return;
    const { focus } = focusing;
    if (focus === 'search') search.current?.focus();
    else buttons.current.get(`${focus.key}:${focus.button}`)?.focus();
  }, [focusing]);

  const say = (message: string) => setSaid((before) => ({ message, count: before.count + 1 }));
  const focusOn = (focus: Focus) => setFocusing((before) => ({ focus, n: (before?.n ?? 0) + 1 }));
  const register =
    (key: string) =>
    (button: ChipButton): RefCallback<HTMLButtonElement> =>
    (element) => {
      if (element === null) buttons.current.delete(`${key}:${button}`);
      else buttons.current.set(`${key}:${button}`, element);
    };

  function commit(change: Change) {
    if (change.chips !== value) onChange(change.chips);
    if (change.focus !== null) focusOn(change.focus);
    if (change.say !== null) say(change.say);
  }

  /** The search box's add: taken, or refused at the cap with a notice that is said as well. */
  function add(person: DraftPerson): boolean {
    const added = addChip(value, person, crypto.randomUUID(), limit);
    if (!added.ok) {
      say(copy.full(limit));
      return false;
    }
    onChange(added.chips);
    setInserted(true);
    say(added.say);
    return true;
  }

  const bulk = (salutation: Salutation) => commit(salutateAll(value, salutation));

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
          {value.map((chip) => (
            <PersonChip
              key={chip.key}
              chip={chip}
              flags={flagsOf(chip.person, today)}
              onRemove={() => commit(removeChip(value, chip.key))}
              register={register(chip.key)}
            />
          ))}
        </ul>
      )}
      {/* Not hidden from assistive technology while the search list is open (see SearchNotice). */}
      <div data-live-announcer="true">
        <LiveStatus message={said.message} count={said.count} />
      </div>
    </div>
  );
}
