/** What the daily run knows when it enqueues a report prompt: the akce, its author and which prompt this is. */
export interface ReportPromptIds {
  readonly authorId: string;
  readonly itemId: string;
  readonly stage: 1 | 2;
}

/**
 * The author hears once per akce and stage (design section 13): `:1` from the day after the akce,
 * `:2` from the eighth day after. The subject is the akce.
 */
export const reportPromptParts = ({ authorId, itemId, stage }: ReportPromptIds) => ({
  recipientId: authorId,
  subjectId: itemId,
  key: `${itemId}:${stage}`,
});
