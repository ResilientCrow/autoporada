import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { FixedClock } from '../../../test/support/world/clock';
import { createLogger } from '../log';

import { bossOptions, createBoss } from './index';

// Nothing listens here, and nothing in this file starts an instance: building must open no connection.
const URL = 'postgres://owner:secret@127.0.0.1:9/autoporada';
const ADDRESS = 'jana.novakova@skola.example';
const SQL = 'INSERT INTO users (email) VALUES ($1)';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  const clock = new FixedClock();
  const log = createLogger({ service: 'worker', level: 'info', destination });
  const boss = createBoss('producer', { url: URL, applicationName: 'autoporada-test', log, clock });
  const fields = (line: Record<string, unknown> | undefined) => ({
    name: line?.['name'],
    code: line?.['code'],
    queue: line?.['queue'],
    count: line?.['count'],
  });
  return { lines, boss, clock, fields };
}

/** What pg reports for a failed insert: the address and the SQL ride along on the error. */
function databaseError() {
  return Object.assign(new Error(`duplicate key value violates "users_email_key" for ${ADDRESS}`), {
    name: 'error',
    code: '23505',
    detail: `Key (email)=(${ADDRESS}) already exists.`,
    query: SQL,
    parameters: [ADDRESS],
    queue: 'mail.send',
  });
}

describe('createBoss events', () => {
  it('logs an error holding an address and SQL parameters as name, code and queue only', () => {
    const { lines, boss, fields } = capture();
    boss.emit('error', databaseError());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'error', msg: 'jobs.boss_error' });
    expect(fields(lines[0])).toEqual({
      name: 'error',
      code: '23505',
      queue: 'mail.send',
      count: 1,
    });
    const text = JSON.stringify(lines);
    for (const secret of [ADDRESS, 'INSERT', 'users_email_key', 'secret', 'stack']) {
      expect(text).not.toContain(secret);
    }
  });

  it('scrubs the plain-object copy pg-boss makes of a worker error', () => {
    const { lines, boss, fields } = capture();
    // manager.js emits { ...err, message, stack, queue, worker } for fetch and settle failures
    boss.emit('error', {
      ...databaseError(),
      message: `fetch failed for ${ADDRESS}`,
      stack: `Error: ${ADDRESS}\n    at /srv/app/node_modules/pg-boss/dist/manager.js:1146`,
      worker: 'b3c7f0a2',
    } as unknown as Error);
    expect(fields(lines[0])).toEqual({
      name: 'error',
      code: '23505',
      queue: 'mail.send',
      count: 1,
    });
    expect(JSON.stringify(lines)).not.toContain(ADDRESS);
    expect(JSON.stringify(lines)).not.toContain('b3c7f0a2');
  });

  it('logs a warning as its type, at warn level', () => {
    const { lines, boss, fields } = capture();
    boss.emit('warning', {
      message: `Slow query for ${ADDRESS}`,
      data: { type: 'slow_query', query: SQL, parameters: [ADDRESS], queue: 'mail.send' },
    });
    expect(lines[0]).toMatchObject({ level: 'warn', msg: 'jobs.boss_warning' });
    expect(fields(lines[0])).toEqual({ name: 'slow_query', code: null, queue: null, count: 1 });
    expect(JSON.stringify(lines)).not.toContain(ADDRESS);
  });

  it('falls back to the event name and null when a field does not look like an identifier', () => {
    const { lines, boss, fields } = capture();
    boss.emit('error', { name: ADDRESS, code: ADDRESS, queue: ADDRESS } as unknown as Error);
    boss.emit('error', 'a string, not an object' as unknown as Error);
    boss.emit('warning', { message: ADDRESS, data: { type: ADDRESS } });
    expect(lines.map(fields)).toEqual([
      { name: 'error', code: null, queue: null, count: 1 },
      { name: 'warning', code: null, queue: null, count: 1 },
    ]);
    expect(JSON.stringify(lines)).not.toContain(ADDRESS);
  });

  it('writes one line per name per 60 seconds, then reports how many it held back', () => {
    const { lines, boss, clock, fields } = capture();
    boss.emit('error', databaseError());
    clock.advance(1_000);
    boss.emit('error', databaseError());
    clock.advance(58_999);
    boss.emit('error', databaseError());
    expect(lines).toHaveLength(1);

    clock.advance(1);
    boss.emit('error', databaseError());
    expect(lines).toHaveLength(2);
    expect(fields(lines[1])).toMatchObject({ count: 3 });

    clock.advance(60_000);
    boss.emit('error', databaseError());
    expect(fields(lines[2])).toMatchObject({ count: 1 });
  });

  it('counts each name on its own', () => {
    const { lines, boss, fields } = capture();
    boss.emit('warning', { message: 'a', data: { type: 'slow_query' } });
    boss.emit('warning', { message: 'b', data: { type: 'queue_backlog' } });
    boss.emit('warning', { message: 'c', data: { type: 'slow_query' } });
    boss.emit('error', databaseError());
    expect(lines.map((line) => fields(line).name)).toEqual([
      'slow_query',
      'queue_backlog',
      'error',
    ]);
  });

  it('keeps counting when the clock steps backwards', () => {
    const { lines, boss, clock } = capture();
    boss.emit('error', databaseError());
    clock.advance(-5_000);
    boss.emit('error', databaseError());
    expect(lines).toHaveLength(2);
  });

  it('listens for error and warning before anything starts', () => {
    const { boss } = capture();
    expect(boss.listenerCount('error')).toBe(1);
    expect(boss.listenerCount('warning')).toBe(1);
    // an `error` event nobody listens for throws and takes the process down
    expect(() => boss.emit('error', new Error('boom'))).not.toThrow();
  });
});

describe('bossOptions', () => {
  const base = { url: URL, applicationName: 'autoporada-test' };

  it('gives the installer the schema, one connection and no background work', () => {
    expect(bossOptions('installer', base)).toEqual({
      connectionString: URL,
      application_name: 'autoporada-test',
      max: 1,
      migrate: true,
      createSchema: true,
      supervise: false,
      schedule: false,
      registerInstance: false,
      bamIntervalSeconds: 10,
    });
  });

  it('gives the producer a small pool and nothing that writes outside send', () => {
    expect(bossOptions('producer', base)).toEqual({
      connectionString: URL,
      application_name: 'autoporada-test',
      max: 2,
      migrate: false,
      createSchema: false,
      supervise: false,
      schedule: false,
      registerInstance: false,
    });
  });

  it('gives the worker the clock and the sweep, hourly, without index rebuilds', () => {
    expect(bossOptions('worker', base)).toEqual({
      connectionString: URL,
      application_name: 'autoporada-test',
      max: 4,
      migrate: false,
      createSchema: false,
      supervise: true,
      schedule: true,
      registerInstance: false,
      reindex: false,
      maintenanceIntervalSeconds: 3600,
    });
  });

  it('runs every connection as the role when one is given, as the app pool does', () => {
    expect(bossOptions('producer', { ...base, role: 'autoporada_app' })).toMatchObject({
      options: '-c role=autoporada_app',
    });
    expect(bossOptions('producer', base)).not.toHaveProperty('options');
  });

  it('refuses a role that is not a plain identifier', () => {
    expect(() => bossOptions('producer', { ...base, role: 'x --evil' })).toThrow(/role/);
  });
});
