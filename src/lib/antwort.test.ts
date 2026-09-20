import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { antwort } from './antwort';

describe('antwort', () => {
  it('reicht einen passenden Wert durch', () => {
    expect(antwort(z.number(), 3, 'Ging nicht.')).toBe(3);
  });

  it('wirft den deutschen Satz statt des ZodError-Texts (R3-023)', () => {
    let meldung = '';
    try {
      antwort(z.number(), 'abc', 'Das Ereignis konnte nicht eingetragen werden.');
    } catch (fehler) {
      meldung = (fehler as Error).message;
    }

    expect(meldung).toBe('Das Ereignis konnte nicht eingetragen werden.');
    // Der ZodError-Text beginnt mit '[' und nennt "expected" und "code".
    expect(meldung.startsWith('[')).toBe(false);
    expect(meldung).not.toMatch(/expected|invalid_type/);
  });
});
