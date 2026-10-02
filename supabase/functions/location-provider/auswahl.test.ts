import { describe, expect, it } from 'vitest';
import { richteEin, umgebungsart, waehleAdapter } from './auswahl.ts';

/**
 * Die Wahl des Adapters (MAP-003a, ANN-090).
 *
 * Die Prüffrage ist nicht „findet sie den richtigen", sondern „springt sie
 * ein, wenn nichts eingerichtet ist". Sie tut es nicht.
 */

describe('Adapterwahl aus den Secrets', () => {
  it('nimmt die Nachbildung nur, wenn sie ausdruecklich gewaehlt ist', () => {
    const adapter = waehleAdapter({ LOCATION_PROVIDER: 'mock', APP_ENVIRONMENT: 'development' });
    expect(adapter?.id).toBe('mock');
    expect(adapter?.quelle).toBe('nachbildung');
  });

  it.each(['synthetic', ' Released '])(
    'nimmt den Anbieter mit Kennung, Schluessel und Datenfreigabe %j',
    (freigabe) => {
      const adapter = waehleAdapter({
        LOCATION_PROVIDER: ' PTV ',
        PTV_API_KEY: 'k',
        LOCATION_DATA_GATE: freigabe,
        APP_ENVIRONMENT: 'development',
      });
      expect(adapter?.id).toBe('ptv');
      expect(adapter?.quelle).toBe('anbieter');
    },
  );

  // ANN-094, ADR-019 Punkt 25: Der Umschalter steht zu, bis ihn jemand
  // ausdruecklich oeffnet - auch mit gueltigem Schluessel.
  it.each([
    ['ohne Freigabe', undefined],
    ['mit leerer Freigabe', ' '],
    ['mit falsch geschriebener Freigabe', 'synthetisch'],
    ['mit "true"', 'true'],
  ])('antwortet %s mit "nicht eingerichtet", obwohl der Schluessel da ist', (_, freigabe) => {
    expect(
      waehleAdapter({ LOCATION_PROVIDER: 'ptv', PTV_API_KEY: 'k', LOCATION_DATA_GATE: freigabe }),
    ).toBeNull();
  });

  it('braucht fuer die Nachbildung keine Freigabe, weil sie nichts hinausschickt', () => {
    expect(waehleAdapter({ LOCATION_PROVIDER: 'mock', APP_ENVIRONMENT: 'development' })?.id).toBe(
      'mock',
    );
  });

  it.each([
    ['ohne jede Angabe', {}],
    ['mit leerer Angabe', { LOCATION_PROVIDER: '  ' }],
    ['mit unbekanntem Anbieter', { LOCATION_PROVIDER: 'irgendwer' }],
    ['mit Anbieter ohne Schluessel', { LOCATION_PROVIDER: 'ptv', LOCATION_DATA_GATE: 'synthetic' }],
    [
      'mit Anbieter und leerem Schluessel',
      { LOCATION_PROVIDER: 'ptv', PTV_API_KEY: ' ', LOCATION_DATA_GATE: 'synthetic' },
    ],
    ['mit Schluessel, aber ohne Anbieter', { PTV_API_KEY: 'k' }],
  ])('sagt %s "nicht eingerichtet" statt still eine Nachbildung zu liefern', (_, umgebung) => {
    expect(waehleAdapter(umgebung)).toBeNull();
  });
});

/**
 * ADR-019 Fassung 5, Punkte 35 und 36 (ANN-094 Fassung 3): Die Function
 * kennt ihre Umgebung, ohne Angabe ist sie Produktion, und dort gilt nur
 * `released` - ein Schalter fuer Server-Aufrufe und Kacheln.
 */
describe('Schalter in der Produktion', () => {
  it.each([
    [undefined, 'production'],
    ['', 'production'],
    ['prod', 'production'],
    ['Production', 'production'],
    [' development ', 'development'],
    ['TEST', 'test'],
  ])('liest APP_ENVIRONMENT %j als %s - fehlend oder unbekannt heisst Produktion', (wert, art) => {
    expect(umgebungsart(wert)).toBe(art);
  });

  it.each([
    ['ohne APP_ENVIRONMENT', undefined],
    ['mit APP_ENVIRONMENT=production', 'production'],
    ['mit falsch geschriebenem Wert', 'developement'],
  ])('weist synthetic und die Nachbildung %s ab und meldet es', (_, umgebung) => {
    const synthetisch = richteEin({
      LOCATION_PROVIDER: 'ptv',
      PTV_API_KEY: 'k',
      LOCATION_DATA_GATE: 'synthetic',
      APP_ENVIRONMENT: umgebung,
    });
    expect(synthetisch).toEqual({ adapter: null, kartenFreigegeben: false, gateAbgewiesen: true });

    const nachbildung = richteEin({ LOCATION_PROVIDER: 'mock', APP_ENVIRONMENT: umgebung });
    expect(nachbildung.adapter).toBeNull();
    expect(nachbildung.gateAbgewiesen).toBe(true);
  });

  it('laesst in der Produktion nur released durch - fuer Anbieter und Kacheln', () => {
    const frei = richteEin({
      LOCATION_PROVIDER: 'ptv',
      PTV_API_KEY: 'k',
      LOCATION_DATA_GATE: 'released',
    });
    expect(frei.adapter?.id).toBe('ptv');
    expect(frei.kartenFreigegeben).toBe(true);
    expect(frei.gateAbgewiesen).toBe(false);
  });

  it('gibt die Kacheln ausserhalb der Produktion mit synthetic frei, ohne Schalter nicht', () => {
    expect(
      richteEin({ LOCATION_DATA_GATE: 'synthetic', APP_ENVIRONMENT: 'test' }).kartenFreigegeben,
    ).toBe(true);
    expect(
      richteEin({ LOCATION_PROVIDER: 'mock', APP_ENVIRONMENT: 'development' }).kartenFreigegeben,
    ).toBe(false);
  });
});
