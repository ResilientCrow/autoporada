import { z } from 'zod';

import { DIRECTORY_LIMITS, PERSON_FIELD_MAX, POINT_LIMITS } from '@/domain/report';

/**
 * The search route's first step takes and answers nothing: it only says
 * whether the reader may search, so a refused one never reaches the directory.
 */
export const searchGateInput = z.strictObject({});
export const searchGateOutput = z.strictObject({});

/** What the search box sends: the text typed so far (design section 4). */
export const directorySearchRequest = z.strictObject({ q: z.string().max(DIRECTORY_LIMITS.query) });

const name = z.string().min(1).max(PERSON_FIELD_MAX.name);

/**
 * A person the school directory found: names only, never a mailbox or a
 * class. Every hit fits a `DraftPerson`; the dev adapter checks its file
 * with this schema.
 */
export const directoryHit = z.strictObject({
  graphId: z.guid().max(POINT_LIMITS.graphId),
  givenName: name,
  familyName: name,
  displayName: z.string().min(1).max(DIRECTORY_LIMITS.displayName),
});

/** Why there are no hits when the directory could not answer. */
const directoryNotice = z.enum(['off', 'unavailable', 'throttled', 'denied', 'timeout']);

export const directorySearchResponse = z.strictObject({
  hits: z.array(directoryHit).max(DIRECTORY_LIMITS.hits),
  notice: directoryNotice.optional(),
});

export type DirectoryHit = z.infer<typeof directoryHit>;
export type DirectoryNotice = z.infer<typeof directoryNotice>;
