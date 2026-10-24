import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Durchfuehrungskopf } from './Durchfuehrungskopf';

function balken(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('[data-balken]'), (b) =>
    b.getAttribute('data-balken'),
  );
}

/**
 * Der Kopf der Durchführung (Handoff 2026-10-24, Abschnitt 3): „Zurück“ ab
 * Übung 2, „Später weiter“ immer (ANN-705), ein Balken je Übung und der Stand
 * als Text.
 */
describe('Durchfuehrungskopf', () => {
  it('führt bei Übung 1 nur „Später weiter“ zur Herkunft und sagt den Stand als Text', async () => {
    const { container } = render(
      <MemoryRouter>
        <Durchfuehrungskopf uebung={1} von={3} spaeter={{ pfad: '/p/uebungen' }} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Später weiter' })).toHaveAttribute(
      'href',
      '/p/uebungen',
    );
    expect(screen.queryByText(/Abbrechen/)).toBeNull();
    expect(screen.getByText('Übung 1 von 3')).toBeInTheDocument();
    expect(balken(container)).toEqual(['erreicht', 'offen', 'offen']);
    expect(container.querySelector('[data-balken]')?.parentElement).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await pruefeBarrierefreiheit(container);
  });

  it('geht ab Übung 2 zur vorigen Übung zurück', () => {
    const zurueck = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <Durchfuehrungskopf
          uebung={2}
          von={3}
          onZurueck={zurueck}
          spaeter={{ pfad: '/p/uebungen' }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(zurueck).toHaveBeenCalledOnce();
    expect(balken(container)).toEqual(['erreicht', 'erreicht', 'offen']);
  });

  it('steht beim Beenden auf „Abschluss“ mit allen Balken und kennt „Später weiter“ als Knopf', () => {
    const spaeter = vi.fn();
    const { container } = render(
      <Durchfuehrungskopf
        uebung={3}
        von={3}
        abschluss
        onZurueck={() => undefined}
        spaeter={{ onSpaeter: spaeter }}
      />,
    );
    expect(screen.getByText('Abschluss')).toBeInTheDocument();
    expect(screen.queryByText(/Übung 3 von 3/)).toBeNull();
    expect(balken(container)).toEqual(['erreicht', 'erreicht', 'erreicht']);
    fireEvent.click(screen.getByRole('button', { name: 'Später weiter' }));
    expect(spaeter).toHaveBeenCalledOnce();
  });

  it('sagt ohne Netz in einer stehenden Live-Region, wo die Haken liegen', () => {
    const { rerender } = render(
      <Durchfuehrungskopf uebung={1} von={2} spaeter={{ onSpaeter: () => undefined }} />,
    );
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    rerender(
      <Durchfuehrungskopf uebung={1} von={2} spaeter={{ onSpaeter: () => undefined }} ohneNetz />,
    );
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Ohne Verbindung – Ihre Haken liegen auf diesem Gerät.');
  });
});
