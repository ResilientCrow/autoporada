// Bundles the two Node programs into single files (ADR 0008, 0015): the maintenance CLI for the
// tools image and the worker for its own image. Options: node-build-options.mjs.
import { build } from 'esbuild';

import { ENTRIES, nodeBuildOptions } from './node-build-options.mjs';

await Promise.all(Object.keys(ENTRIES).map((name) => build(nodeBuildOptions(name))));
