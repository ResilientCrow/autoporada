import { MAX_FIELDS } from '@/application/core';
import type { FieldIssueCode, FieldIssues } from '@/contracts';
import {
  REPORT_BULLETS,
  type BulletSpec,
  type PointContent,
  type PointKind,
  type Problem,
  type ProblemCode,
} from '@/domain/report';
import { parseRichDoc, type RichProfile } from '@/domain/richtext';

/** A report's body is plain paragraphs, as the meeting prints it; proposals may use the outline. */
const BODY_PROFILE: Readonly<Record<PointKind, RichProfile>> = {
  report: 'paragraphs',
  finance: 'outline',
  pokyn: 'outline',
};

/** The content fields whose check failed, each as `invalid`, on the path the contract uses. */
const invalid = (failed: Readonly<Record<string, boolean>>): FieldIssues =>
  Object.fromEntries(
    Object.entries(failed)
      .filter(([, refused]) => refused)
      .map(([field]): [string, FieldIssueCode] => [`content.${field}`, 'invalid']),
  );

/** The rows a report asks for (ADR 0067); none for finance and pokyn. */
export const reportSpec = (kind: PointKind): readonly BulletSpec[] =>
  kind === 'report' ? REPORT_BULLETS : [];

/**
 * What the content may hold for the point's kind, checked by the save and the
 * submit. A report's bullet with a key of its type's spec carries that spec's
 * kind, because the opening and readiness match a bullet to its spec by key;
 * a missing required bullet is readiness's to report. Finance and pokyn have
 * a title and a text only (design section 11).
 */
export function kindIssues(
  kind: PointKind,
  content: PointContent,
  spec: readonly BulletSpec[],
): FieldIssues {
  const body = !parseRichDoc(content.body, BODY_PROFILE[kind]).ok;
  if (kind !== 'report') {
    return invalid({
      body,
      bullets: content.bullets.length > 0,
      statements: content.statements.length > 0,
    });
  }
  const kinds = new Map(spec.map((bullet) => [bullet.key, bullet.kind]));
  return invalid({
    body,
    bullets: content.bullets.some((b) => (kinds.get(b.key) ?? b.kind) !== b.kind),
  });
}

/**
 * Each readiness problem as a field code: `invalid` for a value in the wrong
 * shape, `required` for anything missing. A new problem code fails the type
 * check until it is placed here.
 */
const ISSUE: Readonly<Record<ProblemCode, FieldIssueCode>> = {
  'title-required': 'required',
  'body-required': 'required',
  'body-too-long': 'too-long',
  'event-date-required': 'required',
  'event-not-over': 'invalid',
  'time-to-without-from': 'invalid',
  'time-to-before-from': 'invalid',
  'opening-required': 'required',
  'label-required': 'required',
  'people-required': 'required',
  'text-required': 'required',
  'people-none': 'required',
  'person-name-required': 'required',
  'salutation-required': 'required',
  'class-stale': 'invalid',
  'statements-required': 'required',
  'speaker-required': 'required',
  'genitive-required': 'required',
  'quote-required': 'required',
};

/**
 * Readiness problems as the field issues of a refused submit, the first
 * problem of a path winning. The client lists the problems in Czech itself;
 * these are the server's backstop.
 */
export function readinessIssues(problems: readonly Problem[]): FieldIssues {
  const fields: Record<string, FieldIssueCode> = {};
  for (const { code, path } of problems) {
    if (path in fields) continue;
    if (Object.keys(fields).length >= MAX_FIELDS) break;
    fields[path] = ISSUE[code];
  }
  return fields;
}
