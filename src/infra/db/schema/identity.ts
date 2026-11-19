import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { TIERS, type Tier } from '@/domain/actor';
import { PERSON_FIELD_MAX, SALUTATIONS, type Salutation } from '@/domain/cs';

import { at, bytea, createdAt, id } from './columns';

export const role = pgEnum('role', ['pending', 'submitter', 'reviewer', 'headmaster']);
export const userStatus = pgEnum('user_status', ['active', 'blocked', 'deactivated']);
export const accessRequestState = pgEnum('access_request_state', [
  'pending',
  'approved',
  'rejected',
  'blocked',
  'cancelled',
]);
export const authPurpose = pgEnum('auth_purpose', ['login', 'step_up']);

const tierList = sql.raw(TIERS.map((tier) => `'${tier}'`).join(','));
const salutationList = sql.raw(SALUTATIONS.map((salutation) => `'${salutation}'`).join(','));

/**
 * Everyone in the tenant who has signed in. Keyed by Entra (tid, oid); the
 * e-mail is for display only, since Entra can reassign it.
 */
export const users = pgTable(
  'users',
  {
    id: id(),
    tid: uuid().notNull(),
    oid: uuid().notNull(),
    displayName: text().notNull(),
    email: text(),
    jobTitle: text(),
    department: text(),
    role: role().notNull().default('pending'),
    /** Who they are at the school (ADR 0072); empty until the headmaster sets it. */
    tier: text().$type<Tier>(),
    /** How documents address them (ADR 0072 item 6): the person's own answer, never guessed. */
    salutation: text().$type<Salutation>(),
    /** „Mgr.“ before and „Ph.D.“ after the name, as the person types them. */
    titlesBefore: text(),
    titlesAfter: text(),
    status: userStatus().notNull().default('active'),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: at()
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    unique('users_entra_key').on(t.tid, t.oid),
    check('users_tier', sql`${t.tier} IS NULL OR ${t.tier} IN (${tierList})`),
    check(
      'users_salutation',
      sql`${t.salutation} IS NULL OR ${t.salutation} IN (${salutationList})`,
    ),
    check(
      'users_titles_before',
      sql`${t.titlesBefore} IS NULL OR (char_length(${t.titlesBefore}) <= ${sql.raw(String(PERSON_FIELD_MAX.title))} AND ${t.titlesBefore} !~ '[[:cntrl:]]')`,
    ),
    check(
      'users_titles_after',
      sql`${t.titlesAfter} IS NULL OR (char_length(${t.titlesAfter}) <= ${sql.raw(String(PERSON_FIELD_MAX.title))} AND ${t.titlesAfter} !~ '[[:cntrl:]]')`,
    ),
    // Students and absolventi can only ever submit (plan §1, ADR 0072); policy.can enforces it too.
    check(
      'users_student_role',
      sql`${t.tier} IS NULL OR ${t.tier} NOT IN ('student', 'absolvent') OR ${t.role} IN ('pending', 'submitter')`,
    ),
  ],
);

/** „Požádat o přístup“: at most one pending request per user. */
export const accessRequests = pgTable(
  'access_requests',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text().notNull(),
    state: accessRequestState().notNull().default('pending'),
    /** The headmaster who decided; empty while pending and when the user cancelled. */
    decidedBy: uuid().references(() => users.id),
    decidedAt: at(),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index('access_requests_user_idx').on(t.userId, t.createdAt.desc()),
    uniqueIndex('access_requests_one_pending')
      .on(t.userId)
      .where(sql`${t.state} = 'pending'`),
    check('access_requests_reason_length', sql`char_length(${t.reason}) BETWEEN 1 AND 1000`),
    check('access_requests_decided_at', sql`(${t.state} = 'pending') = (${t.decidedAt} IS NULL)`),
    check(
      'access_requests_decided_by',
      sql`${t.state} NOT IN ('approved', 'rejected', 'blocked') OR ${t.decidedBy} IS NOT NULL`,
    ),
  ],
);

/** Server-side sessions (ADR 0002). Only the SHA-256 of the cookie token is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: bytea().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** When the user last signed in at Entra; step-up needs it ≤ 10 minutes old. */
    authTime: at().notNull(),
    createdAt: createdAt(),
    lastSeenAt: at().notNull().defaultNow(),
    idleExpiresAt: at().notNull(),
    absExpiresAt: at().notNull(),
  },
  (t) => [
    unique('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    // idle ≤ absolute, so expired sessions are exactly those past idle.
    index('sessions_idle_expiry_idx').on(t.idleExpiresAt),
    check('sessions_token_hash_sha256', sql`octet_length(${t.tokenHash}) = 32`),
    check('sessions_expiry_order', sql`${t.idleExpiresAt} <= ${t.absExpiresAt}`),
  ],
);

/**
 * One sign-in in progress: single use, 10 minutes, bound to the browser by
 * the SHA-256 of a __Host- cookie.
 */
export const authTransactions = pgTable(
  'auth_transactions',
  {
    id: id(),
    cookieHash: bytea().notNull(),
    state: text().notNull(),
    nonce: text().notNull(),
    codeVerifier: text().notNull(),
    returnTo: text().notNull(),
    purpose: authPurpose().notNull(),
    /** Step-up only: the signed-in user who must prove it is still them. */
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: at().notNull(),
  },
  (t) => [
    unique('auth_transactions_cookie_hash_key').on(t.cookieHash),
    index('auth_transactions_expiry_idx').on(t.expiresAt),
    check('auth_transactions_cookie_hash_sha256', sql`octet_length(${t.cookieHash}) = 32`),
    check(
      'auth_transactions_step_up_user',
      sql`(${t.purpose} = 'step_up') = (${t.userId} IS NOT NULL)`,
    ),
  ],
);
