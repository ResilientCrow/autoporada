import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { DraftPerson } from '@/domain/report';
import { calDate } from '@/domain/time';

import { DEFAULT_LIMIT, type Chip } from './chips-state';
import { PeopleField } from './PeopleField';

// The field's add is the box's `onAdd`; catching it shows what the field does at its cap.
const box = vi.hoisted(() => ({ onAdd: null as ((person: DraftPerson) => boolean) | null }));
vi.mock('./SearchBox', () => ({
  SearchBox: (props: { onAdd: (person: DraftPerson) => boolean }) => {
    box.onAdd = props.onAdd;
    return null;
  },
}));

const LABEL = 'Osoby';
const PERSON: DraftPerson = { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' };

const chips = (count: number): readonly Chip[] =>
  Array.from({ length: count }, (_, i) => ({ key: `k${i}`, person: PERSON }));

/** Renders a field holding `count` people, then adds one through the box. */
function addTo(count: number, limit?: number) {
  const onChange = vi.fn();
  renderToStaticMarkup(
    <PeopleField
      label={LABEL}
      listLabel={LABEL}
      value={chips(count)}
      onChange={onChange}
      today={calDate(2026, 10, 27)}
      recents={[]}
      directory="off"
      limit={limit}
    />,
  );
  const taken = box.onAdd?.(PERSON);
  return { taken, onChange };
}

describe('PeopleField cap', () => {
  it('holds as many as the default limit when its owner names none', () => {
    const last = addTo(DEFAULT_LIMIT - 1);
    expect(last.taken).toBe(true);
    expect(last.onChange).toHaveBeenCalledOnce();
    const full = addTo(DEFAULT_LIMIT);
    expect(full.taken).toBe(false);
    expect(full.onChange).not.toHaveBeenCalled();
  });

  it('holds as many as its owner says', () => {
    expect(addTo(2, 3).taken).toBe(true);
    const full = addTo(3, 3);
    expect(full.taken).toBe(false);
    expect(full.onChange).not.toHaveBeenCalled();
  });
});
