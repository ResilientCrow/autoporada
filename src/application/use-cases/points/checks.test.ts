import { describe, expect, it } from 'vitest';

import { MAX_FIELDS } from '@/application/core';
import type { Problem, ProblemCode } from '@/domain/report';

import { readinessIssues } from './checks';

const at = (code: ProblemCode, path = 'content.x'): Problem => ({ code, path, params: {} });

describe('readinessIssues', () => {
  it.each([
    ['title-required', 'required'],
    ['body-required', 'required'],
    ['body-too-long', 'too-long'],
    ['event-date-required', 'required'],
    ['opening-required', 'required'],
    ['label-required', 'required'],
    ['people-required', 'required'],
    ['text-required', 'required'],
    ['people-none', 'required'],
    ['person-name-required', 'required'],
    ['salutation-required', 'required'],
    ['participants-address-required', 'required'],
    ['participants-address-several', 'several'],
    ['statements-required', 'required'],
    ['speaker-required', 'required'],
    ['genitive-required', 'required'],
    ['quote-required', 'required'],
    ['time-to-without-from', 'invalid'],
    ['time-to-before-from', 'invalid'],
    ['class-stale', 'invalid'],
  ] as const)('reports %s as %s on its path', (code, issue) => {
    expect(readinessIssues([at(code)])).toEqual({ 'content.x': issue });
  });

  it('keeps the first problem of a path', () => {
    const problems = [
      at('people-required', 'content.bullets'),
      at('people-none', 'content.bullets'),
    ];
    expect(readinessIssues([...problems, at('class-stale', 'content.bullets')])).toEqual({
      'content.bullets': 'required',
    });
    expect(readinessIssues([at('class-stale', 'content.bullets'), ...problems])).toEqual({
      'content.bullets': 'invalid',
    });
  });

  it('names no field without a problem', () => {
    expect(readinessIssues([])).toEqual({});
  });

  it(`stops at ${MAX_FIELDS} fields`, () => {
    const problems = Array.from({ length: MAX_FIELDS + 5 }, (_, i) =>
      at('quote-required', `content.statements.${i}.quote`),
    );
    const fields = readinessIssues(problems);
    expect(Object.keys(fields)).toHaveLength(MAX_FIELDS);
    expect(fields).toHaveProperty(['content.statements.0.quote'], 'required');
    expect(fields).not.toHaveProperty([`content.statements.${MAX_FIELDS}.quote`]);
  });
});
