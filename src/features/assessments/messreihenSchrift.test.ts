import { describe, expect, it } from 'vitest';
import { schriftInEinheiten } from './messreihenSchrift';

/**
 * Die Schrift der Messreihe fällt am Schirm nie unter 12 px (Runde 2,
 * BEF-068 Option 2; Handoff Schrift und Knöpfe, Abschnitt 3). Das Bild ist
 * 320 Einheiten breit; die Schrift rechnet aus der gerenderten Breite.
 */
describe('Schrift der Messreihe', () => {
  it('bleibt ohne Messung und ab rund 295 px bei 13 Einheiten', () => {
    expect(schriftInEinheiten(null)).toBe(13);
    expect(schriftInEinheiten(320)).toBe(13);
    expect(schriftInEinheiten(512)).toBe(13);
  });

  it('waechst am schmalen Bild so, dass 12 px am Schirm entstehen', () => {
    // 245 px am Telefon: 12 px brauchen 15,7 Einheiten.
    const einheiten = schriftInEinheiten(245);
    expect(einheiten).toBeCloseTo(15.7, 1);
    expect((einheiten * 245) / 320).toBeGreaterThanOrEqual(12);
  });

  it('begrenzt die Schrift nach oben, damit nichts angeschnitten wird', () => {
    expect(schriftInEinheiten(120)).toBe(18);
  });
});
