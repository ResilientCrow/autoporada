/**
 * Fails the build on any entry point that is not wrapped (ADR 0011), and pins which use cases
 * the Arch run endpoint puts under the autosave and submission limits (ADR 0017).
 */
import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { isUseCase } from '@/application/core';
import { USE_CASES } from '@/application/use-cases';
import { requiresStepUp, STEP_UP_ACTIONS } from '@/domain/policy';
import { wrappedInfo } from '@/server/bind';
import { LIMITS } from '@/server/rate-limit';
import { AUTOSAVE, limitOf, SUBMISSION } from '@/server/routes/arch-run';

import {
  exportsOf,
  read,
  ROUTE_FILES,
  SCANNED,
  SOURCE_FILES,
  USE_CASE_MODULES,
} from './entries';

describe('inventory of entry points', () => {
  it('scans the whole source tree', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(100);
  });

  it('finds every entry point in the one shape ADR 0011 allows', () => {
    expect(SCANNED.flatMap((s) => s.findings)).toEqual([]);
  });

  it('wraps every export of every route file, each once', async () => {
    const seen = new Set<unknown>();
    for (const file of ROUTE_FILES) {
      for (const [name, value] of Object.entries(await exportsOf(file))) {
        expect(wrappedInfo(value)?.kind, `${file}: ${name}`).toBe('route');
        expect(seen.has(value), `${file}: ${name} is exported twice`).toBe(false);
        seen.add(value);
      }
    }
  });

  it('limits sign-in routes by address, and signs in for the api', async () => {
    for (const file of ROUTE_FILES) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind !== 'route') continue;
        if (file.startsWith('src/app/auth/')) expect(info.rateLimit, file).toBe('auth');
        // The browser's own fetches (the people search, the Arch state and run) are never public.
        if (file.startsWith('src/app/api/')) expect(info.access, file).toBe('session');
      }
    }
  });

  it('puts the same use cases under the autosave and submission limits as ADR 0017 says', () => {
    const msg = (set: string) =>
      `The ${set} set of the Arch run endpoint changed: update ADR 0017 and src/server/routes/arch-run.ts together.`;
    expect([...AUTOSAVE].sort(), msg('autosave')).toEqual(['future.save', 'points.save']);
    expect([...SUBMISSION].sort(), msg('submission')).toEqual([
      'access.cancel',
      'access.request',
      'future.create',
      'future.requestCancel',
      'future.retract',
      'future.retractCancel',
      'future.startReport',
      'future.submit',
      'future.withdraw',
      'points.create',
      'points.retract',
      'points.submit',
      'points.withdraw',
      'users.setAddress',
    ]);
    expect(LIMITS.autosave).toEqual({ max: 120, windowMs: 60_000, key: 'user' });
  });

  it('limits each pinned name as its set says, and every other name as admin', () => {
    expect(limitOf('points.save')).toBe('autosave');
    expect(limitOf('future.save')).toBe('autosave');
    expect(limitOf('points.submit')).toBe('submission');
    expect(limitOf('access.request')).toBe('submission');
    expect(limitOf('users.setAddress')).toBe('submission');
    expect(limitOf('points.decide')).toBe('admin');
    expect(limitOf('users.setFunctions')).toBe('admin');
    expect(limitOf('registry.newSchoolYear')).toBe('admin');
    expect(limitOf('no.such')).toBe('admin');
  });

  it('pins every autosave and submission name to a registered use case', () => {
    const names = new Set(USE_CASES.map((u) => u.name));
    for (const name of [...AUTOSAVE, ...SUBMISSION]) expect(names.has(name), name).toBe(true);
  });

  it('asks for a fresh sign-in before „Nový školní rok“, and before no other registry action', () => {
    expect(requiresStepUp('registry.newSchoolYear')).toBe(true);
    expect(STEP_UP_ACTIONS.filter((action) => action.startsWith('registry.'))).toEqual([
      'registry.newSchoolYear',
    ]);
  });

  it('registers every use case exactly once, under a unique name', async () => {
    const defined = new Set<unknown>();
    for (const file of USE_CASE_MODULES) {
      for (const value of Object.values(await exportsOf(file))) {
        if (isUseCase(value)) defined.add(value);
      }
    }
    expect(new Set(USE_CASES)).toEqual(defined);
    const names = USE_CASES.map((u) => u.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('defines use cases only where the registry check can see them', () => {
    const elsewhere = SOURCE_FILES.filter(
      (file) =>
        !file.startsWith('src/application/use-cases/') &&
        file !== 'src/application/core/define-use-case.ts' &&
        !/\.test\.tsx?$/.test(file) &&
        /define(?:System)?UseCase\s*[<(]/.test(read(file)),
    );
    expect(elsewhere).toEqual([]);
  });

  it('has a colocated test for every module that defines a use case', () => {
    const untested = USE_CASE_MODULES.filter(
      (file) =>
        /define(?:System)?UseCase\(/.test(read(file)) &&
        !existsSync(file.replace(/\.ts$/, '.test.ts')),
    );
    expect(untested).toEqual([]);
  });
});
