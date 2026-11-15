/** The answers the Arch UI's endpoints share (branch arch-ui only). */

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** A refused write says how long to wait, as `runAction` does, so the client can name it. */
export const rateLimited = (retryAfterMs: number): Response =>
  json(
    {
      ok: false,
      error: { code: 'rate-limited', retryAfterSeconds: Math.ceil(retryAfterMs / 1000) },
    },
    429,
  );
