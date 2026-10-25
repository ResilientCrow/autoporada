import { z } from 'zod';

import { POINT_LIMITS, type BulletSpec } from '@/domain/report';

/** A bullet a point type offers; the key is a stable slug that drafts copy. */
const bulletSpecSchema = z.strictObject({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(POINT_LIMITS.bulletKey),
  label: z.string().min(1).max(POINT_LIMITS.bulletLabel),
  kind: z.enum(['people', 'text']),
  required: z.boolean(),
  role: z.literal('organisers').optional(),
}) satisfies z.ZodType<BulletSpec>;

/**
 * `point_types.default_bullets`, as stored and as the admin form sends it.
 * A draft bullet finds its spec by key, so no two bullets share one.
 */
export const defaultBulletsSchema = z
  .array(bulletSpecSchema)
  .max(POINT_LIMITS.bullets)
  .refine((bullets) => new Set(bullets.map((b) => b.key)).size === bullets.length, {
    message: 'duplicate-key',
  });
