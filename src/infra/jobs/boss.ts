import { PgBoss, type ConstructorOptions } from 'pg-boss';

import type { Clock } from '@/application/ports';

import type { Logger } from '../log';
import { systemClock } from '../system';

/** Which of the three ways the app opens pg-boss (ADR 0015). */
type BossKind = 'installer' | 'producer' | 'worker';

interface BossOptions {
  readonly url: string;
  /** Shown in pg_stat_activity: autoporada-web, autoporada-worker … */
  readonly applicationName: string;
  /** Runs every connection as this role; integration tests use it to get exactly one role's grants. */
  readonly role?: string;
}

const ROLE_NAME = /^[a-z_][a-z0-9_]*$/;

/**
 * Per-kind settings. Each instance has its own pool; none registers itself, and only the worker
 * supervises and schedules, so a producer in the web never touches anything but `send`.
 */
const KINDS: Record<BossKind, ConstructorOptions> = {
  installer: {
    max: 1,
    migrate: true,
    createSchema: true,
    supervise: false,
    schedule: false,
    registerInstance: false,
    bamIntervalSeconds: 10,
  },
  producer: {
    max: 2,
    migrate: false,
    createSchema: false,
    supervise: false,
    schedule: false,
    registerInstance: false,
  },
  worker: {
    max: 4,
    migrate: false,
    createSchema: false,
    supervise: true,
    schedule: true,
    registerInstance: false,
    reindex: false,
    maintenanceIntervalSeconds: 3600,
  },
};

export function bossOptions(kind: BossKind, options: BossOptions): ConstructorOptions {
  if (options.role !== undefined && !ROLE_NAME.test(options.role)) {
    throw new Error('createBoss: role must be a plain lower-case identifier');
  }
  return {
    connectionString: options.url,
    application_name: options.applicationName,
    // A startup parameter, so the role is set before the first query runs (as openPool does).
    ...(options.role && { options: `-c role=${options.role}` }),
    ...KINDS[kind],
  };
}

const WINDOW_MS = 60_000;

// Identifiers only: whatever fails these patterns (an address inside a name, say) is dropped.
const NAME = /^[A-Za-z][\w.-]{0,63}$/;
const CODE = /^[\w.-]{1,40}$/;
const QUEUE = /^[\w.\-/]{1,100}$/;

function identifier(source: unknown, key: string, pattern: RegExp): string | null {
  if (typeof source !== 'object' || source === null) return null;
  const value: unknown = Reflect.get(source, key);
  return typeof value === 'string' && pattern.test(value) ? value : null;
}

/** The `code` of a driver error (a SQLSTATE, ECONNREFUSED ...), if it looks like one; never its message. */
export function errorCode(error: unknown): string | null {
  return identifier(error, 'code', CODE);
}

/**
 * Whether pg-boss refused to start because its schema is behind the code. Known by the text of
 * the error (never logged, since a message can quote a connection string); the hint is `run migrate`.
 */
export function needsMigration(error: unknown): boolean {
  return error instanceof Error && /requires migrations/.test(error.message);
}

type BossEvent = 'error' | 'warning';

/**
 * pg-boss errors carry SQL text, bound parameters and messages that quote them (recipient
 * addresses among them), and its warnings carry queries. Only these three identifiers leave.
 */
function scrub(event: BossEvent, raw: unknown) {
  const source =
    event === 'warning' && typeof raw === 'object' && raw !== null ? Reflect.get(raw, 'data') : raw;
  return {
    name: identifier(source, event === 'warning' ? 'type' : 'name', NAME) ?? event,
    code: errorCode(raw),
    queue: identifier(raw, 'queue', QUEUE),
  };
}

/** One log line per event name and minute, saying how many it stands for: an outage emits one per poll. */
function eventLogger(log: Logger, clock: Clock) {
  const seen = new Map<string, { at: number; held: number }>();
  return (event: BossEvent, raw: unknown): void => {
    const fields = scrub(event, raw);
    const key = `${event}:${fields.name}`;
    const now = clock.now().getTime();
    const last = seen.get(key);
    if (last && now - last.at < WINDOW_MS && now >= last.at) {
      last.held += 1;
      return;
    }
    seen.set(key, { at: now, held: 0 });
    const line = { ...fields, count: (last?.held ?? 0) + 1 };
    if (event === 'error') log.error(line, 'jobs.boss_error');
    else log.warn(line, 'jobs.boss_warning');
  };
}

/**
 * Builds one pg-boss instance; nothing connects until `start()`. The `error` and `warning`
 * handlers are attached here, before any start: an `error` event nobody listens for crashes the process.
 */
export function createBoss(
  kind: BossKind,
  options: BossOptions & { readonly log: Logger; readonly clock?: Clock },
): PgBoss {
  const boss = new PgBoss(bossOptions(kind, options));
  const report = eventLogger(options.log, options.clock ?? systemClock);
  boss.on('error', (error) => {
    report('error', error);
  });
  boss.on('warning', (warning) => {
    report('warning', warning);
  });
  return boss;
}
