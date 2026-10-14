import { describe, expect, it } from 'vitest';
import { hakenFehlt, hakenZuruecknehmbar, istAbgehakt } from './haken';

describe('Haken als eigenes Merkmal (B4)', () => {
  it('nennt abgeschlossen und abgerechnet abgehakt, bestätigt nicht', () => {
    expect(istAbgehakt('completed', null)).toBe(true);
    expect(istAbgehakt('invoiced', null)).toBe(true);
    expect(istAbgehakt('confirmed', null)).toBe(false);
    expect(istAbgehakt('cancelled', null)).toBe(false);
    expect(istAbgehakt('no_show', null)).toBe(false);
  });

  it('unterscheidet am dokumentierten Termin nach dem Haken', () => {
    expect(istAbgehakt('documented', '2026-10-14T08:00:00Z')).toBe(true);
    expect(istAbgehakt('documented', null)).toBe(false);
    // Ein älterer Stand ohne die Angabe: dokumentiert galt als abgehakt.
    expect(istAbgehakt('documented', undefined)).toBe(true);
  });

  it('lässt den Haken an bestätigten und an dokumentierten Terminen ohne Haken setzen', () => {
    expect(hakenFehlt('confirmed', null)).toBe(true);
    expect(hakenFehlt('documented', null)).toBe(true);
    expect(hakenFehlt('documented', '2026-10-14T08:00:00Z')).toBe(false);
    expect(hakenFehlt('documented', undefined)).toBe(false);
    expect(hakenFehlt('completed', '2026-10-14T08:00:00Z')).toBe(false);
    expect(hakenFehlt('no_show', null)).toBe(false);
    expect(hakenFehlt('cancelled', null)).toBe(false);
  });

  it('nimmt jeden Haken zurück, nur nicht am abgerechneten Termin', () => {
    expect(hakenZuruecknehmbar('completed', '2026-10-14T08:00:00Z')).toBe(true);
    expect(hakenZuruecknehmbar('documented', '2026-10-14T08:00:00Z')).toBe(true);
    expect(hakenZuruecknehmbar('documented', null)).toBe(false);
    expect(hakenZuruecknehmbar('invoiced', null)).toBe(false);
    expect(hakenZuruecknehmbar('confirmed', null)).toBe(false);
  });
});
