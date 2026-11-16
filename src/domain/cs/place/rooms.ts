/** Rooms typed by their code alone (ADR 0069): „S206“ is „v učebně S206“. */

/** „S206“, „205A“, or „S 205“, whose one-letter prefix would otherwise read as the preposition „s“. */
const CODE = '(?:[A-Z]{1,2} ?)?\\d{1,4}[A-Z]?';
const ROOM_CODE = new RegExp(`^${CODE}$`, 'u');
/** Several rooms: „S201 a S202“, „S201, S202“, „S201–S203“. */
const ROOM_CODES = new RegExp(`^${CODE}(?:(?:, (?:a |i )?| (?:a|i) | ?[–-] ?)${CODE})+$`, 'u');
/** One of several rooms: „S201 nebo S202“, „S201, S202 nebo S203“. */
const ROOM_CHOICE = new RegExp(
  `^(?=.* (?:nebo|či) )${CODE}(?:(?:,? (?:nebo|či) |, )${CODE})+$`,
  'u',
);

/** „v učebně S206“, „v učebnách S201 a S202“, or null when the text is no room code. */
export function roomPhrase(text: string): string | null {
  if (ROOM_CODE.test(text) || ROOM_CHOICE.test(text)) {
    return `v učebně ${text}`;
  }
  return ROOM_CODES.test(text) ? `v učebnách ${text}` : null;
}
