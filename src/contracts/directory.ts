import { z } from 'zod';

import { DIRECTORY_LIMITS, PERSON_FIELD_MAX, POINT_LIMITS } from '@/domain/report';

import { isFailureCause, type FailureCause } from './failure';

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

/** The status of the route's failure answer: the one status whose body names a `failure`. */
export const DIRECTORY_FAILURE_STATUS = 500;

/** The technical line a failure carries in development; the pipeline cuts it at the same length. */
const FAILURE_DETAIL_MAX = 200;

/**
 * The directory answers in one of three ways: hits (the directory's own notice beside them
 * when it could not answer), or the route's failure (ADR 0044): an unexpected exception, with
 * what broke and no hits. A failure answers with status 500, so a body from anything else
 * (a proxy) is not read as ours.
 */
export const directorySearchResponse = z
  .strictObject({
    hits: z.array(directoryHit).max(DIRECTORY_LIMITS.hits),
    notice: directoryNotice.optional(),
    failure: z.custom<FailureCause>(isFailureCause).optional(),
    /** Development only: production binds no describer, so it never sends one. */
    detail: z.string().max(FAILURE_DETAIL_MAX).optional(),
  })
  .refine(
    (body) => body.failure === undefined || (body.notice === undefined && body.hits.length === 0),
    { message: 'a failure has no hits and no notice' },
  )
  .refine((body) => body.detail === undefined || body.failure !== undefined, {
    message: 'a detail belongs to a failure',
  });

export type DirectoryHit = z.infer<typeof directoryHit>;
export type DirectoryNotice = z.infer<typeof directoryNotice>;
