import type { DirectoryPort } from '@/application/ports';
import type { Config } from '@/infra/config';
import type { AppTokenSource } from '@/infra/oidc';

import { createDevDirectory, type ReadFile } from './dev';
import { createGraphDirectory } from './graph';
import { createOffDirectory } from './off';

export { MAX_DEV_PEOPLE } from './limits';

/** What the search adapters need from their host. */
export interface DirectoryDeps {
  readonly readFile: ReadFile;
  /** Where Graph is, ending in the API version (`graphBaseUrl` of the configuration). */
  readonly graphBaseUrl: string;
  /** A thunk, so `off` and `dev` build no token source. */
  readonly graphTokens: () => AppTokenSource;
}

/** The people search the configuration names: `off` (the default), a JSON file in development, or Graph. */
export function createDirectory(config: Config['directory'], deps: DirectoryDeps): DirectoryPort {
  switch (config.kind) {
    case 'dev':
      return createDevDirectory(config.path, deps.readFile);
    case 'graph':
      return createGraphDirectory({ baseUrl: deps.graphBaseUrl, tokens: deps.graphTokens() });
    case 'off':
      return createOffDirectory();
  }
}
