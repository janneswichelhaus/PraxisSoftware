import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as FotoApi from './patientenfotos';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * Fotos an die Person herausgeben (DOK-006d, ADR-017 Punkt 40).
 *
 * Geprüft wird die Oberfläche: Die Kopie entsteht erst auf Knopfdruck, je
 * Foto, und wird unter einem Namen ohne Pfadzeichen gesichert. Dass nur
 * `owner` herausgeben darf und dass jede Kopie protokolliert ist, prüft
 * `supabase/tests/patient-photos.test.ts`.
 */

const PATIENT = '66666666-6666-4666-8666-000000000001';
const fetchPatientenfotos = vi.fn();
const gibPatientenfotoHeraus = vi.fn();

vi.mock('./patientenfotos', async (importOriginal) => {
  const actual = await importOriginal<typeof FotoApi>();
  return {
    ...actual,
    fetchFotosZurHerausgabe: (id: string) =>
      fetchPatientenfotos(id) as Promise<FotoApi.HerausgabeFoto[]>,
    gibPatientenfotoHeraus: (id: string) =>
      gibPatientenfotoHeraus(id) as Promise<{ name: string; bild: Blob }>,
  };
});

const { FotoHerausgabe } = await import('./FotoHerausgabe');
const { herausgabeDateiname } = await import('./patientenfotos');

const FOTO: FotoApi.HerausgabeFoto = {
  id: 'f1',
  document_type: 'patientenfoto',
  display_name: 'Knie rechts/links: Vergleich',
  taken_at: '2026-09-01T08:00:00Z',
  locked: false,
  object_missing: false,
};

// Unter voller Last der Testsuite reichen 5 s für den ersten Knopfdruck samt
// Abfrage nicht immer.
describe('FotoHerausgabe', { timeout: 20_000 }, () => {
  const geklickt = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchPatientenfotos.mockResolvedValue([FOTO]);
    gibPatientenfotoHeraus.mockResolvedValue({
      name: FOTO.display_name,
      bild: new Blob(['jpeg'], { type: 'image/jpeg' }),
    });
    URL.createObjectURL = vi.fn(() => 'blob:kopie');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      geklickt(this.download, this.href);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('gibt erst auf Knopfdruck heraus, je Foto, unter einem sicheren Dateinamen', async () => {
    renderWithProviders(<FotoHerausgabe patientId={PATIENT} />);

    const knopf = await screen.findByRole('button', {
      name: 'Kopie für die Person herunterladen: Knie rechts/links: Vergleich',
    });
    expect(gibPatientenfotoHeraus).not.toHaveBeenCalled();

    await userEvent.click(knopf);

    await waitFor(() =>
      expect(geklickt).toHaveBeenCalledWith('Knie rechts_links_ Vergleich.jpg', 'blob:kopie'),
    );
    expect(gibPatientenfotoHeraus).toHaveBeenCalledWith('f1');
    // Gemeldet wird, was die Seite weiß - nicht, dass gesichert ist (DAT-19).
    expect(
      await screen.findByText(
        'Kopie zum Speichern übergeben und protokolliert. Bitte prüfen, ob die Datei angekommen ist.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Gesichert/)).toBeNull();
  });

  it('meldet eine Abweisung, statt still nichts zu sichern', async () => {
    gibPatientenfotoHeraus.mockRejectedValue(
      new Error('Das Foto konnte nicht herausgegeben werden. Fehlt die Berechtigung?'),
    );
    renderWithProviders(<FotoHerausgabe patientId={PATIENT} />);

    await userEvent.click(
      await screen.findByRole('button', { name: /Kopie für die Person herunterladen/ }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/Fehlt die Berechtigung/);
    expect(geklickt).not.toHaveBeenCalled();
  });

  it('sagt, wenn es kein Foto gibt', async () => {
    fetchPatientenfotos.mockResolvedValue([]);
    renderWithProviders(<FotoHerausgabe patientId={PATIENT} />);
    expect(await screen.findByText('Keine Fotos')).toBeInTheDocument();
  });

  it('meldet einen Ladefehler mit einem neuen Versuch (DAT-13, WRT-01)', async () => {
    fetchPatientenfotos.mockRejectedValueOnce(new Error('synthetisch'));
    renderWithProviders(<FotoHerausgabe patientId={PATIENT} />);

    expect(await screen.findByText('Die Fotos konnten nicht geladen werden.')).toBeVisible();
    expect(screen.getByText('Bitte die Verbindung prüfen und erneut versuchen.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(
      await screen.findByRole('button', { name: /Kopie für die Person herunterladen/ }),
    ).toBeInTheDocument();
  });

  it('bildet den Dateinamen ohne Pfad- und Steuerzeichen', () => {
    expect(herausgabeDateiname('../../etc/passwd')).toBe('.._.._etc_passwd.jpg');
    expect(herausgabeDateiname('Schulter äußere Seite')).toBe('Schulter äußere Seite.jpg');
    expect(herausgabeDateiname('///')).toBe('_.jpg');
    expect(herausgabeDateiname('')).toBe('Foto.jpg');
  });

  it('besteht die Barrierefreiheitsprüfung', async () => {
    const { container } = renderWithProviders(<FotoHerausgabe patientId={PATIENT} />);
    await screen.findByRole('button', { name: /Kopie für die Person herunterladen/ });
    await pruefeBarrierefreiheit(container);
  });

  it('bietet auch ein gesperrtes Foto zur Kopie an und sagt, dass es gesperrt ist (BEF-107)', async () => {
    fetchPatientenfotos.mockResolvedValue([{ ...FOTO, locked: true }]);
    renderWithProviders(<FotoHerausgabe patientId={PATIENT} />);
    expect(
      await screen.findByRole('button', { name: /Kopie für die Person herunterladen/ }),
    ).toBeEnabled();
    expect(screen.getByText('· gesperrt')).toBeInTheDocument();
  });
});
