import type { JobCatalog } from '@/application/ports';
import type { DecisionEvent } from '@/domain/review';
import type { TemplateName } from '@/notify';

/** Which mail each access decision sends the requester (plan §9); the requester's cancel sends none. */
export const DECISION_MAIL = {
  approve: 'access.approved',
  reject: 'access.rejected',
  block: 'access.blocked',
} as const satisfies Readonly<Record<DecisionEvent, TemplateName>>;

interface DecisionIds {
  readonly recipientId: string;
  readonly requestId: string;
}

/** What the caller knows when it enqueues each mail; the key and the payload follow from it. */
interface MailIds {
  readonly 'access.approved': DecisionIds;
  readonly 'access.rejected': DecisionIds;
  readonly 'access.blocked': DecisionIds;
  /** The user's row version after the change: every grant gets its own mail. */
  readonly 'access.granted': { readonly userId: string; readonly versionAfter: number };
  /** `checkId` is a uuid the CLI makes for each test mail. */
  readonly 'mail.check': { readonly recipientId: string; readonly checkId: string };
}

interface MailParts {
  readonly recipientId: string;
  readonly subjectId: string;
  /** The key's part after the template. */
  readonly key: string;
}

const decision = ({ recipientId, requestId }: DecisionIds): MailParts => ({
  recipientId,
  subjectId: requestId,
  key: requestId,
});

/**
 * One key per template and subject. A request reaches each decided state at
 * most once, so a block after a reject has a different key and its own mail.
 */
const PARTS: { readonly [T in TemplateName]: (ids: MailIds[T]) => MailParts } = {
  'access.approved': decision,
  'access.rejected': decision,
  'access.blocked': decision,
  'access.granted': ({ userId, versionAfter }) => ({
    recipientId: userId,
    subjectId: userId,
    key: `${userId}:${versionAfter}`,
  }),
  'mail.check': ({ recipientId, checkId }) => ({
    recipientId,
    subjectId: recipientId,
    key: checkId,
  }),
};

interface MailJob {
  readonly data: JobCatalog['mail.send'];
  readonly dedupeKey: string;
}

/**
 * The `mail.send` payload (ids only: the queue keeps its rows) and its dedupe
 * key, `<template>:<key>`. The key is also the ledger's, so it is the one
 * place either is built.
 */
export function mailJob<T extends TemplateName>(template: T, ids: MailIds[T]): MailJob {
  const parts: (ids: MailIds[T]) => MailParts = PARTS[template];
  const { recipientId, subjectId, key } = parts(ids);
  return { data: { template, recipientId, subjectId }, dedupeKey: `${template}:${key}` };
}
