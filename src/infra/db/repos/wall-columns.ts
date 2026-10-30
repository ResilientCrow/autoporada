import {
  parseIsoDate,
  parseWallTime,
  toIsoDate,
  toIsoTime,
  type CalDate,
  type WallTime,
} from '@/domain/time';

/** A `date` column as the domain's day; null stays null. */
export const dateOrNull = (iso: string | null): CalDate | null =>
  iso === null ? null : parseIsoDate(iso);

/** PostgreSQL gives `time` as HH:MM:SS; the app keeps minutes. */
export const timeOrNull = (text: string | null): WallTime | null =>
  text === null ? null : parseWallTime(text.slice(0, 5));

export const isoDate = (date: CalDate | null): string | null =>
  date === null ? null : toIsoDate(date);

export const isoTime = (time: WallTime | null): string | null =>
  time === null ? null : toIsoTime(time);
