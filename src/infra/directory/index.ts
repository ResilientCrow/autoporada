import type { DirectoryPort } from '@/application/ports';
import type { Config } from '@/infra/config';

import { createDevDirectory, type ReadFile } from './dev';
import { createOffDirectory } from './off';

export { MAX_DEV_PEOPLE } from './limits';

/** The people search the configuration names: `off` in production for now, a JSON file in development. */
export function createDirectory(config: Config['directory'], readFile: ReadFile): DirectoryPort {
  return config.kind === 'dev' ? createDevDirectory(config.path, readFile) : createOffDirectory();
}
