/**
 * Fails the build on any entry point that is not wrapped (ADR 0011). Until
 * M4 adds the first action and route, the runtime half has nothing to
 * check; the scanner's self-tests guard the detector meanwhile.
 */
import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { isUseCase } from '@/application/core';
import { USE_CASES } from '@/application/use-cases';
import { wrappedInfo } from '@/server/bind';

import {
  ACTION_MODULES,
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

  it('wraps every export of every action module and route file, each once', async () => {
    const seen = new Set<unknown>();
    for (const file of [...ACTION_MODULES, ...ROUTE_FILES]) {
      const kind = ACTION_MODULES.includes(file) ? 'action' : 'route';
      for (const [name, value] of Object.entries(await exportsOf(file))) {
        expect(wrappedInfo(value)?.kind, `${file}: ${name}`).toBe(kind);
        expect(seen.has(value), `${file}: ${name} is exported twice`).toBe(false);
        seen.add(value);
      }
    }
  });

  it('wraps only registered use cases, and limits sign-in routes by address', async () => {
    const registered = new Set<unknown>(USE_CASES);
    for (const file of [...ACTION_MODULES, ...ROUTE_FILES]) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind === 'action') expect(registered.has(info.useCase), file).toBe(true);
        // Route groups such as (public) are not part of the URL.
        const url = file.replace(/\/\([^/]+\)(?=\/)/g, '');
        if (info?.kind === 'route' && url.startsWith('src/app/auth/')) {
          expect(info.rateLimit, file).toBe('auth');
        }
      }
    }
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
