'use client';

import type { RecentPerson } from '@/domain/people';
import { POINT_LIMITS } from '@/domain/report';
import type { CalDate } from '@/domain/time';
import { form, people, points } from '@/ui/copy';
import {
  FieldGroup,
  fieldId,
  NativeFieldError,
  PeopleField,
  SelectField,
  TextField,
  type Chip,
  type Directory,
} from '@/ui/form';
import { buttonStyles } from '@/ui/kit';

import type { KeyedBullet } from './bullet-chips';
import { bulletTitle, type PeopleOrder } from './bullets-state';
import { bulletField, EDITOR_FORM_ID } from './editor-form';

const { bullets: copy } = points;

const ORDER_OPTIONS = (['input', 'class-surname'] as const).map((value) => ({
  value,
  label: copy.orderOption[value],
}));

/** What every row's people field needs from the page. */
export interface PickerContext {
  readonly today: CalDate;
  readonly recents: readonly RecentPerson[];
  readonly directory: Directory;
}

interface RowProps {
  readonly bullet: KeyedBullet;
  /** Where the row stands among the bullets, from zero: it names the row's controls. */
  readonly index: number;
  /** A bullet the type does not offer: its label is the author's to write. */
  readonly custom: boolean;
  /** The type does not require it: it may go, and its legend says „(nepovinné)“. */
  readonly removable: boolean;
  /** How many people the row may still hold in all (`peopleLimit`). */
  readonly limit: number;
  /** The messages of the last refused save, by control name. */
  readonly issues: Readonly<Record<string, string>>;
  readonly readOnly: boolean;
  readonly picker: PickerContext;
  readonly onPeople: (chips: readonly Chip[]) => void;
  readonly onOrder: (order: PeopleOrder) => void;
  readonly onText: (text: string) => void;
  readonly onLabel: (label: string) => void;
  readonly onRemove: () => void;
  /** Leaving a text field saves at once. */
  readonly onBlur: () => void;
}

function RemoveButton({
  bullet,
  index,
  disabled,
  onRemove,
}: {
  readonly bullet: KeyedBullet;
  readonly index: number;
  readonly disabled: boolean;
  readonly onRemove: () => void;
}) {
  const named = bullet.label.trim() !== '';
  return (
    <button
      type="button"
      aria-label={named ? copy.removeLabel(bullet.label) : copy.removeUnnamed(index + 1)}
      disabled={disabled}
      onClick={onRemove}
      className={`${buttonStyles('secondary')} self-start`}
    >
      {copy.remove}
    </button>
  );
}

/** „Název řádku“ of a custom bullet. */
function LabelField({
  index,
  label,
  issue,
  readOnly,
  onChange,
  onBlur,
}: {
  readonly index: number;
  readonly label: string;
  readonly issue: string | undefined;
  readonly readOnly: boolean;
  readonly onChange: (label: string) => void;
  readonly onBlur: () => void;
}) {
  return (
    <TextField
      name={bulletField(index, 'label')}
      value={label}
      maxLength={POINT_LIMITS.bulletLabel}
      autoComplete="off"
      onChange={onChange}
      onBlur={onBlur}
      readOnly={readOnly}
      issue={issue}
    />
  );
}

/**
 * One bullet of the point (design section 7). A people bullet is a `<fieldset>` whose
 * legend is its label, with the count under it, the people field and the order; a text
 * bullet is a labelled textarea. A custom bullet adds „Název řádku“, and every bullet
 * the type does not require ends in „Odebrat řádek“. While the editor is locked the
 * fieldset is disabled, which takes every control in it out of reach at once.
 */
export function BulletRow(props: RowProps) {
  const { bullet, index, custom, removable, issues, readOnly, onBlur } = props;
  const label = custom ? (
    <LabelField
      index={index}
      label={bullet.label}
      issue={issues[bulletField(index, 'label')]}
      readOnly={readOnly}
      onChange={props.onLabel}
      onBlur={onBlur}
    />
  ) : null;
  const remove = removable ? (
    <RemoveButton bullet={bullet} index={index} disabled={readOnly} onRemove={props.onRemove} />
  ) : null;

  if (bullet.kind === 'text') {
    return (
      <div className="flex flex-col gap-3">
        {label}
        <TextField
          name={bulletField(index, 'text')}
          multiline
          value={bullet.text}
          maxLength={POINT_LIMITS.textBullet}
          onChange={props.onText}
          onBlur={onBlur}
          readOnly={readOnly}
          issue={issues[bulletField(index, 'text')]}
        />
        {remove}
      </div>
    );
  }

  const title = bulletTitle(bullet, index);
  const name = bulletField(index, 'people');
  const id = fieldId(EDITOR_FORM_ID, name);
  const message = issues[name];
  return (
    <FieldGroup
      id={id}
      legend={removable ? `${title} ${form.optional}` : title}
      disabled={readOnly}
      describedBy={message === undefined ? undefined : `${id}-error`}
    >
      <p>{people.count(bullet.people.length)}</p>
      {message === undefined ? null : <NativeFieldError id={`${id}-error`} message={message} />}
      {label}
      <PeopleField
        label={copy.addPerson}
        listLabel={copy.peopleList(title)}
        value={bullet.people}
        onChange={props.onPeople}
        limit={props.limit}
        {...props.picker}
      />
      <SelectField
        name={bulletField(index, 'order')}
        options={ORDER_OPTIONS}
        value={bullet.order}
        onChange={(value) => props.onOrder(value === 'class-surname' ? 'class-surname' : 'input')}
      />
      {remove}
    </FieldGroup>
  );
}
