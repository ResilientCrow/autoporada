import { z } from 'zod';

import { TITLE_GENDERS } from '@/domain/cs';
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
  label: z.string().trim().min(1).max(POINT_LIMITS.bulletLabel),
  kind: z.enum(['people', 'text']),
  required: z.boolean(),
  role: z.literal('organisers').optional(),
}) satisfies z.ZodType<BulletSpec>;

/** `point_types.default_bullets`, as stored and as the admin form sends it. */
export const defaultBulletsSchema = z
  .array(bulletSpecSchema)
  .max(POINT_LIMITS.bullets)
  .refine(uniqueKeys, { message: 'duplicate-key' });

/**
 * The type lists. The chooser sends nothing; the headmaster's admin sends `includeInactive` and
 * gets every type with what the form edits (the gate differs: `point.create` or `pointTypes.manage`).
 */
export const listPointTypesInput = z.strictObject({ includeInactive: z.boolean().optional() });
export const listPointTypesOutput = z.object({
  /** In `position` order; the active ones only, unless `includeInactive`. */
  types: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      /** Only for `includeInactive`. */
      detail: z
        .object({
          titleGender: z.enum(TITLE_GENDERS).nullable(),
          defaultBullets: defaultBulletsSchema,
          active: z.boolean(),
          locked: z.boolean(),
          position: z.number().int(),
          version: z.number().int().positive(),
        })
        .optional(),
    }),
  ),
});

/** At most one bullet names the organisers of the opening sentence, and it lists people. */
const organisersRule = (bullets: readonly BulletSpec[]) =>
  bullets.filter((b) => b.role === 'organisers').length <= 1 &&
  bullets.every((b) => b.role === undefined || b.kind === 'people');

/**
 * „Uložit“ of the type admin: the whole desired type. Without `id` a new type is made (after the
 * last one unless `position` says otherwise); with it `expectedVersion` is the version the form saw.
 */
export const savePointTypeInput = z
  .strictObject({
    id: z.uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(POINT_LIMITS.typeName),
    titleGender: z.enum(TITLE_GENDERS).nullable(),
    defaultBullets: defaultBulletsSchema.refine(organisersRule, { message: 'organisers' }),
    active: z.boolean(),
    position: z.number().int().min(1).max(999).optional(),
  })
  .superRefine((input, ctx) => {
    const missing = input.id === undefined ? 'id' : 'expectedVersion';
    if ((input.id === undefined) !== (input.expectedVersion === undefined)) {
      ctx.addIssue({ code: 'custom', path: [missing], params: { code: 'required' } });
    }
  });
/** „Smazat typ“: the type at the version the form saw. */
export const deletePointTypeInput = z.strictObject({
  id: z.uuid(),
  expectedVersion: z.number().int().positive(),
});
export const deletePointTypeOutput = z.object({ id: z.uuid() });

export const savePointTypeOutput = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  /** False when the type already had these values: nothing was written. */
  changed: z.boolean(),
});
