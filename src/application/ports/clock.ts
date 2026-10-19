/** The time. Read once per call, so one use case sees one instant. */
export interface Clock {
  now(): Date;
}
