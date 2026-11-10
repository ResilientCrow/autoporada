'use client';

import { useContext, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { ComboBox, ComboBoxStateContext } from 'react-aria-components/ComboBox';
import { Header } from 'react-aria-components/Header';
import { Input } from 'react-aria-components/Input';
import { Label } from 'react-aria-components/Label';
import { ListBox, ListBoxItem, ListBoxSection } from 'react-aria-components/ListBox';
import { Popover } from 'react-aria-components/Popover';

import type { RecentPerson } from '@/domain/people';
import { DIRECTORY_LIMITS, type DraftPerson } from '@/domain/report';
import { people } from '@/ui/copy';

import { CONTROL } from '../control-styles';

import {
  manualPerson,
  matchRecents,
  optionLabel,
  personOfHit,
  personOfRecent,
  withoutShown,
  type Directory,
} from './directory-state';
import { SearchNotice } from './SearchNotice';
import { useDirectory, type DirectoryFetcher } from './use-directory';

const { search } = people;

const MANUAL = 'manual';
const HIT_PREFIX = 'hit:';
const RECENT_PREFIX = 'recent:';

const POPOVER =
  'popover-fit z-50 flex max-h-80 flex-col rounded-brand border-2 border-ink bg-light text-ink';
const OPTION =
  'flex min-h-11 cursor-pointer items-center px-3 py-2 hover:bg-sublight data-focused:bg-digital data-focused:text-light';
const HEADER = 'px-3 pt-2 pb-1 font-bold';

/** A recent is told apart by its directory id, else by its names and class. */
const recentKey = (p: RecentPerson) =>
  `${RECENT_PREFIX}${p.graphId ?? `${p.givenName}|${p.familyName}|${p.affiliation ?? ''}`}`;

/**
 * Reports the hit the arrow keys are on to `intoRef`. Focus in a combobox is
 * virtual (aria-activedescendant), so only the combobox state knows it.
 */
function FocusedHit({ intoRef }: { readonly intoRef: RefObject<string | null> }) {
  const key = useContext(ComboBoxStateContext)?.selectionManager.focusedKey;
  useEffect(() => {
    intoRef.current = typeof key === 'string' && key.startsWith(HIT_PREFIX) ? key.slice(4) : null;
  }, [intoRef, key]);
  return null;
}

/**
 * The text input. It opens the list on a click (focus alone does not, once the
 * input already has it) and turns Enter on a typed name, with no option
 * highlighted, into adding that name by hand: a combobox with `selectedKey`
 * fixed at null never reports a custom value.
 */
function SearchInput({
  inputRef,
  onManual,
}: {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onManual: () => void;
}) {
  const state = useContext(ComboBoxStateContext);
  return (
    <Input
      ref={inputRef}
      maxLength={DIRECTORY_LIMITS.query}
      autoComplete="off"
      className={CONTROL}
      onClick={() => state?.open(null, 'manual')}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || state?.selectionManager.focusedKey) return;
        event.preventDefault();
        onManual();
      }}
    />
  );
}

/**
 * The search box of the people picker (design section 5): a combobox over two
 * groups, the author's recent people (filtered in the browser) and the school
 * directory (asked after 300 ms), and a last option to add the typed name by
 * hand. Adding hands the person to `onAdd`; when that takes the person the box
 * empties, and either way focus stays in it. What is said about the add is the
 * field's to say (it knows whether the add was taken), so the box has no live
 * region of its own. Notices (directory off, down, rate-limited, signed out) are
 * status text beside the box, never an empty listbox. `fetcher` defaults to the
 * route; `inputRef` reaches the input for a focus that has to come back to it.
 */
export function SearchBox({
  label,
  recents,
  directory,
  onAdd,
  fetcher,
  inputRef,
}: {
  readonly label: string;
  readonly recents: readonly RecentPerson[];
  readonly directory: Directory;
  /** Returns whether the person was taken; a refused one stays typed in the box. */
  readonly onAdd: (person: DraftPerson) => boolean;
  readonly fetcher?: DirectoryFetcher;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState('');
  const focusedHit = useRef<string | null>(null);
  const ownInput = useRef<HTMLInputElement | null>(null);
  const input = inputRef ?? ownInput;
  const noticeId = useId();
  const found = useDirectory({ text, directory, fetcher, focused: focusedHit });

  const shown = matchRecents(recents, text);
  const hits = withoutShown(found.hits, shown);
  const notice = directory === 'off' ? 'off' : found.notice;

  function add(person: DraftPerson) {
    if (onAdd(person)) setText('');
    input.current?.focus();
  }

  function choose(key: unknown) {
    if (key === null) return;
    if (key === MANUAL) return add(manualPerson(text));
    const recent = shown.find((p) => recentKey(p) === key);
    if (recent) return add(personOfRecent(recent));
    const hit = hits.find((h) => `${HIT_PREFIX}${h.graphId}` === key);
    if (hit) add(personOfHit(hit));
  }

  return (
    <div className="flex flex-col gap-2">
      <ComboBox
        allowsCustomValue
        allowsEmptyCollection={false}
        menuTrigger="focus"
        inputValue={text}
        onInputChange={setText}
        selectedKey={null}
        onSelectionChange={choose}
        defaultFilter={() => true}
        aria-describedby={noticeId}
        className="flex flex-col gap-1"
      >
        <FocusedHit intoRef={focusedHit} />
        <Label className="font-bold">{label}</Label>
        <SearchInput
          inputRef={input}
          onManual={() => text.trim() !== '' && add(manualPerson(text))}
        />
        <Popover placement="bottom start" className={POPOVER}>
          <ListBox className="min-h-0 flex-1 overflow-auto">
            {shown.length === 0 ? null : (
              <ListBoxSection>
                <Header className={HEADER}>{search.recents}</Header>
                {shown.map((person) => (
                  <ListBoxItem
                    key={recentKey(person)}
                    id={recentKey(person)}
                    textValue={optionLabel(person)}
                    className={OPTION}
                  >
                    {optionLabel(person)}
                  </ListBoxItem>
                ))}
              </ListBoxSection>
            )}
            {hits.length === 0 ? null : (
              <ListBoxSection>
                <Header className={HEADER}>{search.directory}</Header>
                {hits.map((hit) => (
                  <ListBoxItem
                    key={hit.graphId}
                    id={`${HIT_PREFIX}${hit.graphId}`}
                    textValue={hit.displayName}
                    className={OPTION}
                  >
                    {hit.displayName}
                  </ListBoxItem>
                ))}
              </ListBoxSection>
            )}
            {text.trim() === '' ? null : (
              <ListBoxItem id={MANUAL} textValue={text} className={OPTION}>
                {search.manual(text.trim())}
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </ComboBox>
      <SearchNotice id={noticeId} notice={notice} />
    </div>
  );
}
