import type { JobPort } from '@/application/ports';

/** pg-boss arrives with the worker (M7.1); until then nothing may enqueue. */
export const unwiredJobs: JobPort = {
  enqueue: () => Promise.reject(new Error('JobPort is wired in M7.1')),
};
