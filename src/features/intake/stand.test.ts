import { describe, expect, it } from 'vitest';
import { erstaufnahmeLohnt, erstaufnahmePfad, erstaufnahmestand } from './stand';

describe('Stand der geführten Erstaufnahme (K10, ANN-542)', () => {
  it('liest Verordnung und Anmeldebogen aus der Checkliste, Anamnese und Liege aus der Akte', () => {
    expect(
      erstaufnahmestand({
        checkliste: [
          { item: 'prescription_photo', state: 'not_needed' },
          { item: 'registration_form', state: 'done' },
        ],
        erhebungen: [{ instrument_id: 'anamnese_v8', status: 'abgeschlossen' }],
        liege: false,
      }),
    ).toEqual({
      verordnung: 'entfaellt',
      anmeldebogen: 'erledigt',
      anamnese: 'erledigt',
      liege: 'erledigt',
      offen: 0,
    });
  });

  it('zählt einen Entwurf, eine fehlende Zeile und eine unentschiedene Liege als offen', () => {
    const stand = erstaufnahmestand({
      checkliste: [{ item: 'prescription_photo', state: 'open' }],
      erhebungen: [{ instrument_id: 'anamnese_v8', status: 'entwurf' }],
      liege: null,
    });
    expect(stand).toMatchObject({
      verordnung: 'offen',
      anmeldebogen: 'offen',
      anamnese: 'offen',
      liege: 'offen',
      offen: 4,
    });
  });

  it('lässt den Anamnesebogen aus Stand und Zahl, wenn die Rolle ihn nicht liest', () => {
    const stand = erstaufnahmestand({ checkliste: [], erhebungen: null, liege: null });
    expect(stand.anamnese).toBeNull();
    expect(stand.offen).toBe(3);
  });

  it('lohnt den Einstieg nur für die Checkliste und die Liege, nie für den Anamnesebogen allein', () => {
    expect(erstaufnahmeLohnt(['registration_form'], true)).toBe(true);
    expect(erstaufnahmeLohnt([], null)).toBe(true);
    expect(erstaufnahmeLohnt([], false)).toBe(false);
    expect(erstaufnahmeLohnt([], undefined)).toBe(false);
  });

  it('nimmt den Termin in den Pfad, wenn es einen gibt', () => {
    expect(erstaufnahmePfad('p1')).toBe('/patienten/p1/erstaufnahme');
    expect(erstaufnahmePfad('p1', 't 1')).toBe('/patienten/p1/erstaufnahme?termin=t%201');
  });
});
