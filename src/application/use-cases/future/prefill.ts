import type { FutureContent } from '@/application/ports';
import { newDraft, type BulletSpec, type PointContent } from '@/domain/report';

/**
 * The draft report of an akce (design section 12): the type's empty draft with the akce's title, dates,
 * campus and place, and its responsible people as the organisers. Only the first people bullet that
 * has the role takes them, so no name stands twice. The opening sentence is left for the editor.
 */
export function prefilledReport(akce: FutureContent, specs: readonly BulletSpec[]): PointContent {
  const empty = newDraft(specs);
  const organisers = specs.find((s) => s.kind === 'people' && s.role === 'organisers')?.key;
  const people = akce.responsible?.people ?? [];
  return {
    ...empty,
    title: akce.title,
    eventDate: akce.startDate,
    endDate: akce.endDate,
    campus: akce.campus,
    place: akce.place,
    bullets: empty.bullets.map((b) =>
      b.kind === 'people' && b.key === organisers ? { ...b, people } : b,
    ),
  };
}
