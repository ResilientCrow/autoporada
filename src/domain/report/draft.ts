import { emptyRichDoc } from '@/domain/richtext';

import type { BulletSpec, DraftBullet, PointContent } from './content';

/** A default bullet as the draft's own, still unfilled; people keep the order they are added in. */
export function draftBullet({ key, label, kind }: BulletSpec): DraftBullet {
  return kind === 'people'
    ? { key, label, kind, order: 'input', people: [] }
    : { key, label, kind, text: '' };
}

/**
 * The content a new draft starts with: every field empty, and the default
 * bullets as its own (design section 6): the report rows for a report;
 * finance and pokyn pass none.
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
