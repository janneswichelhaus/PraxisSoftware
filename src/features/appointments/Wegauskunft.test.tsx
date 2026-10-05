import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Wegauskunft } from './Wegauskunft';
import type { Seite } from './wegpruefung';

/** UBK-012: Was „Passt es?“ sagt (ANN-238). Nur Auskunft. */

const ZONE = 'Europe/Berlin';

function geprueft(over: Partial<Extract<Seite, { stand: 'geprueft' }>>): Seite {
  return {
    stand: 'geprueft',
    luft: 12,
    stufe: 'passt',
    fruehester: '2027-05-12T07:45:00Z',
    fahrtMinuten: 18,
    nachbar: 'termin',
    nachbarZeit: '2027-05-12T07:30:00Z',
    ...over,
  };
}

describe('Wegauskunft', () => {
  it('sagt „passt · X Min. Luft“ mit Fahrzeit, ohne Namen', () => {
    render(
      <Wegauskunft
        zeitzone={ZONE}
        pruefung={{
          stand: 'bereit',
          an: geprueft({}),
          weiter: geprueft({
            luft: 3,
            stufe: 'knapp',
            fahrtMinuten: 0,
            nachbarZeit: '2027-05-12T10:00:00Z',
          }),
        }}
      />,
    );
    expect(screen.getByText('Passt es?')).toBeInTheDocument();
    expect(screen.getByText('Anfahrt: passt · 12 Min. Luft')).toBeInTheDocument();
    expect(screen.getByText(/≈ 18 Min\. vom Termin davor \(bis 09:30 Uhr\)/)).toBeInTheDocument();
    expect(screen.getByText('Weiterfahrt: passt · 3 Min. Luft')).toHaveClass('text-warnung');
    expect(screen.getByText(/gleicher Ort/)).toBeInTheDocument();
    expect(screen.queryByText(/trotzdem anlegen/)).toBeNull();
  });

  it('sagt „zu knapp um X Min.“ mit fruehestem Beginn - und dass es nur Auskunft ist', () => {
    render(
      <Wegauskunft
        zeitzone={ZONE}
        pruefung={{
          stand: 'bereit',
          an: geprueft({ luft: -5, stufe: 'nicht', fruehester: '2027-05-12T08:20:00Z' }),
          weiter: geprueft({
            luft: -3,
            stufe: 'nicht',
            nachbar: 'tagesrand',
            fruehester: '2027-05-12T14:05:00Z',
            nachbarZeit: '2027-05-12T14:00:00Z',
          }),
        }}
      />,
    );
    expect(
      screen.getByText('Anfahrt: zu knapp um 5 Min., frühester Beginn 10:20 Uhr'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Rückfahrt: zu knapp um 3 Min., Ankunft frühestens 16:05 Uhr'),
    ).toBeInTheDocument();
    expect(screen.getByText(/zum Startort bis Arbeitsende 16:00 Uhr/)).toBeInTheDocument();
    expect(
      screen.getByText('Nur Auskunft – der Termin lässt sich trotzdem anlegen.'),
    ).toBeInTheDocument();
  });

  it.each([
    [
      { stand: 'nicht_verortet' } as const,
      'Die Adresse ist nicht verortet – Fahrzeit nicht geprüft.',
    ],
    [
      { stand: 'veraltet' } as const,
      'Die Anschrift am Termin ist veraltet – Fahrzeit nicht geprüft.',
    ],
    [{ stand: 'fehler' } as const, 'Der Fahrweg ließ sich gerade nicht prüfen.'],
  ])('sagt statt einer Zeit, warum es keine gibt (%o)', (pruefung, text) => {
    render(<Wegauskunft zeitzone={ZONE} pruefung={pruefung} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('nennt einen nicht verorteten Nachbarn und eine fehlende Fahrzeit', () => {
    render(
      <Wegauskunft
        zeitzone={ZONE}
        pruefung={{
          stand: 'bereit',
          an: { stand: 'nachbar_nicht_verortet' },
          weiter: { stand: 'nicht_geprueft' },
        }}
      />,
    );
    expect(
      screen.getByText('Anfahrt: Der Termin davor ist nicht verortet – nicht geprüft.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Weiterfahrt: Fahrzeit nicht verfügbar – nicht geprüft.'),
    ).toBeInTheDocument();
  });

  it('bleibt beim Videotermin stumm', () => {
    const { container } = render(<Wegauskunft zeitzone={ZONE} pruefung={{ stand: 'aus' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt in der Ziehvorschau nur die Zeilen', () => {
    render(
      <Wegauskunft
        zeitzone={ZONE}
        variante="ziehen"
        pruefung={{ stand: 'bereit', an: geprueft({}), weiter: { stand: 'offen' } }}
      />,
    );
    expect(screen.queryByText('Passt es?')).toBeNull();
    expect(screen.getByText('Anfahrt: passt · 12 Min. Luft')).toBeInTheDocument();
    expect(screen.getByTestId('wegauskunft')).not.toHaveAttribute('role');
  });
});
