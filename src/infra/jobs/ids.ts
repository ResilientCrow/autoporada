import { createHash } from 'node:crypto';

/** Namespace of every job id this app derives; any constant UUID, never changed. */
const JOB_NAMESPACE = '0e5d3a4c-6b2f-5c1e-9a77-3f0d8b1c2a64';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A name-based UUID, version 5 (RFC 9562 section 5.5): SHA-1 over the namespace bytes and the name. */
export function uuidV5(namespace: string, name: string): string {
  if (!UUID.test(namespace)) throw new Error('uuidV5: the namespace is not a UUID');
  const bytes = createHash('sha1')
    .update(Buffer.from(namespace.replaceAll('-', ''), 'hex'))
    .update(name, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The pg-boss job id for a queue and dedupe key. The queue's primary key is (name, id), so the
 * same key sent twice is one job (ON CONFLICT DO NOTHING) while it is kept, in every state.
 */
export function jobId(queue: string, dedupeKey: string): string {
  return uuidV5(JOB_NAMESPACE, `${queue}\0${dedupeKey}`);
}
