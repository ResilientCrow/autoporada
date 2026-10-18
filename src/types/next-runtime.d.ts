// Declared so `process.env.NEXT_RUNTIME` uses dot access, the form Next.js
// inlines at build time (bracket access would survive into the Edge bundle).
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_RUNTIME?: 'nodejs' | 'edge';
  }
}
