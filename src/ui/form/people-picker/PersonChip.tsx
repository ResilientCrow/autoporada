import type { RefCallback } from 'react';

import { formatName } from '@/domain/cs';
import { people } from '@/ui/copy';
import { buttonStyles, Icon } from '@/ui/kit';

import type { Chip, ChipButton, Flag } from './chips-state';
import { spokenName } from './directory-state';

const { chips: copy } = people;

/**
 * One person in the list (SSU-20): a `<li>` with the name, what to look at, and
 * Odebrat. Not a TagGroup or GridList: a plain list reads as one in every
 * screen reader, and the button is an ordinary Tab stop. Its name carries the
 * person's, or a list of them would sound the same all down. `register` hands
 * the button to the field, which moves focus to it after a step.
 */
export function PersonChip({
  chip,
  flags,
  onRemove,
  register,
}: {
  readonly chip: Chip;
  readonly flags: readonly Flag[];
  readonly onRemove: () => void;
  readonly register: (button: ChipButton) => RefCallback<HTMLButtonElement>;
}) {
  const { person } = chip;
  const name = spokenName(person);
  // The salutation never shows in a name; formatName only asks for one.
  const shown = formatName({
    ...person,
    salutation: person.salutation ?? 'pan',
  });
  return (
    <li className="flex flex-col gap-2 rounded-brand border-2 border-ink p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{shown}</span>
        {person.affiliation === undefined ? null : <span>({person.affiliation})</span>}
        {flags.map((flag) => (
          <span key={flag} className="inline-flex items-center gap-1 font-bold">
            <Icon name="exclamation" />
            <span>{copy.flag[flag]}</span>
          </span>
        ))}
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            ref={register('remove')}
            aria-label={copy.removeLabel(name)}
            onClick={onRemove}
            className={buttonStyles('secondary')}
          >
            {copy.remove}
          </button>
        </span>
      </div>
    </li>
  );
}
