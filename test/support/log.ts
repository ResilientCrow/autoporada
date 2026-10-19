import type { Log } from '@/server/log';

export interface LogLine {
  readonly level: 'info' | 'warn' | 'error';
  readonly fields: object;
  readonly message: string;
}

/** A logger that keeps its lines, to check what the pipeline logs and never logs. */
export function recordingLog(): { readonly lines: LogLine[]; readonly log: Log } {
  const lines: LogLine[] = [];
  const at = (level: LogLine['level']) => (fields: object, message: string) => {
    lines.push({ level, fields, message });
  };
  return { lines, log: { info: at('info'), warn: at('warn'), error: at('error') } };
}
