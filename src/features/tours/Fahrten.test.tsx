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
  it('warnt bei Unterschreitung mit Minuten und fruehestem Beginn', () => {
    render(<Fahrtabschnitt sekunden={720} pruefung={PRUEFUNG} zeitzone="Europe/Berlin" />);
    expect(screen.getByText(/Fahrt 12 Min\./)).toHaveTextContent(
      '5 Min. zu knapp — frühester Beginn 10:20 Uhr',
    );
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

  it('nennt eine unbekannte Fahrzeit ungeprueft - nie "passt"', () => {
    render(<Fahrtabschnitt sekunden={null} pruefung={null} zeitzone="Europe/Berlin" />);
    expect(screen.getByText(/nicht geprüft/)).toBeInTheDocument();
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
});
