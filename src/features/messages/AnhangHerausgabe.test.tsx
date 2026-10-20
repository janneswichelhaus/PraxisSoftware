import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as RueckfragenApi from './api';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * Fotos und Videos an Rückfragen herausgeben (BEF-188, ADR-017 Punkt 96).
 *
 * Geprüft wird die Oberfläche: die Kopie erst auf Knopfdruck, je Anhang, auch
 * gesperrt, unter einem Namen ohne Namen der Person. Dass nur `owner`
 * herausgeben darf und jede Kopie protokolliert ist, prüft
 * `supabase/tests/message-attachments.test.ts`.
 */

const PATIENT = '66666666-6666-4666-8666-000000000002';
const fetchAnhaenge = vi.fn();
const gibHeraus = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof RueckfragenApi>();
  return {
    ...actual,
    fetchAnhaengeZurHerausgabe: (art: string, id: string) =>
      fetchAnhaenge(art, id) as Promise<RueckfragenApi.HerausgabeAnhang[]>,
    gibRueckfrageAnhangHeraus: (id: string) => gibHeraus(id) as Promise<Blob>,
  };
});

const { AnhangHerausgabe } = await import('./AnhangHerausgabe');
const { anhangDateiname } = await import('./api');

const FOTO: RueckfragenApi.HerausgabeAnhang = {
  id: 'abcdef12-0000-4000-8000-000000000001',
  media_kind: 'photo',
  mime_type: 'image/jpeg',
  duration_seconds: null,
  taken_at: '2026-10-01T22:30:00Z',
  author_kind: 'self',
  locked: true,
  object_missing: false,
};

describe('AnhangHerausgabe', { timeout: 20_000 }, () => {
  const geklickt = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchAnhaenge.mockResolvedValue([FOTO]);
    gibHeraus.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    URL.createObjectURL = vi.fn(() => 'blob:kopie');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      geklickt(this.download, this.href);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('gibt erst auf Knopfdruck heraus, auch gesperrt, unter einem Namen ohne Person', async () => {
    renderWithProviders(<AnhangHerausgabe art="treatment" verhaeltnisId={PATIENT} />);

    const knopf = await screen.findByRole('button', {
      name: 'Kopie für die Person herunterladen: Foto vom 02.10.2026',
    });
    expect(fetchAnhaenge).toHaveBeenCalledWith('treatment', PATIENT);
    expect(screen.getByText('· gesperrt')).toBeInTheDocument();
    expect(gibHeraus).not.toHaveBeenCalled();

    await userEvent.click(knopf);

    await waitFor(() =>
      expect(geklickt).toHaveBeenCalledWith(
        'Rueckfrage-Foto-2026-10-02-abcdef12.jpg',
        'blob:kopie',
      ),
    );
    expect(gibHeraus).toHaveBeenCalledWith(FOTO.id);
    expect(
      await screen.findByText(
        'Kopie zum Speichern übergeben und protokolliert. Bitte prüfen, ob die Datei angekommen ist.',
      ),
    ).toBeInTheDocument();
  });

  it('meldet eine Abweisung, statt still nichts zu sichern', async () => {
    gibHeraus.mockRejectedValue(
      new Error('Die Aufnahme konnte nicht herausgegeben werden. Fehlt die Berechtigung?'),
    );
    renderWithProviders(<AnhangHerausgabe art="treatment" verhaeltnisId={PATIENT} />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Kopie für die Person herunterladen/ }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/Fehlt die Berechtigung/);
    expect(geklickt).not.toHaveBeenCalled();
  });

  it('sperrt den Knopf, wenn die Aufnahme in der Ablage fehlt', async () => {
    fetchAnhaenge.mockResolvedValue([{ ...FOTO, object_missing: true }]);
    renderWithProviders(<AnhangHerausgabe art="training" verhaeltnisId={PATIENT} />);
    expect(
      await screen.findByRole('button', { name: /Kopie für die Person herunterladen/ }),
    ).toBeDisabled();
    expect(screen.getByText(/fehlt in der Ablage/)).toBeInTheDocument();
  });

  it('sagt, wenn es keine Aufnahme gibt', async () => {
    fetchAnhaenge.mockResolvedValue([]);
    renderWithProviders(<AnhangHerausgabe art="training" verhaeltnisId={PATIENT} />);
    expect(await screen.findByText('Keine Fotos oder Videos')).toBeInTheDocument();
  });

  it('wählt die Endung nach der Art des Videos', () => {
    const video = { ...FOTO, media_kind: 'video' as const, duration_seconds: 12 };
    expect(anhangDateiname({ ...video, mime_type: 'video/mp4' }, 'Europe/Berlin')).toBe(
      'Rueckfrage-Video-2026-10-02-abcdef12.mp4',
    );
    expect(anhangDateiname({ ...video, mime_type: 'video/webm' }, 'Europe/Berlin')).toBe(
      'Rueckfrage-Video-2026-10-02-abcdef12.webm',
    );
  });

  it('besteht die Barrierefreiheitsprüfung', async () => {
    const { container } = renderWithProviders(
      <AnhangHerausgabe art="treatment" verhaeltnisId={PATIENT} />,
    );
    await screen.findByRole('button', { name: /Kopie für die Person herunterladen/ });
    await pruefeBarrierefreiheit(container);
  });
});
