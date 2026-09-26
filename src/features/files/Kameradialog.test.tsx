import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Kameradialog } from './Kameradialog';
import { kameraVerfuegbar } from './kamera';

/**
 * Der Kameradialog (DOK-006, ADR-017 Punkt 33).
 *
 * Geprüft wird, was der Punkt als Eigenschaft des Aufnahmewegs festlegt und
 * kein Server nachprüfen kann: nur Bild, nie Ton; die Kamera endet beim
 * Auslösen, beim Abbrechen und beim Abbau; ohne Kamera kein Ausweg über einen
 * Dateiwähler. Die Kamera selbst ist eine Nachbildung — jsdom hat keine.
 */

const stopp = vi.fn();
const getUserMedia = vi.fn();
const freigeben = vi.fn();

function stromMitSpur() {
  return { getTracks: () => [{ stop: stopp }] } as unknown as MediaStream;
}

function kameraEinbauen() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
}

function kameraAusbauen() {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMedia.mockResolvedValue(stromMitSpur());
  kameraEinbauen();

  // Was jsdom nicht kann: ein Kamerabild mit Maßen, ein Canvas, das JPEG
  // kodiert, Objekt-URLs.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(3);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    fertig: BlobCallback,
    typ?: string,
  ) {
    fertig(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: typ ?? 'image/png' }));
  });
  URL.createObjectURL = vi.fn(() => 'blob:vorschau');
  URL.revokeObjectURL = freigeben;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Kameradialog', () => {
  it('fordert nur Bild an, nie Ton', async () => {
    render(<Kameradialog titel="Foto" onAufnahme={vi.fn()} onSchliessen={vi.fn()} />);

    await screen.findByRole('button', { name: 'Auslösen' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const anfrage = getUserMedia.mock.calls[0]![0] as MediaStreamConstraints;
    expect(anfrage.audio).toBe(false);
    expect(anfrage.video).toBeTruthy();
  });

  it('beendet die Kamera beim Auslösen und gibt das Foto erst auf „Foto verwenden" heraus', async () => {
    const user = userEvent.setup();
    const onAufnahme = vi.fn();
    render(<Kameradialog titel="Foto" onAufnahme={onAufnahme} onSchliessen={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Auslösen' }));

    expect(stopp).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Aufgenommenes Foto' })).toHaveAttribute(
      'src',
      'blob:vorschau',
    );
    expect(onAufnahme).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Foto verwenden' }));
    const foto = onAufnahme.mock.calls[0]![0] as Blob;
    expect(foto.type).toBe('image/jpeg');
  });

  it('startet für „Neu aufnehmen" die Kamera erneut und gibt die Vorschau frei', async () => {
    const user = userEvent.setup();
    render(<Kameradialog titel="Foto" onAufnahme={vi.fn()} onSchliessen={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Auslösen' }));
    await user.click(screen.getByRole('button', { name: 'Neu aufnehmen' }));

    await screen.findByRole('button', { name: 'Auslösen' });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(freigeben).toHaveBeenCalledWith('blob:vorschau');
  });

  it('beendet die Kamera beim Abbrechen', async () => {
    const user = userEvent.setup();
    const onSchliessen = vi.fn();
    render(<Kameradialog titel="Foto" onAufnahme={vi.fn()} onSchliessen={onSchliessen} />);

    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }));

    await waitFor(() => expect(stopp).toHaveBeenCalled());
    expect(onSchliessen).toHaveBeenCalled();
  });

  it('beendet die Kamera, wenn der Dialog verschwindet', async () => {
    const { unmount } = render(
      <Kameradialog titel="Foto" onAufnahme={vi.fn()} onSchliessen={vi.fn()} />,
    );
    await screen.findByRole('button', { name: 'Auslösen' });

    unmount();
    expect(stopp).toHaveBeenCalled();
  });

  it('beendet auch einen Strom, der erst nach dem Schließen freigegeben wird', async () => {
    let zulassen: (strom: MediaStream) => void = () => undefined;
    getUserMedia.mockReturnValue(new Promise<MediaStream>((fertig) => (zulassen = fertig)));
    const { unmount } = render(
      <Kameradialog titel="Foto" onAufnahme={vi.fn()} onSchliessen={vi.fn()} />,
    );

    unmount();
    zulassen(stromMitSpur());
    await waitFor(() => expect(stopp).toHaveBeenCalled());
  });

  it('sagt, wenn die Freigabe verweigert wurde', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('nein'), { name: 'NotAllowedError' }));
    render(<Kameradialog titel="Foto" onAufnahme={vi.fn()} onSchliessen={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht freigegeben/);
    expect(screen.queryByRole('button', { name: 'Auslösen' })).not.toBeInTheDocument();
  });

  it('ohne Kamera: eine Erklärung, kein Dateiwähler als Ausweg', async () => {
    kameraAusbauen();
    expect(kameraVerfuegbar()).toBe(false);
    const { container } = render(
      <Kameradialog titel="Foto" onAufnahme={vi.fn()} onSchliessen={vi.fn()} />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/sichere Verbindung/);
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).not.toBeInTheDocument();
  });

  it('zeigt einen Hinweis über dem Kamerabild', async () => {
    render(
      <Kameradialog
        titel="Foto"
        hinweis="Das Gesicht nur, wenn es die betroffene Region ist."
        onAufnahme={vi.fn()}
        onSchliessen={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Gesicht nur/)).toBeInTheDocument();
  });
});
