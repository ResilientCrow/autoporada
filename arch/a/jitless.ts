// Imported first: the page's CSP has no 'unsafe-eval', so zod must never probe `new Function` (as src/instrumentation-client.ts).
import { config } from 'zod/v4/core';
config({ jitless: true });
