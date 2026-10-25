import { z } from 'zod';

import type { Salutation } from '@/domain/cs';
import {
  POINT_LIMITS,
  type PointKind,
  type DraftBullet,
  type DraftPerson,
  type DraftStatement,
  type PointContent,
} from '@/domain/report';
import { parseRichDoc } from '@/domain/richtext';

import { bulletKeySchema, uniqueKeys } from './point-type';

/**
 * The jsonb parts of a point, as stored and as the editor sends them. A draft
 * may be unfinished, so only the bounds and the shape are checked here;
 * readiness asks for names, salutations and quotes at submit.
 */
const capped = (max: number) => z.string().max(max);
const { person: PERSON } = POINT_LIMITS;

const salutationSchema = z.enum(['pan', 'pani', 'slecna']) satisfies z.ZodType<Salutation>;

const draftPersonSchema = z.strictObject({
  graphId: capped(POINT_LIMITS.graphId).optional(),
  salutation: salutationSchema.nullable(),
  titlesBefore: capped(PERSON.title).optional(),
  givenName: capped(PERSON.name),
  familyName: capped(PERSON.name),
  titlesAfter: capped(PERSON.title).optional(),
  affiliation: capped(PERSON.affiliation).optional(),
  affiliationYear: capped(POINT_LIMITS.affiliationYear).optional(),
}) satisfies z.ZodType<DraftPerson>;

const bulletBase = { key: bulletKeySchema, label: capped(POINT_LIMITS.bulletLabel) };

const draftBulletSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...bulletBase,
    kind: z.literal('people'),
    order: z.enum(['input', 'class-surname']),
    people: z.array(draftPersonSchema).max(POINT_LIMITS.peoplePerBullet),
  }),
  z.strictObject({ ...bulletBase, kind: z.literal('text'), text: capped(POINT_LIMITS.textBullet) }),
]) satisfies z.ZodType<DraftBullet>;

const peopleIn = (bullets: readonly DraftBullet[]) =>
  bullets.reduce((sum, b) => sum + (b.kind === 'people' ? b.people.length : 0), 0);

/** `points.bullets`: at most 12, keys unique, at most 400 people in all. */
export const draftBulletsSchema = z
  .array(draftBulletSchema)
  .max(POINT_LIMITS.bullets)
  .refine(uniqueKeys, { message: 'duplicate-key' })
  .refine((bullets) => peopleIn(bullets) <= POINT_LIMITS.peoplePerPoint, {
    message: 'too-many-people',
  });

const draftStatementSchema = z.strictObject({
  speaker: draftPersonSchema.nullable(),
  speakerGenitive: capped(POINT_LIMITS.speakerGenitive),
  affiliation: capped(POINT_LIMITS.statementAffiliation).optional(),
  quote: capped(POINT_LIMITS.quote),
}) satisfies z.ZodType<DraftStatement>;

/** `points.statements`: at most 10. */
export const draftStatementsSchema = z.array(draftStatementSchema).max(POINT_LIMITS.statements);

/** The jsonb columns of a point. */
export type PointJsonb = Pick<PointContent, 'body' | 'bullets' | 'statements'>;

/**
 * The one parse of a point's jsonb, as stored and before every write; null
 * when the contract refuses any part. The body is checked against the widest
 * rich text profile; which profile a kind may use is the input contract's rule.
 */
export function parsePointJsonb(value: { [K in keyof PointJsonb]: unknown }): PointJsonb | null {
  const body = parseRichDoc(value.body, 'outline');
  const bullets = draftBulletsSchema.safeParse(value.bullets);
  const statements = draftStatementsSchema.safeParse(value.statements);
  if (!body.ok || !bullets.success || !statements.success) return null;
  return { body: body.doc, bullets: bullets.data, statements: statements.data };
}

/**
 * „Začít“ on the chooser, or a finance or pokyn proposal. `clientRef` is the
 * draft's id in the browser, so a retry returns the same draft. A report
 * names its type; finance and pokyn name none (the use case checks the pair
 * and that the type is on offer).
 */
export const createPointInput = z.strictObject({
  clientRef: z.uuid(),
  kind: z.enum(['report', 'finance', 'pokyn']) satisfies z.ZodType<PointKind>,
  typeId: z.uuid().nullable(),
});
export const createPointOutput = z.object({ id: z.uuid() });
