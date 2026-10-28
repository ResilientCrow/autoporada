import { DEFAULT_DEADLINE } from '@/domain/calendar';

/**
 * The deadline rule new issues are made with. M9.7 replaces this constant
 * with a read of the settings; an issue row keeps the deadline it was made
 * with (ADR 0018).
 */
export const DEADLINE_RULE = DEFAULT_DEADLINE;
