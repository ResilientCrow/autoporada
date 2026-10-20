import type { PrivacyCopy, Review } from '@/ui/copy';

/** Every review flag in a notice: on summary bullets, blocks and facts rows. */
export function reviewsOf(notice: PrivacyCopy): Review[] {
  const inSections = notice.sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => [block, ...(block.kind === 'facts' ? block.rows : [])]);
  return [...notice.summary, ...inSections].flatMap((part) =>
    part.review === undefined ? [] : [part.review],
  );
}
