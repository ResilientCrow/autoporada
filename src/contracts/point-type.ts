import { z } from 'zod';

import { POINT_LIMITS, type BulletSpec } from '@/domain/report';

/** A bullet's key: a stable slug that a draft's bullet copies from its type. */
export const bulletKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(POINT_LIMITS.bulletKey);

/** Refines a list of bullets: a draft bullet finds its spec by key, so no two share one. */
export const uniqueKeys = (bullets: readonly { readonly key: string }[]) =>
  new Set(bullets.map((b) => b.key)).size === bullets.length;

/** A bullet a point type offers. */
const bulletSpecSchema = z.strictObject({
  key: bulletKeySchema,
  label: z.string().min(1).max(POINT_LIMITS.bulletLabel),
  kind: z.enum(['people', 'text']),
  required: z.boolean(),
  role: z.literal('organisers').optional(),
}) satisfies z.ZodType<BulletSpec>;

/** `point_types.default_bullets`, as stored and as the admin form sends it. */
export const defaultBulletsSchema = z
  .array(bulletSpecSchema)
  .max(POINT_LIMITS.bullets)
  .refine(uniqueKeys, { message: 'duplicate-key' });

/** The chooser's list: no input yet (the headmaster's `includeInactive` comes with the type admin). */
export const listPointTypesInput = z.strictObject({});
export const listPointTypesOutput = z.object({
  /** The active types in `position` order. */
  types: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
