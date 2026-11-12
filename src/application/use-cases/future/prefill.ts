import type { FutureContent } from '@/application/ports';
import { newDraft, type BulletSpec, type PointContent } from '@/domain/report';

/**
 * The draft report of an akce (design section 12): the type's empty draft with the akce's title, dates,
 * campus and place. The free-text organizer and participants are not copied: the report's people
 * are structured and the akce's are not (ADR 0060). The opening sentence is left for the editor.
 */
export function prefilledReport(akce: FutureContent, specs: readonly BulletSpec[]): PointContent {
  const empty = newDraft(specs);
  return {
    ...empty,
    title: akce.title,
    eventDate: akce.startDate,
    endDate: akce.endDate,
    campus: akce.campus,
    place: akce.place,
  };
}
