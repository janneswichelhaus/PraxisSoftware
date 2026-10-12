import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OFFLINE_FRIST_TAGE,
  ablageLeeren,
  dauerfachAendern,
  dauerfachLesen,
  fachAendern,
  fachLesen,
  speicherImSpeicher,
  speicherSetzen,
} from './geraeteablage';

/**
 * Die Grenzen der Ablage auf dem Gerät, die für jedes Fach gelten
 * (ADR-024 Punkt 5, ANN-358): ein Konto, sieben Tage, Abmelden leert.
 */

const ANNA = 'konto-anna';
const BEN = 'konto-ben';

beforeEach(() => {
  speicherSetzen(speicherImSpeicher());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Ablage auf dem Gerät (TRK-008)', () => {
  it('liest, was das eigene Konto abgelegt hat', async () => {
    await fachAendern(ANNA, 'fach', () => ({ wert: 1 }), true);
    expect(await fachLesen(ANNA, 'fach')).toEqual({ wert: 1 });
  });

  it('ein anderes Konto findet nichts, und die Ablage ist danach leer (Kontowechsel)', async () => {
    await fachAendern(ANNA, 'fach', () => ({ wert: 1 }), true);
    expect(await fachLesen(BEN, 'fach')).toBeUndefined();
    expect(await fachLesen(ANNA, 'fach')).toBeUndefined();
  });

  it(`fällt ${OFFLINE_FRIST_TAGE} Tage nach dem letzten Laden mit Verbindung`, async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T08:00:00Z') });
    await fachAendern(ANNA, 'fach', () => ({ wert: 1 }), true);
    // Ohne Netz Geschriebenes verlängert die Frist nicht.
    vi.setSystemTime(new Date('2026-10-18T08:00:00Z'));
    await fachAendern(ANNA, 'zweites', () => ({ wert: 2 }));
    vi.setSystemTime(new Date('2026-10-19T07:59:00Z'));
    expect(await fachLesen(ANNA, 'fach')).toEqual({ wert: 1 });
    vi.setSystemTime(new Date('2026-10-19T08:01:00Z'));
    expect(await fachLesen(ANNA, 'fach')).toBeUndefined();
    expect(await fachLesen(ANNA, 'zweites')).toBeUndefined();
  });

  it('ein neues Laden mit Verbindung beginnt die Frist neu', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T08:00:00Z') });
    await fachAendern(ANNA, 'fach', () => ({ wert: 1 }), true);
    vi.setSystemTime(new Date('2026-10-18T08:00:00Z'));
    await fachAendern(ANNA, 'fach', () => ({ wert: 2 }), true);
    vi.setSystemTime(new Date('2026-10-24T08:00:00Z'));
    expect(await fachLesen(ANNA, 'fach')).toEqual({ wert: 2 });
  });

  it('Abmelden leert alles', async () => {
    await fachAendern(ANNA, 'fach', () => ({ wert: 1 }), true);
    await ablageLeeren();
    expect(await fachLesen(ANNA, 'fach')).toBeUndefined();
  });

  it('ein Fach fällt, wenn es leer wird', async () => {
    await fachAendern(ANNA, 'fach', () => ({ wert: 1 }), true);
    await fachAendern(ANNA, 'fach', () => undefined);
    expect(await fachLesen(ANNA, 'fach')).toBeUndefined();
  });

  it('gleichzeitige Änderungen überholen sich nicht', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () =>
        fachAendern(ANNA, 'zaehler', (alt) => ((alt as number | undefined) ?? 0) + 1),
      ),
    );
    expect(await fachLesen(ANNA, 'zaehler')).toBe(20);
  });
});

describe('Dauerablage je Konto (OFF-001, ANN-360)', () => {
  it('fällt weder beim Abmelden noch nach der Frist noch beim Kontowechsel', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T08:00:00Z') });
    await dauerfachAendern(ANNA, 'entwuerfe', () => ['text']);
    await fachAendern(BEN, 'fach', () => ({ wert: 1 }), true);
    await ablageLeeren();
    vi.setSystemTime(new Date('2026-11-30T08:00:00Z'));
    expect(await dauerfachLesen(ANNA, 'entwuerfe')).toEqual(['text']);
  });

  it('ein anderes Konto liest sie nie', async () => {
    await dauerfachAendern(ANNA, 'entwuerfe', () => ['text']);
    expect(await dauerfachLesen(BEN, 'entwuerfe')).toBeUndefined();
    expect(await dauerfachLesen(ANNA, 'entwuerfe')).toEqual(['text']);
  });

  it('ein Fach fällt nur, wenn sein Modul es sagt', async () => {
    await dauerfachAendern(ANNA, 'a', () => 1);
    await dauerfachAendern(ANNA, 'b', () => 2);
    await dauerfachAendern(ANNA, 'a', () => undefined);
    expect(await dauerfachLesen(ANNA, 'a')).toBeUndefined();
    expect(await dauerfachLesen(ANNA, 'b')).toBe(2);
  });
});
