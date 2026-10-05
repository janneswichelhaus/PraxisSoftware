import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Fahrtabschnitt, Routenzusammenfassung } from './Fahrten';

/** MAP-006c: Anzeige von Fahrzeit und Fahrpuffer — gerechnet wird nichts hier. */

const PRUEFUNG = {
  from_appointment_id: 'a',
  to_appointment_id: 'b',
  travel_seconds: 720,
  earliest_start: '2026-09-10T08:20:00Z',
  shortfall_minutes: 5,
};

describe('Fahrtabschnitt', () => {
  it('nennt neben der Fahrzeit die Strecke des Abschnitts (UBK-008)', () => {
    render(
      <Fahrtabschnitt
        sekunden={1320}
        meter={7120}
        pruefung={{ ...PRUEFUNG, shortfall_minutes: 0 }}
        zeitzone="Europe/Berlin"
      />,
    );
    expect(screen.getByText(/Fahrt 22 Min\. · 7,1 km · passt/)).toBeInTheDocument();
  });

  it('laesst die Strecke weg, wenn sie fehlt oder null ist', () => {
    render(<Fahrtabschnitt sekunden={600} meter={0} pruefung={null} zeitzone="Europe/Berlin" />);
    expect(screen.getByText('Fahrt 10 Min.')).toBeInTheDocument();
  });

  it('warnt bei Unterschreitung mit Minuten und fruehestem Beginn', () => {
    render(<Fahrtabschnitt sekunden={720} pruefung={PRUEFUNG} zeitzone="Europe/Berlin" />);
    const zeile = screen.getByText(/Fahrt 12 Min\./);
    expect(zeile).toHaveTextContent('5 Min. zu knapp – frühester Beginn 10:20 Uhr');
    // Das Warnzeichen des Systems, nicht ein Sonderzeichen der Geräteschrift
    // (TER-23) - und für Vorlesesoftware ausgeblendet.
    expect(zeile.querySelector('[aria-hidden="true"]')).toHaveTextContent('!');
    expect(zeile).not.toHaveTextContent('⚠');
  });

  it('sagt "passt", wenn der Puffer reicht', () => {
    render(
      <Fahrtabschnitt
        sekunden={600}
        pruefung={{ ...PRUEFUNG, shortfall_minutes: 0 }}
        zeitzone="Europe/Berlin"
      />,
    );
    expect(screen.getByText(/passt/)).toBeInTheDocument();
  });

  it('nennt, wie viel Luft bleibt, statt zwei Uhrzeiten zum Rechnen (TER-23)', () => {
    render(
      <Fahrtabschnitt
        sekunden={600}
        pruefung={{ ...PRUEFUNG, shortfall_minutes: 0 }}
        zeitzone="Europe/Berlin"
        // Frühester Beginn 10:20 Uhr, der nächste Stopp beginnt 10:35 Uhr.
        naechsterBeginn="2026-09-10T08:35:00Z"
      />,
    );
    expect(screen.getByText(/passt/)).toHaveTextContent('Fahrt 10 Min. · passt · 15 Min. Luft');
  });

  it('bleibt ohne Beginn des naechsten Stopps beim fruehesten Beginn', () => {
    render(
      <Fahrtabschnitt
        sekunden={600}
        pruefung={{ ...PRUEFUNG, shortfall_minutes: 0 }}
        zeitzone="Europe/Berlin"
      />,
    );
    expect(screen.getByText(/passt/)).toHaveTextContent('passt (frühester Beginn 10:20 Uhr)');
  });

  it('nennt eine unbekannte Fahrzeit ungeprueft - nie "passt"', () => {
    render(<Fahrtabschnitt sekunden={null} pruefung={null} zeitzone="Europe/Berlin" />);
    const zeile = screen.getByText(/nicht geprüft/);
    expect(zeile).toHaveTextContent('Fahrzeit nicht verfügbar – nicht geprüft');
    // Auf Papier sagt die Zeile nichts, was hilft (TER-12).
    expect(zeile).toHaveClass('print:hidden');
    expect(screen.queryByText(/passt/)).toBeNull();
  });
});

describe('Routenzusammenfassung', () => {
  const ROUTE = { distanceMeters: 3150, durationSeconds: 762, legs: [], geometry: [] };

  it('kennzeichnet die Nachbildung', () => {
    render(
      <Routenzusammenfassung
        laedt={false}
        ergebnis={{ ok: true, value: { route: ROUTE, quelle: 'nachbildung' } }}
        erneutVersuchen={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Nachbildung ohne Kartendienst/);
    expect(screen.getByText('3,2 km')).toBeInTheDocument();
  });

  it('sagt bei einem Fehler, dass der Fahrpuffer nicht geprueft ist', () => {
    render(
      <Routenzusammenfassung
        laedt={false}
        ergebnis={{ ok: false, error: { code: 'not_configured', message: 'x' } }}
        erneutVersuchen={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Fahrpuffer nicht geprüft/);
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });

  it('sagt ohne Einrichtung, was trotzdem geht - ohne Secrets (TER-07, ANN-090)', () => {
    render(
      <Routenzusammenfassung
        laedt={false}
        ergebnis={{ ok: false, error: { code: 'not_configured', message: 'x' } }}
        erneutVersuchen={() => {}}
      />,
    );
    const meldung = screen.getByRole('status');
    expect(meldung).toHaveTextContent(
      'Fahrzeiten sind hier noch nicht eingerichtet. Liste und Navigation funktionieren trotzdem.',
    );
    expect(meldung).not.toHaveTextContent(/Secret|LOCATION_|PTV_API_KEY|Repository/);
  });
});
