import { formatLongDate } from '@/domain/cs';
import { instantToWallClock } from '@/domain/time';

/** The Prague calendar day of an instant, as „12. října 2026“. */
export const day = (iso: string): string => formatLongDate(instantToWallClock(new Date(iso)).date);
