import { describe, expect, it } from 'vitest';
import { TESTSTOPPS, TUEBINGEN_RAHMEN } from './teststopps';

describe('TESTSTOPPS', () => {
  it('sind sechs bis acht durchgehend nummerierte Stopps', () => {
    expect(TESTSTOPPS.length).toBeGreaterThanOrEqual(6);
    expect(TESTSTOPPS.length).toBeLessThanOrEqual(8);
    expect(TESTSTOPPS.map((stopp) => stopp.label)).toEqual(
      TESTSTOPPS.map((_, index) => String(index + 1)),
    );
  });

  it('liegen alle im Stadtgebiet von Tuebingen', () => {
    for (const { position, label } of TESTSTOPPS) {
      expect(position.lat, `Stopp ${label}`).toBeGreaterThan(TUEBINGEN_RAHMEN.sued);
      expect(position.lat, `Stopp ${label}`).toBeLessThan(TUEBINGEN_RAHMEN.nord);
      expect(position.lon, `Stopp ${label}`).toBeGreaterThan(TUEBINGEN_RAHMEN.west);
      expect(position.lon, `Stopp ${label}`).toBeLessThan(TUEBINGEN_RAHMEN.ost);
    }
  });

  it('tragen nichts ausser Koordinate und Nummer', () => {
    // Kein Name, keine Kennung, keine Uhrzeit - auch nicht "nur fuer die
    // Vorschau". Was hier stuende, stuende auf dem Weg zum Kartendienst
    // (ADR-019 Punkt 12).
    for (const stopp of TESTSTOPPS) {
      expect(Object.keys(stopp).sort()).toEqual(['label', 'position']);
      expect(Object.keys(stopp.position).sort()).toEqual(['lat', 'lon']);
    }
  });

  it('liegen an verschiedenen Stellen der Stadt', () => {
    // Acht Punkte uebereinander zeigten weder Fit-Bounds noch spaeter eine
    // Route (MAP-003).
    const eindeutig = new Set(TESTSTOPPS.map(({ position }) => `${position.lat}/${position.lon}`));
    expect(eindeutig.size).toBe(TESTSTOPPS.length);
  });
});
