/**
 * Fails the build on any entry point that is not wrapped (ADR 0011). Until
 * M4 adds the first action and route, the runtime half has nothing to
 * check; the scanner's self-tests guard the detector meanwhile.
 */
import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { isUseCase } from '@/application/core';
import { USE_CASES } from '@/application/use-cases';
import { requiresStepUp, STEP_UP_ACTIONS } from '@/domain/policy';
import { wrappedInfo } from '@/server/bind';
import { LIMITS } from '@/server/rate-limit';

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

  it('wraps only registered use cases, limits sign-in routes by address, and signs in for the api', async () => {
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
        // The browser's own fetches (the people search) are never public.
        if (info?.kind === 'route' && url.startsWith('src/app/api/')) {
          expect(info.access, file).toBe('session');
        }
      }
    }
  });

  it('lets only an autosaving editor’s actions skip the refresh (ADR 0017)', async () => {
    const skipping: string[] = [];
    for (const file of ACTION_MODULES) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind === 'action' && info.refresh === 'none') skipping.push(info.useCase.name);
      }
    }
    // ADR 0017 item 1 names all four; each change updates the ADR and this list together.
    expect(
      skipping.sort(),
      'The actions with refresh: none changed: update ADR 0017 item 1 and this list together.',
    ).toEqual(['future.create', 'future.save', 'points.create', 'points.save']);
  });

  it('gives the editor’s save and its conflict check the autosave limit, per user', async () => {
    const limited: Record<string, string> = {};
    for (const file of ACTION_MODULES) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind === 'action' && info.rateLimit === 'autosave') {
          limited[info.useCase.name] = info.rateLimit;
        }
      }
    }
    // An akce's conflict check is a read of the item (`future.get`): it has no status use case of its own.
    expect(Object.keys(limited).sort()).toEqual([
      'future.get',
      'future.save',
      'points.save',
      'points.status',
    ]);
    expect(LIMITS.autosave).toEqual({ max: 120, windowMs: 60_000, key: 'user' });
  });

  it('lets the submit, retract and withdraw refresh the page, under the submission limit', async () => {
    const found: Record<string, unknown> = {};
    const moves = ['points.submit', 'points.retract', 'points.withdraw'];
    for (const file of ACTION_MODULES) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind === 'action' && moves.includes(info.useCase.name))
          found[info.useCase.name] = [info.rateLimit, info.refresh];
      }
    }
    // They move the state, so the page remounts as the other view (ADR 0017 item 1).
    expect(found).toEqual({
      'points.submit': ['submission', 'page'],
      'points.retract': ['submission', 'page'],
      'points.withdraw': ['submission', 'page'],
    });
  });

  it('lets the akce submit, retract, decision and cancel refresh the page, and the create and the save count as the points’ do', async () => {
    const found: Record<string, unknown> = {};
    for (const file of ACTION_MODULES) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind === 'action' && info.useCase.name.startsWith('future.'))
          found[info.useCase.name] = [info.rateLimit, info.refresh];
      }
    }
    expect(found).toEqual({
      'future.create': ['submission', 'none'],
      'future.save': ['autosave', 'none'],
      'future.get': ['autosave', 'page'],
      'future.submit': ['submission', 'page'],
      'future.retract': ['submission', 'page'],
      'future.decide': ['admin', 'page'],
      'future.cancel': ['submission', 'page'],
      'future.startReport': ['submission', 'page'],
    });
  });

  it('lets the review’s decision and edit refresh the page, under the admin limit', async () => {
    const found: Record<string, unknown> = {};
    const review = ['points.decide', 'points.reviewEdit'];
    for (const file of ACTION_MODULES) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind === 'action' && review.includes(info.useCase.name))
          found[info.useCase.name] = [info.rateLimit, info.refresh];
      }
    }
    // A reviewer's edit is explicit and audited, never an autosave (design section 10).
    expect(found).toEqual({
      'points.decide': ['admin', 'page'],
      'points.reviewEdit': ['admin', 'page'],
    });
  });

  it('lets the point type admin refresh the page, under the admin limit', async () => {
    const found: Record<string, unknown> = {};
    for (const file of ACTION_MODULES) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind === 'action' && info.useCase.name === 'pointTypes.save')
          found[info.useCase.name] = [info.rateLimit, info.refresh];
      }
    }
    expect(found).toEqual({ 'pointTypes.save': ['admin', 'page'] });
  });

  it('lets the settings save refresh the page, under the admin limit', async () => {
    const found: Record<string, unknown> = {};
    for (const file of ACTION_MODULES) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind === 'action' && info.useCase.name === 'settings.save')
          found[info.useCase.name] = [info.rateLimit, info.refresh];
      }
    }
    expect(found).toEqual({ 'settings.save': ['admin', 'page'] });
  });

  it('puts the registry, the outline and the issue’s own edits under the admin limit, each refreshing the page', async () => {
    const found: Record<string, unknown> = {};
    const prefixes = ['registry.', 'outline.'];
    const named = [
      'issues.setDetails',
      'issues.setAnnex2',
      'issues.setPlaceholder',
      'issues.move',
      'issues.drop',
      'issues.add',
      'issues.generate',
    ];
    for (const file of ACTION_MODULES) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind !== 'action') continue;
        const name = info.useCase.name;
        if (prefixes.some((prefix) => name.startsWith(prefix)) || named.includes(name)) {
          found[name] = [info.rateLimit, info.refresh];
        }
      }
    }
    const admin = ['admin', 'page'];
    // The headmaster’s tools are not autosaving editors: every one refreshes (ADR 0017 lists the four that do not).
    expect(found).toEqual({
      'registry.addEntries': admin,
      'registry.saveEntry': admin,
      'registry.removeEntry': admin,
      'registry.saveList': admin,
      'registry.moveList': admin,
      'registry.previewPaste': admin,
      'registry.newSchoolYear': admin,
      'outline.add': admin,
      'outline.save': admin,
      'outline.move': admin,
      'outline.remove': admin,
      'issues.setDetails': admin,
      'issues.setAnnex2': admin,
      'issues.setPlaceholder': admin,
      'issues.move': admin,
      'issues.drop': admin,
      'issues.add': admin,
      'issues.generate': admin,
    });
  });

  it('makes the paste preview a read, so no page refresh follows it', () => {
    // defineAction refreshes after a successful write only (define-action.test.ts pins that).
    expect(USE_CASES.find((u) => u.name === 'registry.previewPaste')?.mode).toBe('read');
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
