import { emptyRichDoc } from '@/domain/richtext';

import type { BulletSpec, DraftBullet, PointContent } from './content';

/** A type's bullet as the draft's own, still unfilled; people keep the order they are added in. */
export function draftBullet({ key, label, kind }: BulletSpec): DraftBullet {
  return kind === 'people'
    ? { key, label, kind, order: 'input', people: [] }
    : { key, label, kind, text: '' };
}

/**
 * The content a new draft starts with: every field empty, and the type's
 * default bullets as its own (design section 6). Finance and pokyn have no
 * type, so they pass none.
 */
export function newDraft(defaultBullets: readonly BulletSpec[]): PointContent {
  return {
    title: '',
    eventDate: null,
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
    opening: '',
    openingEdited: false,
    body: emptyRichDoc(),
    bullets: defaultBullets.map(draftBullet),
    statements: [],
  };
}
