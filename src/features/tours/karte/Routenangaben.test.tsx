import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LocationErrorCode, RouteResult } from '@/lib/location/contract';
import type { Routenergebnis } from '@/lib/location/route';
import { Routenangaben } from './Routenangaben';

/**
 * Die Zustände der Routenanzeige (MAP-003b, Akzeptanzkriterium 3).
 *
 * Geprüft wird, dass jeder Zustand **benannt** auf dem Bildschirm steht und
 * dass aus jedem ein neuer Versuch möglich ist. Eine Seite, die nur „Es hat
 * nicht geklappt" sagt, lässt eine Praxis im Regen stehen: Eine
 * Zeitüberschreitung geht vorbei, ein fehlender Schlüssel nicht.
 */

const ROUTE: RouteResult = {
  distanceMeters: 12_449,
  durationSeconds: 2880,
  legs: [
    { distanceMeters: 3150, durationSeconds: 762 },
    { distanceMeters: 9299, durationSeconds: 2118 },
  ],
  geometry: [
    { lat: 48.52, lon: 9.05 },
    { lat: 48.53, lon: 9.06 },
  ],
};

function gelungen(quelle: 'anbieter' | 'nachbildung' = 'anbieter'): Routenergebnis {
  return { ok: true, value: { route: ROUTE, quelle } };
}

function gescheitert(code: LocationErrorCode): Routenergebnis {
  return { ok: false, error: { code, message: 'ptv: technisch' } };
}

function zeige(eigenschaften: Partial<Parameters<typeof Routenangaben>[0]> = {}) {
  const erneutVersuchen = vi.fn();
  render(
    <Routenangaben
      laedt={false}
      ergebnis={gelungen()}
      lastenrad={undefined}
      erneutVersuchen={erneutVersuchen}
      {...eigenschaften}
    />,
  );
  return { erneutVersuchen };
}

describe('Routenangaben', () => {
  it('sagt, dass gerechnet wird - als Text, nicht nur als Bewegung', () => {
    zeige({ laedt: true, ergebnis: undefined });

    expect(screen.getByRole('status')).toHaveTextContent('Route wird berechnet');
  });

  it.each([
    ['timeout', 'Zeitüberschreitung'],
    ['unavailable', 'Kartendienst nicht erreichbar'],
    ['not_configured', 'Kein Kartendienst eingerichtet'],
    ['unauthorized', 'Kartendienst weist den Serverschlüssel ab'],
    ['rate_limited', 'Kontingent erschöpft'],
    ['not_found', 'Keine Route gefunden'],
    ['invalid_request', 'Anfrage nicht gültig'],
  ] as const)('benennt den Zustand %s eigens', (code, titel) => {
    zeige({ ergebnis: gescheitert(code) });

    // `role="alert"`: Wer nicht auf den Bildschirm sieht, erfaehrt es auch.
    expect(within(screen.getByRole('alert')).getByText(titel)).toBeInTheDocument();
  });

  it('nennt bei fehlender Einrichtung die Secrets und nicht den Anbieter', () => {
    zeige({ ergebnis: gescheitert('not_configured') });

    const meldung = screen.getByRole('alert');
    expect(meldung).toHaveTextContent('LOCATION_PROVIDER');
    expect(meldung).toHaveTextContent('PTV_API_KEY');
    // Kein Schluessel, keine Adresse, keine Anbietermeldung (ADR-011).
    expect(meldung).not.toHaveTextContent('ptv: technisch');
  });

  it('laesst aus jedem Fehler einen neuen Versuch zu', async () => {
    const { erneutVersuchen } = zeige({ ergebnis: gescheitert('timeout') });

    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(erneutVersuchen).toHaveBeenCalledTimes(1);
  });

  it('zeigt Strecke und Fahrzeit gesamt und je Abschnitt', () => {
    zeige();

    expect(screen.getByText(/12,4 km/)).toBeInTheDocument();
    expect(screen.getByText(/48 Min\./)).toBeInTheDocument();

    const abschnitte = screen.getByRole('list', { name: 'Abschnitte der Route' });
    const zeilen = within(abschnitte).getAllByRole('listitem');
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]).toHaveTextContent('1 → 2');
    expect(zeilen[0]).toHaveTextContent('3,2 km · 13 Min.');
    expect(zeilen[1]).toHaveTextContent('2 → 3');
  });

  it('sagt es, wenn die Linie eine Nachbildung ist und keine gefahrene Strecke', () => {
    zeige({ ergebnis: gelungen('nachbildung') });

    expect(screen.getByRole('status')).toHaveTextContent(/Nachbildung ohne Kartendienst/);
    expect(screen.getByRole('status')).toHaveTextContent(/Luftlinie/);
  });

  it('behauptet keine Nachbildung, wenn die Route vom Anbieter kommt', () => {
    zeige();

    expect(screen.queryByText(/Nachbildung/)).not.toBeInTheDocument();
  });

  it('stellt das Lastenradprofil mit dem Unterschied daneben (MAP-003c)', () => {
    zeige({
      lastenrad: {
        ok: true,
        value: {
          route: { ...ROUTE, distanceMeters: 12_949, durationSeconds: 3300 },
          quelle: 'anbieter',
        },
      },
    });

    const vergleich = screen.getByText(/Lastenradprofil/);
    expect(vergleich).toHaveTextContent('12,9 km');
    expect(vergleich).toHaveTextContent('+500 m');
    expect(vergleich).toHaveTextContent('+7 Min.');
  });

  it('nennt zwei gleiche Ergebnisse gleich, statt eine Differenz zu erfinden', () => {
    zeige({ lastenrad: gelungen() });

    expect(screen.getByText(/Lastenradprofil/)).toHaveTextContent('praktisch dieselben Werte');
  });

  it('laesst die Vergleichszeile weg, wenn das zweite Profil nicht antwortet', () => {
    zeige({ lastenrad: gescheitert('rate_limited') });

    expect(screen.queryByText(/Lastenradprofil/)).not.toBeInTheDocument();
    // Und es steht kein zweiter Fehlerkasten neben dem ersten.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
