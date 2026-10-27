import type { ReactNode, RefCallback } from 'react';

import { formatName } from '@/domain/cs';
import { people } from '@/ui/copy';
import { buttonStyles, Icon } from '@/ui/kit';

import type { Chip, ChipButton, Flag } from './chips-state';
import { spokenName } from './directory-state';

const { chips: copy } = people;

/**
 * One person in the list (SSU-20): a `<li>` with the name, what to look at, and
 * Upravit and Odebrat. Not a TagGroup or GridList: a plain list reads as one in
 * every screen reader, and the buttons are ordinary Tab stops. Each button's
 * name carries the person's, or a list of them would sound the same all down.
 * The editor, when open, is `children`, below the row. `register` hands the
 * buttons to the field, which moves focus to them after a step.
 */
export function PersonChip({
  chip,
  flags,
  open,
  editorId,
  onEdit,
  onRemove,
  register,
  children,
}: {
  readonly chip: Chip;
  readonly flags: readonly Flag[];
  readonly open: boolean;
  readonly editorId: string;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
  readonly register: (button: ChipButton) => RefCallback<HTMLButtonElement>;
  readonly children?: ReactNode;
}) {
  const { person } = chip;
  const name = spokenName(person);
  // The salutation never shows in a name; formatName only asks for one.
  const shown = formatName({ ...person, salutation: person.salutation ?? 'pan' });
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
            ref={register('edit')}
            aria-label={copy.editLabel(name)}
            aria-expanded={open}
            aria-controls={open ? editorId : undefined}
            onClick={onEdit}
            className={buttonStyles('secondary')}
          >
            {copy.edit}
          </button>
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
      {children}
    </li>
  );
}
