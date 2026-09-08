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
    const { container } = renderWithProviders(<Verbindungsanzeige />);
    expect(container).toBeEmptyDOMElement();
  });

  it('meldet den Verbindungsverlust und warnt vor Textverlust', () => {
    renderWithProviders(<Verbindungsanzeige />);
    setzeVerbindung(false);

    const meldung = screen.getByRole('status');
    expect(meldung).toHaveTextContent('Keine Verbindung.');
    // Der eigentliche Zweck: nicht "offline", sondern "jetzt nichts verlieren".
    expect(meldung).toHaveTextContent('Text im Feld stehen lassen');
  });

  it('verschwindet wieder, sobald die Verbindung zurueck ist', () => {
    renderWithProviders(<Verbindungsanzeige />);
    setzeVerbindung(false);
    expect(screen.getByRole('status')).toBeInTheDocument();

    setzeVerbindung(true);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('nennt den Zustand als Text, nicht nur als Farbe', () => {
    renderWithProviders(<Verbindungsanzeige />);
    setzeVerbindung(false);
    // WCAG 1.4.1: die Bedeutung haengt nicht am gelben Hintergrund.
    expect(screen.getByText('Keine Verbindung.')).toBeInTheDocument();
  });

  it('wird nicht mitgedruckt', () => {
    renderWithProviders(<Verbindungsanzeige />);
    setzeVerbindung(false);
    expect(screen.getByRole('status').className).toContain('nicht-drucken');
  });
});
