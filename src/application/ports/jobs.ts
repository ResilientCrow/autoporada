/**
 * Background jobs and their payloads. Payloads carry ids only: the queue
 * keeps its rows, and minors' data must not linger there.
 */
export interface JobCatalog {
  'mail.send': {
    readonly template: string;
    readonly recipientId: string;
    readonly subjectId: string;
  };
  'pdf.render': { readonly documentId: string };
}

export type JobName = keyof JobCatalog;

export interface EnqueueOptions {
  /** At most one queued job per key. */
  readonly dedupeKey?: string;
  readonly startAfter?: Date;
}

/** Enqueues inside the caller's transaction: a job exists only if the change commits (ADR 0006). */
export interface JobPort {
  enqueue<N extends JobName>(name: N, data: JobCatalog[N], options?: EnqueueOptions): Promise<void>;
}
