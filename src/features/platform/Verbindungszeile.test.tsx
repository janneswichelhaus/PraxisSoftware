import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Verbindungszeile } from './Verbindungszeile';

/**
 * Die Verbindungszeile der Plattform (DR-118): stumm mit Netz, ohne Netz eine
 * Zeile mit der Uhrzeit des letzten Abrufs - und ohne Abruf keine Uhrzeit.
 */
function setzeVerbindung(verbunden: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: verbunden, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(verbunden ? 'online' : 'offline'));
  });
}

function zeige(queryClient = new QueryClient()) {
  render(
    <QueryClientProvider client={queryClient}>
      <Verbindungszeile />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('Verbindungszeile', () => {
  it('bleibt mit Netz stumm, steht aber als Live-Region im Baum', () => {
    zeige();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('nennt ohne Netz die Uhrzeit des letzten Abrufs', () => {
    const queryClient = new QueryClient();
    // Ortszeit, damit der Test in jeder Zeitzone dieselbe Uhrzeit liest.
    const abruf = new Date(2026, 9, 22, 8, 12).getTime();
    queryClient.setQueryData(['plattform', 'termine'], [], { updatedAt: abruf });
    queryClient.setQueryData(['plattform', 'zugang'], {}, { updatedAt: abruf - 60_000 });
    zeige(queryClient);
    setzeVerbindung(false);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Keine Verbindung. Sie sehen den Stand von 08:12 Uhr.',
    );
  });

  it('erfindet keine Uhrzeit, wenn nichts geladen wurde', () => {
    zeige();
    setzeVerbindung(false);

    const zeile = screen.getByRole('status');
    expect(zeile).toHaveTextContent('Keine Verbindung.');
    expect(zeile).not.toHaveTextContent('Stand');
  });

  it('verschwindet, sobald die Verbindung zurück ist', () => {
    zeige();
    setzeVerbindung(false);
    setzeVerbindung(true);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
