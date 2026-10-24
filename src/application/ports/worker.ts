import type { AppDeps } from './db';
import type { JobInput, JobName, JobOutcome } from './jobs';
import type { MailPort } from './mail';

/** What a handler may use: the app's dependencies plus the mail transport. */
export interface WorkerDeps extends AppDeps {
  readonly mail: MailPort;
  readonly appOrigin: string;
}

export type JobHandler<N extends JobName> = (
  deps: WorkerDeps,
  job: JobInput<N>,
) => Promise<JobOutcome>;

/** One handler per job name: a job without a handler is a compile error. */
export type JobHandlers = { readonly [N in JobName]: JobHandler<N> };
