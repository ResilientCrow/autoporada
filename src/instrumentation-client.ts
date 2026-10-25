/**
 * Runs in the browser before React hydrates (ADR 0023). Zod probes
 * `new Function('')` when it builds an object schema; the page's policy has no
 * 'unsafe-eval', so the browser reports that caught throw as a violation, and
 * the e2e guard fails on any. Switched off here, every schema the browser
 * builds (a contract that reads a route's answer) skips the probe, whatever
 * module builds it first. The server keeps its fast path.
 */
import { config } from 'zod/v4/core';

config({ jitless: true });
