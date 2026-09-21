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

  it('nimmt den Anbieter, wenn Kennung und Schluessel da sind', () => {
    const adapter = waehleAdapter({ LOCATION_PROVIDER: ' PTV ', PTV_API_KEY: 'k' });
    expect(adapter?.id).toBe('ptv');
    expect(adapter?.quelle).toBe('anbieter');
  });

  it.each([
    ['ohne jede Angabe', {}],
    ['mit leerer Angabe', { LOCATION_PROVIDER: '  ' }],
    ['mit unbekanntem Anbieter', { LOCATION_PROVIDER: 'irgendwer' }],
    ['mit Anbieter ohne Schluessel', { LOCATION_PROVIDER: 'ptv' }],
    ['mit Anbieter und leerem Schluessel', { LOCATION_PROVIDER: 'ptv', PTV_API_KEY: ' ' }],
    ['mit Schluessel, aber ohne Anbieter', { PTV_API_KEY: 'k' }],
  ])('sagt %s "nicht eingerichtet" statt still eine Nachbildung zu liefern', (_, umgebung) => {
    expect(waehleAdapter(umgebung)).toBeNull();
  });
});
