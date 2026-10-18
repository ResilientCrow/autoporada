/**
 * Resolves raw settings from the environment. Any variable NAME may instead be
 * provided as NAME_FILE pointing to a file (Docker secrets in /run/secrets).
 */
export type Env = Readonly<Record<string, string | undefined>>;
export type ReadFile = (path: string) => string;

const FILE_SUFFIX = '_FILE';

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

export function readEnv(env: Env, readFile: ReadFile): Record<string, string> {
  const values: Record<string, string> = {};
  const problems: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === '') continue;
    if (key.endsWith(FILE_SUFFIX)) {
      const name = key.slice(0, -FILE_SUFFIX.length);
      if (env[name]) {
        problems.push(`${name} and ${key} are both set; use only one`);
        continue;
      }
      try {
        values[name] = readFile(value).replace(/\r?\n$/, '');
      } catch {
        problems.push(`${key}: cannot read the file it points to`);
      }
    } else if (values[key] === undefined) {
      values[key] = value;
    }
  }

  if (problems.length > 0) throw new ConfigError(problems);
  return values;
}
