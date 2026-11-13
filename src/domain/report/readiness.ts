import { schoolYear } from '@/domain/cs';
import { exceedsLimits, isRichDocEmpty } from '@/domain/richtext';
import { compareDates, compareTimes, type CalDate } from '@/domain/time';

import type { BulletSpec, DraftBullet, DraftPerson, PointContent, PointKind } from './content';
import { displayName, isParticipant } from './people';
import { reportBody } from './report-body';

export type ProblemCode =
  | 'title-required'
  | 'body-required'
  | 'body-too-long'
  | 'event-date-required'
  | 'event-not-over'
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

const emptyBullet = (b: DraftBullet): boolean =>
  b.kind === 'people' ? b.people.length === 0 : blank(b.text);

function timeProblems(content: PointContent): Problem[] {
  const { eventDate, endDate, timeFrom, timeTo } = content;
  if (timeTo === null) return [];
  if (timeFrom === null) return [problem('time-to-without-from', 'content.timeTo')];
  const oneDay = endDate === null || (eventDate !== null && compareDates(endDate, eventDate) === 0);
  return oneDay && compareTimes(timeTo, timeFrom) <= 0
    ? [problem('time-to-before-from', 'content.timeTo')]
    : [];
}

/** A report is written about an akce that has happened: one that starts or ends after today is not over yet. */
function overProblems({ eventDate, endDate }: PointContent, today: CalDate): Problem[] {
  if (eventDate !== null && compareDates(eventDate, today) > 0)
    return [problem('event-not-over', 'content.eventDate')];
  if (endDate !== null && compareDates(endDate, today) > 0)
    return [problem('event-not-over', 'content.endDate')];
  return [];
}

function headProblems(content: PointContent, today: CalDate): Problem[] {
  return [
    ...(blank(content.title) ? [problem('title-required', 'content.title')] : []),
    ...(content.eventDate === null ? [problem('event-date-required', 'content.eventDate')] : []),
    ...overProblems(content, today),
    ...timeProblems(content),
  ];
}

const openingProblems = (content: PointContent): Problem[] =>
  blank(content.opening) ? [problem('opening-required', 'content.opening')] : [];

/** The body saves within the rich text limits; with the opening in front it may not. */
const bodyProblems = (content: PointContent): Problem[] =>
  exceedsLimits(reportBody(content.opening, content.body))
    ? [problem('body-too-long', 'content.body')]
    : [];

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
    return [problem('salutation-required', `${path}.salutation`, { name: displayName(person) })];
  }
  return [];
}

function staleClass(people: readonly (readonly [DraftPerson, string])[], year: string): Problem[] {
  const stale = people.filter(
    ([p]) => !blank(p.affiliation) && !blank(p.familyName) && p.affiliationYear !== year,
  );
  const first = stale[0];
  if (first === undefined) return [];
  const names = [...new Set(stale.map(([p]) => displayName(p)))];
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

function speakerWarnings(content: PointContent): Warning[] {
  const warnings: Warning[] = [];
  content.statements.forEach(({ speaker }, i) => {
    if (speaker === null || blank(displayName(speaker))) return;
    if (isParticipant(content, speaker)) return;
    const params = { n: i + 1, name: displayName(speaker) };
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
 * `today` is the Prague day: a report on an akce that has not ended by then is
 * refused (`event-not-over`), and classes count in its school year. Text is trimmed everywhere, so
 * a blank title or opening fails here before the database's
 * `points_submitted_complete` CHECK could.
 *
 * Together with `submittedContent`, the report rules cover everything
 * `reportFromContent` leaves out or changes: a person without a salutation or a
 * family name, a people bullet without people or a label, an empty text bullet,
 * a statement without a genitive or a quote, a time to that is not after the
 * time from on one day (`time-to-before-from`, `time-to-without-from`), and an
 * opening plus body over the rich text limits (`body-too-long`). A newline or a
 * tab in a plain field is not a problem: `reportFromContent` collapses it into a
 * space. So a point that passes, once `submittedContent` has dropped its empty
 * optional bullets, loses nothing in the preview or the snapshot and gives a
 * report the snapshot parses. An end date before the start is refused by the
 * save, not here.
 */
export function missingForSubmit(
  kind: PointKind,
  content: PointContent,
  spec: readonly BulletSpec[],
  today: CalDate,
): Readiness {
  if (kind !== 'report') {
    const title = blank(content.title) ? [problem('title-required', 'content.title')] : [];
    const body = isRichDocEmpty(content.body) ? [problem('body-required', 'content.body')] : [];
    return { problems: [...title, ...body], warnings: [] };
  }
  return {
    problems: [
      ...headProblems(content, today),
      ...bulletProblems(content, spec, schoolYear(today)),
      ...openingProblems(content),
      ...bodyProblems(content),
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
