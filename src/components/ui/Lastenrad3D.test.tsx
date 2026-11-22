import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Lastenrad3D, type Radauswahl } from './Lastenrad3D';
import { richteAuswahlEin, type Auswahl } from './lastenrad3d/auswahl';
import { mountLastenrad, type LastenradAnsicht } from './lastenrad3d/viewer';

// jsdom hat kein WebGL: Die Ansicht selbst prüft tests/e2e/lastenrad.spec.ts im Browser.
vi.mock('./lastenrad3d/viewer', () => ({ mountLastenrad: vi.fn() }));
vi.mock('./lastenrad3d/auswahl', () => ({ richteAuswahlEin: vi.fn() }));

const mount = vi.mocked(mountLastenrad);
const einrichten = vi.mocked(richteAuswahlEin);

function ansicht(): LastenradAnsicht & { dispose: ReturnType<typeof vi.fn> } {
  return { dispose: vi.fn(), render: vi.fn() } as unknown as LastenradAnsicht & {
    dispose: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  mount.mockReset();
  einrichten.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Lastenrad3D', () => {
  it('setzt die Ansicht ohne Zoom in die Bühne und gibt sie beim Verlassen frei', async () => {
    const fertig = ansicht();
    mount.mockResolvedValue(fertig);
    const { container, unmount } = render(<Lastenrad3D />);
    const buehne = container.firstElementChild;

    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    expect(mount).toHaveBeenCalledWith(buehne, { zoom: false });
    expect(buehne).toHaveClass('h-64', 'bg-radbuehne');
    await act(async () => {});
    expect(fertig.dispose).not.toHaveBeenCalled();

    unmount();
    expect(fertig.dispose).toHaveBeenCalledTimes(1);
  });

  it('gibt eine Ansicht frei, die erst nach dem Verlassen fertig wird', async () => {
    const fertig = ansicht();
    let aufloesen: (wert: LastenradAnsicht) => void = () => {};
    mount.mockReturnValue(new Promise((resolve) => (aufloesen = resolve)));
    const { unmount } = render(<Lastenrad3D />);
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));

    unmount();
    expect(fertig.dispose).not.toHaveBeenCalled();
    await act(async () => {
      aufloesen(fertig);
      await Promise.resolve();
    });
    expect(fertig.dispose).toHaveBeenCalledTimes(1);
  });

  it('zeigt ohne WebGL einen ruhigen Hinweis statt der Ansicht', async () => {
    mount.mockRejectedValue(new Error('Error creating WebGL context.'));
    const { container } = render(<Lastenrad3D />);

    expect(await screen.findByText('3D-Ansicht nicht verfügbar')).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeNull();
    await pruefeBarrierefreiheit(container);
  });

  it('lädt erst, wenn die Bühne ins Bild kommt', async () => {
    let melden: (sichtbar: boolean) => void = () => {};
    const trennen = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(rueckruf: (eintraege: { isIntersecting: boolean }[]) => void) {
          melden = (sichtbar) => rueckruf([{ isIntersecting: sichtbar }]);
        }
        observe() {}
        disconnect = trennen;
      },
    );
    mount.mockResolvedValue(ansicht());
    render(<Lastenrad3D />);

    await act(async () => {
      melden(false);
      await Promise.resolve();
    });
    expect(mount).not.toHaveBeenCalled();

    await act(async () => {
      melden(true);
      await Promise.resolve();
    });
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    expect(trennen).toHaveBeenCalled();
  });
  describe('mit Auswahl', () => {
    const gruppeVon = (teil: string) => (teil === 'vorderrad_reifen' ? 'reifen-vorne' : null);
    function aufbau() {
      const fertig = ansicht();
      const wahl = { setze: vi.fn(), punkt: vi.fn(), dispose: vi.fn() } satisfies Auswahl;
      mount.mockResolvedValue(fertig);
      einrichten.mockReturnValue(wahl);
      return { fertig, wahl };
    }
    const angaben = (teil: Partial<Radauswahl> = {}): Radauswahl => ({
      gruppeVon,
      onWahl: vi.fn(),
      ...teil,
    });

    it('lässt das Rad stillstehen, behält die Teile einzeln und nennt die Ansicht', async () => {
      const { wahl } = aufbau();
      const { container } = render(
        <Lastenrad3D label="Lastenrad zum Antippen" auswahl={angaben({ waehlbar: ['a', 'b'] })} />,
      );
      await waitFor(() => expect(wahl.setze).toHaveBeenCalled());
      expect(mount).toHaveBeenCalledWith(container.firstElementChild, {
        zoom: false,
        label: 'Lastenrad zum Antippen',
        merge: false,
        autoRotate: false,
      });
      expect(wahl.setze).toHaveBeenLastCalledWith({ waehlbar: ['a', 'b'], marken: [] });
    });

    it('reicht Zuordnung und Wahl an die jüngsten Angaben weiter', async () => {
      const { wahl } = aufbau();
      const erste = vi.fn();
      const zweite = vi.fn();
      const { rerender } = render(<Lastenrad3D auswahl={angaben({ onWahl: erste })} />);
      await waitFor(() => expect(wahl.setze).toHaveBeenCalled());
      const [, , zuordnen, waehlen] = einrichten.mock.calls[0]!;
      expect(zuordnen('vorderrad_reifen')).toBe('reifen-vorne');
      expect(zuordnen('sattel')).toBeNull();

      rerender(<Lastenrad3D auswahl={angaben({ onWahl: zweite })} />);
      waehlen(['reifen-vorne', 'laufrad-vorne']);
      expect(erste).not.toHaveBeenCalled();
      expect(zweite).toHaveBeenCalledWith(['reifen-vorne', 'laufrad-vorne']);
      // Dieselben Angaben bauen nichts neu und setzen nichts doppelt.
      expect(mount).toHaveBeenCalledTimes(1);
      expect(wahl.setze).toHaveBeenCalledTimes(1);
    });

    it('überträgt eine neue Marke mit der Farbe ihres Tokens', async () => {
      const { wahl } = aufbau();
      const { container, rerender } = render(<Lastenrad3D auswahl={angaben()} />);
      await waitFor(() => expect(wahl.setze).toHaveBeenCalledTimes(1));
      (container.firstElementChild as HTMLElement).style.setProperty('--color-danger', 'red');

      rerender(
        <Lastenrad3D
          auswahl={angaben({ marken: [{ gruppe: 'reifen-vorne', ton: 'kritisch' }] })}
        />,
      );
      await waitFor(() => expect(wahl.setze).toHaveBeenCalledTimes(2));
      expect(wahl.setze).toHaveBeenLastCalledWith({
        waehlbar: null,
        marken: [{ gruppe: 'reifen-vorne', farbe: 'red' }],
      });
    });

    it('gibt erst die Auswahl frei, dann die Ansicht', async () => {
      const { fertig, wahl } = aufbau();
      const { unmount } = render(<Lastenrad3D auswahl={angaben()} />);
      await waitFor(() => expect(wahl.setze).toHaveBeenCalled());
      unmount();
      expect(wahl.dispose).toHaveBeenCalledTimes(1);
      expect(wahl.dispose.mock.invocationCallOrder[0]).toBeLessThan(
        fertig.dispose.mock.invocationCallOrder[0]!,
      );
    });
  });
});
