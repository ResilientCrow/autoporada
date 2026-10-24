import { mkdtemp, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixedClock } from '../../../test/support/world/clock';

import { createHealth, HEALTH_FRESH_MS, HEALTH_INTERVAL_MS, startHealth } from './index';

const LONG_AGO = new Date('2000-01-01T00:00:00Z');
const SECOND = 1_000;

let dir: string;
let path: string;

beforeEach(async () => {
  vi.clearAllMocks();
  dir = await mkdtemp(join(tmpdir(), 'worker-alive-'));
  path = join(dir, 'worker.alive');
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

const exists = (): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/** The file's age marker: back-dated first, so "touched" means its mtime moved. */
async function backdate(): Promise<void> {
  await utimes(path, LONG_AGO, LONG_AGO);
}
const touched = async (): Promise<boolean> => (await stat(path)).mtime > LONG_AGO;

describe('the alive file (compose healthcheck)', () => {
  it('uses the production numbers: every 15 s, fresh for 60 s', () => {
    expect(HEALTH_INTERVAL_MS).toBe(15 * SECOND);
    expect(HEALTH_FRESH_MS).toBe(60 * SECOND);
  });

  it('is written once the database has answered', async () => {
    const health = createHealth({ ping: () => Promise.resolve(), clock: new FixedClock(), path });
    expect(await exists()).toBe(false);
    await health.tick();
    expect(await exists()).toBe(true);
  });

  it('is never written while the database has not answered once', async () => {
    const health = createHealth({
      ping: () => Promise.reject(new Error('down')),
      clock: new FixedClock(),
      path,
    });
    await health.tick();
    expect(await exists()).toBe(false);
  });

  it('keeps being touched for 60 s after the last answer, then stops', async () => {
    const clock = new FixedClock();
    let up = true;
    const health = createHealth({
      ping: () => (up ? Promise.resolve() : Promise.reject(new Error('down'))),
      clock,
      path,
    });
    await health.tick();
    up = false;

    await backdate();
    clock.advance(45 * SECOND);
    await health.tick();
    expect(await touched()).toBe(true);

    await backdate();
    clock.advance(16 * SECOND); // 61 s since the last answer
    await health.tick();
    expect(await touched()).toBe(false);
  });

  it('is touched again as soon as the database answers after an outage', async () => {
    const clock = new FixedClock();
    let up = true;
    const health = createHealth({
      ping: () => (up ? Promise.resolve() : Promise.reject(new Error('down'))),
      clock,
      path,
    });
    await health.tick();
    up = false;
    clock.advance(5 * 60 * SECOND);
    await backdate();
    await health.tick();
    expect(await touched()).toBe(false);

    up = true;
    await health.tick();
    expect(await touched()).toBe(true);
  });
});

describe('the health ticker', () => {
  // Timers are fake here, real file writes would outlast them: the write is a stub.
  const log = { warn: vi.fn() };
  const write = vi.fn(() => Promise.resolve());

  it('ticks at once and then every 15 s until stopped', async () => {
    vi.useFakeTimers();
    const ping = vi.fn(() => Promise.resolve());
    const ticker = startHealth({ ping, clock: new FixedClock(), path, write, log });
    expect(ping).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS * 2);
    expect(ping).toHaveBeenCalledTimes(3);
    ticker.stop();
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS * 4);
    expect(ping).toHaveBeenCalledTimes(3);
  });

  it('does not stack pings on a database that hangs', async () => {
    vi.useFakeTimers();
    const ping = vi.fn(() => new Promise<void>(() => undefined));
    const ticker = startHealth({ ping, clock: new FixedClock(), path, write, log });
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS * 4);
    expect(ping).toHaveBeenCalledTimes(1);
    ticker.stop();
    expect(write).not.toHaveBeenCalled();
  });

  it('says so, once per failure, when the file cannot be written, and goes on ticking', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const ping = vi.fn(() => Promise.resolve());
    const ticker = startHealth({
      ping,
      clock: new FixedClock(),
      path,
      write: () =>
        Promise.reject(Object.assign(new Error('no such directory'), { code: 'ENOENT' })),
      log: { warn },
    });
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS);
    expect(warn).toHaveBeenCalledWith({ code: 'ENOENT' }, 'worker.health_failed');
    expect(ping).toHaveBeenCalledTimes(2);
    ticker.stop();
  });
});
