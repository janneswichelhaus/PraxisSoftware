import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { Textverlustschutz } from './Textverlustschutz';

/**
 * §13: Dokumentation darf niemals unbemerkt verloren gehen. Der Schutz kann
 * das nicht garantieren - er warnt. Genau das wird hier geprüft: dass die
 * Warnung existiert, solange sie gebraucht wird, und verschwindet, sobald
 * nichts mehr offen ist.
 */

function setzeVerbindung(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

afterEach(() => {
  setzeVerbindung(true);
  vi.restoreAllMocks();
});

describe('Textverlustschutz', () => {
  it('meldet ungespeicherte Eingaben beim Verlassen der Seite an den Browser', () => {
    const anmelden = vi.spyOn(window, 'addEventListener');
    render(<Textverlustschutz ungespeichert />);

    expect(anmelden.mock.calls.some(([typ]) => typ === 'beforeunload')).toBe(true);
  });

  it('meldet nichts an, solange nichts ungespeichert ist', () => {
    const anmelden = vi.spyOn(window, 'addEventListener');
    render(<Textverlustschutz ungespeichert={false} />);

    expect(anmelden.mock.calls.some(([typ]) => typ === 'beforeunload')).toBe(false);
  });

  it('meldet die Warnung wieder ab, sobald gespeichert ist', () => {
    const abmelden = vi.spyOn(window, 'removeEventListener');
    const { rerender } = render(<Textverlustschutz ungespeichert />);

    rerender(<Textverlustschutz ungespeichert={false} />);
    expect(abmelden.mock.calls.some(([typ]) => typ === 'beforeunload')).toBe(true);
  });

  it('sagt bei getrenntem Geraet, dass der Text stehen bleiben soll', () => {
    setzeVerbindung(false);
    render(<Textverlustschutz ungespeichert />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Ohne Verbindung/);
    expect(screen.getByRole('alert')).toHaveTextContent(/bleibt im Feld stehen/);
  });

  it('behauptet nichts, solange das Geraet verbunden ist', () => {
    const { container } = render(<Textverlustschutz ungespeichert />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt den Hinweis nicht, wenn nichts ungespeichert ist', () => {
    setzeVerbindung(false);
    const { container } = render(<Textverlustschutz ungespeichert={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reagiert auf einen Verbindungsabbruch waehrend des Schreibens', () => {
    const { container } = render(<Textverlustschutz ungespeichert />);
    expect(container).toBeEmptyDOMElement();

    act(() => {
      setzeVerbindung(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
