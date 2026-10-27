import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { DraftPerson } from '@/domain/report';
import { calDate } from '@/domain/time';
import { Form } from '@/ui/form';

import { keyBullets } from './bullet-chips';
import { BulletRow } from './BulletRow';
import { EDITOR_FORM_ID, EDITOR_FORM_STATE, editorSpec } from './editor-form';

// A people row's limit is observable only in what its field does when a person is added:
// the field has no markup for it. Catching the search box's add shows that (as the
// field's own cap test does).
const box = vi.hoisted(() => ({
  onAdd: undefined as ((person: DraftPerson) => boolean) | undefined,
}));
vi.mock('@/ui/form/people-picker/SearchBox', () => ({
  SearchBox: (props: { onAdd: (person: DraftPerson) => boolean }) => {
    box.onAdd = props.onAdd;
    return null;
  },
}));

const caught = () => box.onAdd;

const PERSON: DraftPerson = { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' };

/** Renders the only row, holding `count` people, with the limit its owner works out for it. */
function addTo(count: number, limit: number) {
  const bullets = keyBullets([
    {
      key: 'ucastnici',
      label: 'Účastníci',
      kind: 'people',
      order: 'input',
      people: Array.from({ length: count }, () => PERSON),
    },
  ]);
  const onPeople = vi.fn();
  box.onAdd = undefined;
  renderToStaticMarkup(
    <Form id={EDITOR_FORM_ID} spec={editorSpec(bullets, [])} state={EDITOR_FORM_STATE}>
      <BulletRow
        bullet={bullets[0]!}
        index={0}
        custom={false}
        removable={false}
        limit={limit}
        issues={{}}
        readOnly={false}
        picker={{ today: calDate(2026, 10, 27), recents: [], directory: 'off' }}
        onPeople={onPeople}
        onOrder={() => undefined}
        onText={() => undefined}
        onLabel={() => undefined}
        onRemove={() => undefined}
        onBlur={() => undefined}
      />
    </Form>,
  );
  return { taken: caught()?.(PERSON), onPeople };
}

describe('BulletRow people limit', () => {
  it('takes a person while the row is under the limit its owner names', () => {
    const open = addTo(2, 3);
    expect(open.taken).toBe(true);
    expect(open.onPeople).toHaveBeenCalledOnce();
  });

  it('refuses one at that limit, which is below the field’s own default', () => {
    const full = addTo(3, 3);
    expect(full.taken).toBe(false);
    expect(full.onPeople).not.toHaveBeenCalled();
  });
});
