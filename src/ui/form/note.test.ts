import { describe, expect, it } from 'vitest';

import { noteLength, withPhrase } from './note';

describe('the note', () => {
  it('takes a quick phrase as it is, or after what is written', () => {
    expect(withPhrase('', 'Zkraťte prosím text.')).toBe('Zkraťte prosím text.');
    expect(withPhrase(' \n', 'Zkraťte prosím text.')).toBe('Zkraťte prosím text.');
    expect(withPhrase('Díky. ', 'Zkraťte prosím text.')).toBe('Díky. Zkraťte prosím text.');
  });

  it('counts what the server will count: the trimmed text in UTF-16 units', () => {
    expect(noteLength('  ab  ')).toBe(2);
    expect(noteLength('😀')).toBe(2);
  });
});
