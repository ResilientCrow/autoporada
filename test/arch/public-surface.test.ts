/**
 * What anyone can reach without signing in, and what runs as the system.
 * Widening either list is an edit reviewers see, like the policy matrix.
 */
import { describe, expect, it } from 'vitest';

import { USE_CASES } from '@/application/use-cases';
import { wrappedInfo } from '@/server/pipeline';

import { exportsOf, ROUTE_FILES } from './entries';

/** The sign-in routes; M11 adds /healthz. */
const PUBLIC_ROUTES: readonly string[] = ['auth.login'];

/** Sign-in steps run before anyone is signed in; M7 adds jobs. */
const SYSTEM_USE_CASES: readonly string[] = [
  'auth.beginLogin',
  'auth.completeSignIn',
  'auth.recordRejection',
  'auth.resolveSession',
  'auth.takeSignIn',
];

describe('public surface', () => {
  it('lists every route open without a session', async () => {
    const open: string[] = [];
    for (const file of ROUTE_FILES) {
      for (const value of Object.values(await exportsOf(file))) {
        const info = wrappedInfo(value);
        if (info?.kind === 'route' && info.access === 'public') open.push(info.name);
      }
    }
    expect(open.sort()).toEqual([...PUBLIC_ROUTES].sort());
  });

  it('lists every use case that runs as the system', () => {
    const system = USE_CASES.filter((u) => u.principal === 'system').map((u) => u.name);
    expect(system.sort()).toEqual([...SYSTEM_USE_CASES].sort());
  });
});
