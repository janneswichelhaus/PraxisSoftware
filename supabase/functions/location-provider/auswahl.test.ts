import { describe, expect, it } from 'vitest';
import { waehleAdapter } from './auswahl.ts';

/**
 * Die Wahl des Adapters (MAP-003a, ANN-090).
 *
 * Die Prüffrage ist nicht „findet sie den richtigen", sondern „springt sie
 * ein, wenn nichts eingerichtet ist". Sie tut es nicht.
 */

describe('Adapterwahl aus den Secrets', () => {
  it('nimmt die Nachbildung nur, wenn sie ausdruecklich gewaehlt ist', () => {
    const adapter = waehleAdapter({ LOCATION_PROVIDER: 'mock' });
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
    expect(waehleAdapter({ LOCATION_PROVIDER: 'mock' })?.id).toBe('mock');
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
