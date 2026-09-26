import { describe, expect, it } from 'vitest';
import { abgewiesen } from './abgewiesen';

describe('abgewiesen (G6c, ANN-115)', () => {
  it('erkennt HTTP 403 auch ohne Fehlerobjekt', () => {
    // So liest supabase-js eine abgewiesene Skalar-Funktion: Körper `null`.
    expect(abgewiesen({ error: null, status: 403 })).toBe(true);
  });

  it('erkennt einen gemeldeten Fehler', () => {
    expect(abgewiesen({ error: { message: 'x' }, status: 400 })).toBe(true);
  });

  it('laesst einen Erfolg durch', () => {
    expect(abgewiesen({ error: null, status: 200 })).toBe(false);
    expect(abgewiesen({ error: null, status: 204 })).toBe(false);
  });
});
