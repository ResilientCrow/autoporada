import type { BulletSpec } from '@/domain/report';
import { points } from '@/ui/copy';
import type { FormSpec, FormState } from '@/ui/form';

import { bulletTitle, isCustom, removable, type Bullet } from './bullets-state';

export const EDITOR_FORM_ID = 'bod';

const BEFORE_BULLETS: FormSpec = {
  title: { label: points.editor.title, required: true },
  eventDate: { label: points.facts.eventDate, required: true },
  endDate: { label: points.facts.endDate },
  timeFrom: { label: points.facts.timeFrom },
  timeTo: { label: points.facts.timeTo },
  campus: { label: points.facts.campus },
  place: { label: points.facts.place },
};

/** What a bullet's controls are called: the tail of the path readiness reports (`bullets.2.people`). */
export type BulletPart = 'people' | 'order' | 'text' | 'label';

/** The name of one control of the bullet at `index`; its id is `fieldId(EDITOR_FORM_ID, name)`. */
export function bulletField(index: number, part: BulletPart): string {
  return `bullets.${index}.${part}`;
}

/** The declarations of one bullet's controls, in page order. */
function bulletFields(
  bullet: Bullet<unknown>,
  index: number,
  spec: readonly BulletSpec[],
): FormSpec {
  const own = { label: bulletTitle(bullet, index), required: !removable(bullet, spec) };
  return {
    ...(isCustom(bullet, spec) && {
      [bulletField(index, 'label')]: { label: points.bullets.label, required: true },
    }),
    ...(bullet.kind === 'people'
      ? {
          [bulletField(index, 'people')]: own,
          // A select always has a value, so it carries no „(nepovinné)“.
          [bulletField(index, 'order')]: { label: points.bullets.order, required: true },
        }
      : { [bulletField(index, 'text')]: own }),
  };
}

/**
 * The report editor's fields, in page order. A draft may be unfinished, so nothing
 * here is enforced: the title and the first date carry no „(nepovinné)“ because
 * submitting asks for them (readiness). The bullets are the draft's own, so the spec
 * follows them: `spec` is the type's, which says which are required.
 */
export function editorSpec(
  bullets: readonly Bullet<unknown>[],
  spec: readonly BulletSpec[],
): FormSpec {
  return {
    ...BEFORE_BULLETS,
    ...Object.assign({}, ...bullets.map((bullet, i) => bulletFields(bullet, i, spec))),
    body: { label: points.editor.body },
  };
}

/**
 * Autosave is the only way this form saves, so it never submits: React Aria's ComboBox
 * (in the people rows to come) lets Enter through while its list is closed, and a native
 * submit would reload the page over the author's text.
 */
export const EDITOR_FORM_STATE: FormState = {
  issues: null,
  problem: null,
  attempt: 0,
  submitting: null,
  onSubmit: (event) => event.preventDefault(),
};
