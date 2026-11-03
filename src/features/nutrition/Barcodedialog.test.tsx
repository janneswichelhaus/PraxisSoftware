import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Barcodeleser } from '@/lib/barcode/erkennung';
import { Barcodedialog } from './Barcodedialog';

// Kamera und Leser sind nachgebildet (jsdom hat keine); geprüft wird nur Bild, nie Ton, zwei
// gleiche Lesungen, das Ende der Kamera und der Weg über die getippte Nummer.

const stopp = vi.fn();
const getUserMedia = vi.fn();
const beendet = vi.fn();

function leserMit(...runden: string[][]): () => Promise<Barcodeleser> {
  let i = 0;
  return () =>
    Promise.resolve({
      lesen: () => Promise.resolve(runden[Math.min(i++, runden.length - 1)] ?? []),
      beenden: beendet,
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopp }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Barcodedialog', () => {
  it('fordert nur Bild an und gibt eine Nummer erst nach zwei gleichen Lesungen heraus', async () => {
    const onNummer = vi.fn();
    render(
      <Barcodedialog
        onNummer={onNummer}
        onSchliessen={vi.fn()}
        leser={leserMit([], ['4006381333931'], [], ['2000000000008'], ['4006381333931'])}
      />,
    );
    await waitFor(() => expect(onNummer).toHaveBeenCalledWith('4006381333931'), {
      timeout: 3000,
    });
    expect(onNummer).toHaveBeenCalledTimes(1);
    const anfrage = getUserMedia.mock.calls[0]![0] as MediaStreamConstraints;
    expect(anfrage.audio).toBe(false);
    expect(anfrage.video).toBeTruthy();
    expect(stopp).toHaveBeenCalled();
    await waitFor(() => expect(beendet).toHaveBeenCalled());
  });

  it('„Abbrechen“ beendet die Kamera, ohne eine Nummer', async () => {
    const user = userEvent.setup();
    const onNummer = vi.fn();
    const onSchliessen = vi.fn();
    render(<Barcodedialog onNummer={onNummer} onSchliessen={onSchliessen} leser={leserMit([])} />);
    await screen.findByText('Den Barcode in den Rahmen halten.');
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onSchliessen).toHaveBeenCalled();
    expect(stopp).toHaveBeenCalled();
    expect(onNummer).not.toHaveBeenCalled();
  });

  it('die getippte Nummer: Ziffern und Prüfziffer, Leerzeichen zählen nicht', async () => {
    const user = userEvent.setup();
    const onNummer = vi.fn();
    render(<Barcodedialog onNummer={onNummer} onSchliessen={vi.fn()} leser={leserMit([])} />);
    await user.click(await screen.findByRole('button', { name: 'Nummer eintippen' }));
    expect(stopp).toHaveBeenCalled();
    const feld = screen.getByLabelText('Nummer unter dem Barcode');
    await user.type(feld, '12345');
    await user.click(screen.getByRole('button', { name: 'Nachschlagen' }));
    expect(screen.getByText(/8 oder 13 Ziffern/)).toBeVisible();
    await user.clear(feld);
    await user.type(feld, '4006381333932');
    await user.click(screen.getByRole('button', { name: 'Nachschlagen' }));
    expect(screen.getByText(/stimmt nicht/)).toBeVisible();
    await user.clear(feld);
    await user.type(feld, '4 006381 333931');
    await user.click(screen.getByRole('button', { name: 'Nachschlagen' }));
    expect(onNummer).toHaveBeenCalledWith('4006381333931');
  });

  it('verweigerte Kamera: der Satz dazu, erneut versuchen und eintippen', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('nein'), { name: 'NotAllowedError' }));
    render(<Barcodedialog onNummer={vi.fn()} onSchliessen={vi.fn()} leser={leserMit([])} />);
    expect(await screen.findByText(/nicht freigegeben/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nummer eintippen' })).toBeVisible();
  });

  it('ohne Kamera gleich zum Eintippen, ohne Anfrage an die Kamera', () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    render(<Barcodedialog onNummer={vi.fn()} onSchliessen={vi.fn()} leser={leserMit([])} />);
    expect(screen.getByText('Die Kamera steht hier nicht zur Verfügung.')).toBeVisible();
    expect(screen.getByLabelText('Nummer unter dem Barcode')).toBeVisible();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
