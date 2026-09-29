import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as FilesApi from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Verordnung ohne Papier (PRX-011): das Foto am Termin.
 *
 * Geprüft wird, was die Oberfläche beiträgt: Das Foto geht als
 * Verordnungsscan **ohne** Grundlage an die Person, erst nach einem bewussten
 * „Ans Büro geben", und am Rechner ohne Kamera bleibt der Dateiwähler. Wer das
 * darf, prüft `supabase/tests/prescription-scans.test.ts`.
 */
const ladeDateiHoch = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof FilesApi>();
  return {
    ...actual,
    ladeDateiHoch: (auftrag: FilesApi.UploadAuftrag) => ladeDateiHoch(auftrag) as Promise<string>,
  };
});

const { PrescriptionPhoto } = await import('./PrescriptionPhoto');

const PATIENT = '66666666-6666-4666-8666-000000000001';

describe('PrescriptionPhoto mit Kamera', () => {
  const getUserMedia = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    ladeDateiHoch.mockResolvedValue('neu');
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(4);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(3);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((fertig, typ) =>
      fertig(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: typ ?? 'image/png' })),
    );
    URL.createObjectURL = vi.fn(() => 'blob:vorschau');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });

  it('gibt das Foto als Scan ohne Grundlage ans Buero - erst nach dem Tipp', async () => {
    renderWithProviders(<PrescriptionPhoto patientId={PATIENT} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Verordnung fotografieren' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Auslösen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Foto verwenden' }));

    expect(screen.getByText('Noch nicht übergeben.')).toBeInTheDocument();
    expect(ladeDateiHoch).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Ans Büro geben' }));

    await waitFor(() => expect(ladeDateiHoch).toHaveBeenCalledTimes(1));
    const auftrag = ladeDateiHoch.mock.calls[0]![0] as FilesApi.UploadAuftrag;
    expect(auftrag).toMatchObject({
      patientId: PATIENT,
      grundlageId: null,
      documentType: 'verordnungsscan',
    });
    expect(auftrag.displayName).toMatch(/^Verordnung, Foto vom \d{2}\.\d{2}\.\d{4}$/);
    expect(await screen.findByText(/wartet aufs Erfassen/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Offene Punkte' })).toHaveAttribute('href', '/offen');
  });

  it('behaelt das Foto, wenn die Uebergabe scheitert', async () => {
    ladeDateiHoch.mockRejectedValue(new Error('Die Datei konnte nicht übertragen werden.'));
    renderWithProviders(<PrescriptionPhoto patientId={PATIENT} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Verordnung fotografieren' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Auslösen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Foto verwenden' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ans Büro geben' }));

    expect(await screen.findByText(/nicht übertragen werden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ans Büro geben' })).toBeEnabled();
  });
});

describe('PrescriptionPhoto ohne Kamera', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ladeDateiHoch.mockResolvedValue('neu');
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });

  it('bietet am Rechner den Dateiwaehler an', () => {
    renderWithProviders(<PrescriptionPhoto patientId={PATIENT} />);
    expect(screen.queryByRole('button', { name: 'Verordnung fotografieren' })).toBeNull();
    expect(screen.getByLabelText('Verordnung als Datei')).toHaveAttribute('type', 'file');
  });
});
