import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The worker's grant on `settings` is `SELECT (key, value)` (drizzle/0030): `version` is the
 * headmaster's save token and stays out of reach. `readSetting` and `settings.get` select it,
 * so the code the worker runs reads through `readSettingValue` and `settings.value` only.
 */
const WORKER_DIRS = ['src/application/notifications', 'src/application/jobs'];
const WITH_VERSION = /\breadSetting\b|\bsettings\.get\(/;

const sourceFiles = (dir: string) =>
  readdirSync(join(process.cwd(), dir), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => `${dir}/${name}`);

describe('the worker reads settings without their version', () => {
  it('scans the files the worker runs', () => {
    expect(WORKER_DIRS.flatMap(sourceFiles).length).toBeGreaterThan(10);
  });

  it('calls neither readSetting nor settings.get in notifications or jobs', () => {
    const offenders = WORKER_DIRS.flatMap(sourceFiles).filter((file) =>
      WITH_VERSION.test(readFileSync(join(process.cwd(), file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('would catch a call (the pattern matches both, and not readSettingValue)', () => {
    expect(WITH_VERSION.test('await readSetting(tx, "deadline")')).toBe(true);
    expect(WITH_VERSION.test('await tx.settings.get(key)')).toBe(true);
    expect(WITH_VERSION.test("await readSetting<'deadline'>(tx, 'deadline')")).toBe(true);
    expect(WITH_VERSION.test('await readSettingValue(tx, "deadline")')).toBe(false);
    expect(WITH_VERSION.test('await tx.settings.value(key)')).toBe(false);
  });
});
