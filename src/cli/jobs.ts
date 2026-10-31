import type { JobName } from '@/application/ports';

/**
 * `jobs:status` and `jobs:redrive` (ADR 0015): what the operator sees of the job queues, and the
 * way back for a dead job. The parsing and the output are here; main.ts hands in the pg-boss side.
 */
export const JOBS_STATUS_USAGE = 'jobs:status';
export const JOBS_REDRIVE_USAGE = 'jobs:redrive (--id <id>… | --source <queue> [--id <id>…])';

/** A job in the dead-letter queue: identifiers and the outcome code, never a payload or an address. */
export interface DeadJob {
  readonly id: string;
  readonly sourceQueue: string | null;
  readonly template: string | null;
  readonly dedupeKey: string | null;
  readonly createdAt: Date;
  readonly code: string | null;
}

interface QueueCount {
  readonly queue: string;
  /** How many jobs are in each state; a state without jobs is absent. */
  readonly states: Readonly<Record<string, number>>;
}

/** What these commands need of the job queues. */
export interface JobsAdmin {
  /** The name of the dead-letter queue, as the job queue itself has it. */
  readonly deadQueue: string;
  counts(): Promise<readonly QueueCount[]>;
  deadJobs(): Promise<readonly DeadJob[]>;
  /** Moves dead jobs back to their source queue as new jobs; returns how many moved. */
  redrive(selector: {
    readonly ids?: readonly string[];
    readonly source?: string;
  }): Promise<number>;
  /** Queues one job now under a dedupe key; false when that key was queued before (jobs:run). */
  send(job: JobName, data: object, dedupeKey: string): Promise<boolean>;
}

/** Left to right, the life of a job. */
const STATE_ORDER = ['created', 'retry', 'active', 'completed', 'cancelled', 'failed'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function queueLine({ queue, states }: QueueCount): string {
  const known = STATE_ORDER.filter((state) => (states[state] ?? 0) > 0);
  const others = Object.keys(states).filter(
    (s) => !STATE_ORDER.includes(s) && (states[s] ?? 0) > 0,
  );
  const parts = [...known, ...others].map((state) => `${states[state]} ${state}`);
  return `${queue}: ${parts.length > 0 ? parts.join(', ') : 'no jobs'}`;
}

const deadLine = (job: DeadJob): string =>
  [
    '',
    job.id,
    job.sourceQueue ?? '-',
    job.template ?? '-',
    job.dedupeKey ?? '-',
    job.createdAt.toISOString(),
    job.code ?? '-',
  ].join('  ');

export async function jobsStatus(admin: JobsAdmin, args: readonly string[]): Promise<string[]> {
  if (args.length > 0) throw new Error(`Usage: ${JOBS_STATUS_USAGE}`);
  const [counts, dead] = await Promise.all([admin.counts(), admin.deadJobs()]);
  const queues = counts
    .filter(({ queue }) => queue !== admin.deadQueue)
    .toSorted((a, b) => a.queue.localeCompare(b.queue))
    .map(queueLine);
  return [...queues, `${admin.deadQueue}: ${dead.length}`, ...dead.map(deadLine)];
}

type Selector = Parameters<JobsAdmin['redrive']>[0];

/** `--id` takes one or more ids (the flag may repeat), `--source` exactly one queue; one of them is required. */
function parseRedrive(args: readonly string[]): Selector {
  const usage = new Error(`Usage: ${JOBS_REDRIVE_USAGE}`);
  const given: { '--id'?: string[]; '--source'?: string[] } = {};
  let current: string[] | undefined;
  for (const arg of args) {
    if (arg === '--id' || arg === '--source') {
      if (arg === '--source' && given[arg]) throw usage;
      current = given[arg] ??= [];
    } else if (arg.startsWith('--') || !current) {
      throw usage;
    } else {
      current.push(arg);
    }
  }
  const ids = given['--id'];
  const [source, ...extra] = given['--source'] ?? [];
  const missing = ids === undefined ? source === undefined : ids.length === 0;
  if (missing || extra.length > 0 || given['--source']?.length === 0) throw usage;
  if (ids?.some((id) => !UUID.test(id))) throw usage;
  return { ...(ids && { ids }), ...(source !== undefined && { source }) };
}

export async function jobsRedrive(admin: JobsAdmin, args: readonly string[]): Promise<string[]> {
  const selector = parseRedrive(args);
  const moved = await admin.redrive(selector);
  return [`Redrove ${moved} ${moved === 1 ? 'job' : 'jobs'}.`];
}
