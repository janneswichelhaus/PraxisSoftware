import { afterEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { Verbindungsanzeige } from './Verbindungsanzeige';

function setzeVerbindung(verbunden: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: verbunden, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(verbunden ? 'online' : 'offline'));
  });
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('Verbindungsanzeige', () => {
  it('bleibt im Normalfall stumm', () => {
    setzeVerbindung(true);
    renderWithProviders(<Verbindungsanzeige />);
    // Die Zeile steht im Baum, aber ohne Inhalt: nichts zu sehen, nichts
    // vorzulesen (NAV-11).
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('meldet den Verbindungsverlust und warnt vor Textverlust', () => {
    renderWithProviders(<Verbindungsanzeige />);
    setzeVerbindung(false);

    const meldung = screen.getByRole('status');
    expect(meldung).toHaveTextContent('Keine Verbindung.');
    // Der eigentliche Zweck: nicht "offline", sondern "jetzt nichts verlieren".
    expect(meldung).toHaveTextContent('Text im Feld stehen lassen');
  });

  it('sagt den Verlust in der Zeile an, die schon vorher im Baum stand (NAV-11)', () => {
    // Eine Live-Region, die erst mit ihrem Text entsteht, sagen
    // Vorlesesoftwares unzuverlaessig an. Deshalb wechselt nur der Inhalt.
    renderWithProviders(<Verbindungsanzeige />);
    const zeile = screen.getByRole('status');

    setzeVerbindung(false);

    expect(screen.getByRole('status')).toBe(zeile);
    expect(zeile).toHaveTextContent('Keine Verbindung.');
  });

  it('leert die Zeile wieder, sobald die Verbindung zurueck ist', () => {
    renderWithProviders(<Verbindungsanzeige />);
    setzeVerbindung(false);
    expect(screen.getByRole('status')).toHaveTextContent('Keine Verbindung.');

    setzeVerbindung(true);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByText('Keine Verbindung.')).not.toBeInTheDocument();
  });

  it('nennt den Zustand als Text und Zeichen, nicht nur als Farbe', () => {
    renderWithProviders(<Verbindungsanzeige />);
    setzeVerbindung(false);
    // WCAG 1.4.1: die Bedeutung haengt nicht am gelben Hintergrund.
    expect(screen.getByText('Keine Verbindung.')).toBeInTheDocument();
    // Das Zeichen wie im Badge (DS-001) - fuer Vorlesesoftware ausgeblendet,
    // der Satz sagt es schon.
    expect(screen.getByText('!')).toHaveAttribute('aria-hidden', 'true');
  });

  it('wird nicht mitgedruckt', () => {
    renderWithProviders(<Verbindungsanzeige />);
    setzeVerbindung(false);
    expect(screen.getByRole('status').className).toContain('nicht-drucken');
  });
});
