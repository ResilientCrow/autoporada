/**
 * Resolves raw settings from the environment. Each known variable NAME may
 * instead be provided as NAME_FILE pointing to a file (Docker secrets in
 * /run/secrets). Variables the app does not know are ignored.
 */
export type Env = Readonly<Record<string, string | undefined>>;
export type ReadFile = (path: string) => string;

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

export function readEnv(
  env: Env,
  readFile: ReadFile,
  keys: readonly string[],
): Record<string, string> {
  const values: Record<string, string> = {};
  const problems: string[] = [];

  for (const name of keys) {
    const direct = env[name] || undefined;
    const filePath = env[`${name}_FILE`] || undefined;
    if (direct !== undefined && filePath !== undefined) {
      problems.push(`${name} and ${name}_FILE are both set; use only one`);
    } else if (filePath !== undefined) {
      try {
        values[name] = readFile(filePath).replace(/\r?\n$/, '');
      } catch {
        problems.push(`${name}_FILE: cannot read the file it points to`);
      }
    } else if (direct !== undefined) {
      values[name] = direct;
    }
  }

  if (problems.length > 0) throw new ConfigError(problems);
  return values;
}
