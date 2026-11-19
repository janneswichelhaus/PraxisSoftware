import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Lastenrad3D } from './Lastenrad3D';
import { mountLastenrad, type LastenradAnsicht } from './lastenrad3d/viewer';

// jsdom hat kein WebGL: Die Ansicht selbst prüft tests/e2e/lastenrad.spec.ts im Browser.
vi.mock('./lastenrad3d/viewer', () => ({ mountLastenrad: vi.fn() }));

const mount = vi.mocked(mountLastenrad);

function ansicht(): LastenradAnsicht & { dispose: ReturnType<typeof vi.fn> } {
  return { dispose: vi.fn(), render: vi.fn() } as unknown as LastenradAnsicht & {
    dispose: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  mount.mockReset();
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
});
