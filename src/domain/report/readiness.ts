import { formatName, type PersonName } from '@/domain/cs';
import { isRichDocEmpty } from '@/domain/richtext';
import { compareDates, compareTimes } from '@/domain/time';

import type { BulletSpec, DraftBullet, DraftPerson, PointContent, PointKind } from './content';

export type ProblemCode =
  | 'title-required'
  | 'body-required'
  | 'event-date-required'
  | 'time-to-without-from'
  | 'time-to-before-from'
  | 'opening-required'
  | 'label-required'
  | 'people-required'
  | 'text-required'
  | 'people-none'
  | 'person-name-required'
  | 'salutation-required'
  | 'class-stale'
  | 'statements-required'
  | 'speaker-required'
  | 'genitive-required'
  | 'quote-required';

/** What a line of copy needs to name the problem; the text itself lives in ui/copy. */
export type Params = Readonly<Record<string, string | number | readonly string[]>>;

interface Finding<C extends string> {
  readonly code: C;
  /**
   * The field it belongs to, dotted like the save contract's field issues
   * (`content.title`, `content.bullets.1.people`, `content.statements.0.quote`).
   * A required bullet the author removed has no field of its own and is
   * reported on `content.bullets`.
   */
  readonly path: string;
  readonly params: Params;
}

/** Blocks a submit. */
export type Problem = Finding<ProblemCode>;
/** Worth a look, never blocks. */
export type Warning = Finding<'speaker-not-participant'>;

export interface Readiness {
  readonly problems: readonly Problem[];
  readonly warnings: readonly Warning[];
}

const problem = (code: ProblemCode, path: string, params: Params = {}): Problem => ({
  code,
  path,
  params,
});

const blank = (text: string | undefined | null): boolean => (text ?? '').trim() === '';

/** formatName leaves the salutation out, so any value serves for a person who has none yet. */
function nameOf(p: DraftPerson): string {
  const trim = (s: string | undefined) => s?.trim() ?? '';
  const name: PersonName = {
    salutation: p.salutation ?? 'pan',
    titlesBefore: trim(p.titlesBefore),
    givenName: trim(p.givenName),
    familyName: trim(p.familyName),
    titlesAfter: trim(p.titlesAfter),
  };
  return formatName(name);
}

const emptyBullet = (b: DraftBullet): boolean =>
  b.kind === 'people' ? b.people.length === 0 : blank(b.text);

function timeProblems(content: PointContent): Problem[] {
  const { eventDate, endDate, timeFrom, timeTo } = content;
  if (timeTo === null) return [];
  if (timeFrom === null) return [problem('time-to-without-from', 'content.timeTo')];
  const oneDay = endDate === null || (eventDate !== null && compareDates(endDate, eventDate) === 0);
  return oneDay && compareTimes(timeTo, timeFrom) < 0
    ? [problem('time-to-before-from', 'content.timeTo')]
    : [];
}

function headProblems(content: PointContent): Problem[] {
  return [
    ...(blank(content.title) ? [problem('title-required', 'content.title')] : []),
    ...(content.eventDate === null ? [problem('event-date-required', 'content.eventDate')] : []),
    ...timeProblems(content),
  ];
}

const openingProblems = (content: PointContent): Problem[] =>
  blank(content.opening) ? [problem('opening-required', 'content.opening')] : [];

/** A required bullet is filled when it has a person, or text that is not blank. */
function requiredBulletProblem(bullet: DraftBullet, index: number): Problem[] {
  const base = `content.bullets.${index}`;
  if (bullet.kind === 'people') {
    return bullet.people.length === 0
      ? [problem('people-required', `${base}.people`, { label: bullet.label })]
      : [];
  }
  return blank(bullet.text)
    ? [problem('text-required', `${base}.text`, { label: bullet.label })]
    : [];
}

function personProblems(
  person: DraftPerson,
  path: string,
  position: number,
  label: string,
): Problem[] {
  if (blank(person.familyName))
    return [problem('person-name-required', `${path}.familyName`, { position, label })];
  if (person.salutation === null) {
    return [problem('salutation-required', `${path}.salutation`, { name: nameOf(person) })];
  }
  return [];
}

function staleClass(people: readonly (readonly [DraftPerson, string])[], year: string): Problem[] {
  const stale = people.filter(
    ([p]) => !blank(p.affiliation) && !blank(p.familyName) && p.affiliationYear !== year,
  );
  const first = stale[0];
  if (first === undefined) return [];
  const names = [...new Set(stale.map(([p]) => nameOf(p)))];
  return [problem('class-stale', `${first[1]}.affiliation`, { names })];
}

function bulletProblems(
  content: PointContent,
  spec: readonly BulletSpec[],
  year: string,
): Problem[] {
  const required = new Map(spec.filter((s) => s.required).map((s) => [s.key, s]));
  const perBullet: Problem[] = [];
  const persons: (readonly [DraftPerson, string])[] = [];
  content.bullets.forEach((bullet, i) => {
    const isRequired = required.has(bullet.key);
    // A submit keeps required and filled bullets, and the snapshot needs a label on each.
    if ((isRequired || !emptyBullet(bullet)) && blank(bullet.label))
      perBullet.push(problem('label-required', `content.bullets.${i}.label`, { n: i + 1 }));
    if (isRequired) perBullet.push(...requiredBulletProblem(bullet, i));
    if (bullet.kind !== 'people') return;
    bullet.people.forEach((person, j) => {
      const path = `content.bullets.${i}.people.${j}`;
      perBullet.push(...personProblems(person, path, j + 1, bullet.label));
      persons.push([person, path]);
    });
  });

  const present = new Set(content.bullets.map((b) => b.key));
  const removed = [...required.values()]
    .filter((s) => !present.has(s.key))
    .map((s) =>
      problem(s.kind === 'people' ? 'people-required' : 'text-required', 'content.bullets', {
        label: s.label,
      }),
    );

  const named =
    removed.some((p) => p.code === 'people-required') ||
    perBullet.some((p) => p.code === 'people-required');
  const none = persons.length === 0 && !named ? [problem('people-none', 'content.bullets')] : [];
  return [...perBullet, ...removed, ...none, ...staleClass(persons, year)];
}

function statementProblems(content: PointContent): Problem[] {
  if (content.statements.length === 0)
    return [problem('statements-required', 'content.statements')];
  return content.statements.flatMap((s, i) => {
    const base = `content.statements.${i}`;
    const params = { n: i + 1 };
    return [
      ...(s.speaker === null ? [problem('speaker-required', `${base}.speaker`, params)] : []),
      ...(blank(s.speakerGenitive)
        ? [problem('genitive-required', `${base}.speakerGenitive`, params)]
        : []),
      ...(blank(s.quote) ? [problem('quote-required', `${base}.quote`, params)] : []),
    ];
  });
}

/**
 * The same person: by graphId when both have one, else by given and family
 * name, ignoring case and titles (a typed copy of a listed person still matches).
 * The two names stay apart in the key: „Jan Novák“ „Svoboda“ is not „Jan“
 * „Novák Svoboda“.
 */
function samePerson(a: DraftPerson, b: DraftPerson): boolean {
  if (a.graphId !== undefined && b.graphId !== undefined) return a.graphId === b.graphId;
  const key = (p: DraftPerson) =>
    `${p.givenName.trim()}|${p.familyName.trim()}`.toLocaleLowerCase('cs');
  return key(a) === key(b);
}

function speakerWarnings(content: PointContent): Warning[] {
  const participants = content.bullets.flatMap((b) => (b.kind === 'people' ? b.people : []));
  const warnings: Warning[] = [];
  content.statements.forEach(({ speaker }, i) => {
    if (speaker === null || blank(nameOf(speaker))) return;
    if (participants.some((p) => samePerson(p, speaker))) return;
    const params = { n: i + 1, name: nameOf(speaker) };
    warnings.push({
      code: 'speaker-not-participant',
      path: `content.statements.${i}.speaker`,
      params,
    });
  });
  return warnings;
}

/**
 * What stops a point from being submitted, in form order (title, dates,
 * times, bullets, opening, statements), and what is only worth a look.
 * `spec` is the type's default bullets (empty for finance and pokyn);
 * `schoolYear` is `schoolYear(today)`. Text is trimmed everywhere, so
 * a blank title or opening fails here before the database's
 * `points_submitted_complete` CHECK could.
 *
 * Together with `submittedContent`, the report rules cover exactly what
 * `reportFromContent` would drop: a person without a salutation, a people
 * bullet without people, an empty text bullet, a statement without a genitive
 * or a quote. A point that passes, once `submittedContent` has dropped its empty
 * optional bullets, loses nothing in the preview or the snapshot. Two rules go
 * beyond the drops: a person needs a family name and a kept bullet a label,
 * which the snapshot requires.
 */
export function missingForSubmit(
  kind: PointKind,
  content: PointContent,
  spec: readonly BulletSpec[],
  schoolYear: string,
): Readiness {
  if (kind !== 'report') {
    const title = blank(content.title) ? [problem('title-required', 'content.title')] : [];
    const body = isRichDocEmpty(content.body) ? [problem('body-required', 'content.body')] : [];
    return { problems: [...title, ...body], warnings: [] };
  }
  return {
    problems: [
      ...headProblems(content),
      ...bulletProblems(content, spec, schoolYear),
      ...openingProblems(content),
      ...statementProblems(content),
    ],
    warnings: speakerWarnings(content),
  };
}

/**
 * The content as a submit stores it: optional bullets left empty are dropped
 * (a custom bullet, whose key is in no spec, counts as optional). Required
 * bullets stay; readiness has already asked for them. Used by `points.submit`
 * after readiness passes, so the stored content makes `reportFromContent` drop
 * nothing.
 */
export function submittedContent(content: PointContent, spec: readonly BulletSpec[]): PointContent {
  const required = new Set(spec.filter((s) => s.required).map((s) => s.key));
  return {
    ...content,
    bullets: content.bullets.filter((b) => required.has(b.key) || !emptyBullet(b)),
  };
}
