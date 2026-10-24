import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Hakenzeile } from './Hakenzeile';

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Ein Durchgang zum Abhaken (Handoff 2026-10-24, Abschnitt 3) und die Pause
 * als Ring (ANN-709): keine Zahl, die herunterzählt; nach der Pause ist die
 * Zeile wieder offen.
 */
describe('Hakenzeile', () => {
  it('ist offen ein Umschalter für den ganzen Durchgang', async () => {
    const umschalten = vi.fn();
    const { container } = render(
      <Hakenzeile durchgang={1} erledigt={false} onUmschalten={umschalten} />,
    );
    const zeile = screen.getByRole('button', { name: '1. Durchgang' });
    expect(zeile).toHaveAttribute('aria-pressed', 'false');
    expect(zeile).toHaveClass('min-h-16', 'w-full', 'rounded-card');
    expect(screen.getByText('1. Durchgang')).toHaveClass('whitespace-nowrap');
    fireEvent.click(zeile);
    expect(umschalten).toHaveBeenCalledOnce();
    await pruefeBarrierefreiheit(container);
  });

  it('sagt erledigt mit Fläche, Wort und Haken - nicht nur mit Farbe', () => {
    render(<Hakenzeile durchgang={2} erledigt onUmschalten={() => undefined} />);
    const zeile = screen.getByRole('button', { name: '2. Durchgang erledigt' });
    expect(zeile).toHaveAttribute('aria-pressed', 'true');
    expect(zeile).toHaveClass('aria-pressed:bg-accent-soft', 'aria-pressed:border-accent');
    expect(zeile.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // Beim ersten Zeichnen federt nichts.
    expect(zeile.querySelector('.haken-gesetzt')).toBeNull();
  });

  it('zeigt die Pause als Ring ohne herunterzählende Zahl und endet nach ihrer Dauer', () => {
    vi.useFakeTimers();
    const ende = vi.fn();
    const { rerender } = render(
      <Hakenzeile
        durchgang={2}
        erledigt={false}
        pause={{ sekunden: 60, nummer: 1 }}
        onUmschalten={() => undefined}
        onPauseEnde={ende}
      />,
    );
    const zeile = screen.getByRole('button', { name: '2. Durchgang Pause · 60 Sekunden' });
    expect(zeile).toHaveClass('min-h-19');
    const ring = zeile.querySelector('[data-pausenring]');
    expect(ring).toHaveAttribute('aria-hidden', 'true');
    expect(ring?.querySelector('.pausenring-fuellung')).toHaveStyle({ animationDuration: '60s' });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    // Eine neue Funktion der Seite startet die Uhr nicht neu.
    rerender(
      <Hakenzeile
        durchgang={2}
        erledigt={false}
        pause={{ sekunden: 60, nummer: 1 }}
        onUmschalten={() => undefined}
        onPauseEnde={() => {
          ende();
        }}
      />,
    );
    expect(zeile).toHaveTextContent('2. Durchgang Pause · 60 Sekunden');
    expect(ende).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(ende).toHaveBeenCalledOnce();
  });

  it('beginnt den Ring mit einer neuen Pause von vorn', () => {
    vi.useFakeTimers();
    const ende = vi.fn();
    const zeile = (nummer: number) => (
      <Hakenzeile
        durchgang={3}
        erledigt={false}
        pause={{ sekunden: 10, nummer }}
        onUmschalten={() => undefined}
        onPauseEnde={ende}
      />
    );
    const { rerender } = render(zeile(1));
    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    rerender(zeile(2));
    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(ende).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(ende).toHaveBeenCalledOnce();
  });

  it('zeigt an einer erledigten Zeile keine Pause und lässt den Haken nach dem Tipp federn', () => {
    const { rerender } = render(
      <Hakenzeile
        durchgang={1}
        erledigt={false}
        pause={{ sekunden: 60, nummer: 1 }}
        onUmschalten={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^1\. Durchgang/ }));
    rerender(
      <Hakenzeile
        durchgang={1}
        erledigt
        pause={{ sekunden: 60, nummer: 1 }}
        onUmschalten={() => undefined}
      />,
    );
    const zeile = screen.getByRole('button', { name: '1. Durchgang erledigt' });
    expect(zeile.querySelector('[data-pausenring]')).toBeNull();
    expect(zeile.querySelector('.haken-gesetzt')).not.toBeNull();
  });
});
