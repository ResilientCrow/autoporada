/** Next.js calls register() once when the server process starts. */
export async function register(): Promise<void> {
  // NEXT_RUNTIME is a build-time constant, so the Edge bundle drops the
  // Node-only composition root entirely.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootWeb } = await import('@/server/container');
    bootWeb();
  }
}
