import { z } from 'zod';

import { RECENT_PEOPLE_MAX } from '@/domain/people';
import { POINT_LIMITS } from '@/domain/report';

import { draftPersonSchema } from './point';

/**
 * A person the author named before (design section 4): the person as they
 * wrote them, with the person caps, the genitive they last gave them and when.
 * It names people, never points or authors.
 */
const recentPersonSchema = draftPersonSchema.extend({
  genitive: z.string().max(POINT_LIMITS.speakerGenitive).optional(),
  lastUsed: z.iso.datetime(),
});

/** The people memory takes nothing: it is always the reader's own. */
export const recentPeopleInput = z.strictObject({});
export const recentPeopleOutput = z.strictObject({
  people: z.array(recentPersonSchema).max(RECENT_PEOPLE_MAX),
});
