/**
 * How far Entra's clock and ours may disagree. One constant for every check
 * that compares a time Entra wrote with our clock (auth_time, step-up).
 */
export const CLOCK_SKEW_MS = 60_000;
