import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as FotoApi from './patientenfotos';
import type * as VermerkeApi from '@/features/datenschutz/vermerke';
import { renderWithProviders, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * Fotos im Verlauf (DOK-006, ADR-017 Abschnitt G).
 *
 * Geprüft wird, was die Oberfläche leisten muss und kein Server nachprüfen
 * kann: kein Dateiwähler für Fotos (Punkt 33), kein Verweis auf Vorrat und
 * keine Vorschau in der Liste (Punkte 15 und 40), die Ansicht aus dem
 * Speicher, die beim Schließen frei wird, und der Vergleich ohne Bewertung
 * (Punkt 39). Ob Einwilligung und Rolle reichen, entscheidet die Datenbank
 * (`supabase/tests/patient-photos.test.ts`).
 */

const PATIENT = '66666666-6666-4666-8666-000000000001';

const fetchPatientenfotos = vi.fn();
const ladePatientenfoto = vi.fn();
const speicherePatientenfoto = vi.fn();
const fetchDatenschutzvermerke = vi.fn();
const loescheDatei = vi.fn();

vi.mock('./patientenfotos', async (importOriginal) => {
  const actual = await importOriginal<typeof FotoApi>();
  return {
    ...actual,
    fetchPatientenfotos: (id: string) =>
      fetchPatientenfotos(id) as Promise<FotoApi.Patientenfoto[]>,
    ladePatientenfoto: (id: string) => ladePatientenfoto(id) as Promise<Blob>,
    speicherePatientenfoto: (auftrag: unknown) =>
      speicherePatientenfoto(auftrag) as Promise<string>,
  };
});

vi.mock('@/features/datenschutz/vermerke', async (importOriginal) => {
  const actual = await importOriginal<typeof VermerkeApi>();
  return {
    ...actual,
    fetchDatenschutzvermerke: (id: string) =>
      fetchDatenschutzvermerke(id) as Promise<VermerkeApi.Datenschutzvermerk[]>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, loescheDatei: (id: string) => loescheDatei(id) as Promise<void> };
});

const { Patientenfotos } = await import('./Patientenfotos');

function foto(rest: Partial<FotoApi.Patientenfoto> = {}): FotoApi.Patientenfoto {
  return {
    id: 'f1',
    display_name: 'Knie rechts',
    taken_at: '2026-09-01T08:00:00.000Z',
    taken_by_name: 'Anna Beispiel',
    delete_after: '2027-09-01T08:00:00.000Z',
    object_missing: false,
    ...rest,
  };
}

const ERTEILT: VermerkeApi.Datenschutzvermerk = {
  id: 'v1',
  record_kind: 'consent_granted',
  purpose: 'patient_photos',
  notice_version: null,
  occurred_on: '2026-08-30',
  recorded_at: '2026-08-30T08:00:00Z',
};

const erzeugt = vi.fn((_blob: Blob) => 'blob:foto');
const freigegeben = vi.fn((_adresse: string) => undefined);

function kameraEinbauen() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
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
}

function seite(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(<Patientenfotos patientId={PATIENT} user={testUser(rollen)} />);
}

describe('Patientenfotos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPatientenfotos.mockResolvedValue([]);
    fetchDatenschutzvermerke.mockResolvedValue([ERTEILT]);
    ladePatientenfoto.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    speicherePatientenfoto.mockResolvedValue('neu');
    loescheDatei.mockResolvedValue(undefined);
    URL.createObjectURL = erzeugt;
    URL.revokeObjectURL = freigegeben;
    kameraEinbauen();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });

  it('sagt ohne Einwilligung, dass keine Fotos entstehen, und bietet keine Aufnahme an', async () => {
    fetchDatenschutzvermerke.mockResolvedValue([]);
    seite();

    expect(await screen.findByText(/Keine Einwilligung vermerkt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Foto aufnehmen' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Datenschutz der Akte' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/datenschutz`,
    );
  });

  it('nennt eine Ablehnung als erledigten Stand', async () => {
    fetchDatenschutzvermerke.mockResolvedValue([
      { ...ERTEILT, record_kind: 'consent_refused', occurred_on: '2026-09-02' },
    ]);
    seite();
    expect(await screen.findByText(/Einwilligung abgelehnt am 02.09.2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Foto aufnehmen' })).not.toBeInTheDocument();
  });

  it('nimmt ein Foto nur über die Kamera auf - nirgends ein Dateiwähler (Punkt 33)', async () => {
    const user = userEvent.setup();
    const { container } = seite();

    await user.click(await screen.findByRole('button', { name: 'Foto aufnehmen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Foto aufnehmen' });
    expect(
      within(dialog).getByText(/Gesicht nur, wenn es selbst die betroffene Region/),
    ).toBeVisible();
    await user.click(await within(dialog).findByRole('button', { name: 'Auslösen' }));
    await user.click(within(dialog).getByRole('button', { name: 'Foto verwenden' }));

    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Knie rechts, Schwellung');
    await user.click(screen.getByRole('button', { name: 'Foto speichern' }));

    await waitFor(() => expect(speicherePatientenfoto).toHaveBeenCalledTimes(1));
    const auftrag = speicherePatientenfoto.mock.calls[0]![0] as {
      patientId: string;
      anzeigename: string;
      foto: Blob;
    };
    expect(auftrag.patientId).toBe(PATIENT);
    expect(auftrag.anzeigename).toBe('Knie rechts, Schwellung');
    expect(auftrag.foto.type).toBe('image/jpeg');
    expect(await screen.findByText(/ist gespeichert/)).toBeInTheDocument();

    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
  });

  it('behält das Foto nach einem gescheiterten Speichern und versucht es erneut', async () => {
    const user = userEvent.setup();
    speicherePatientenfoto
      .mockRejectedValueOnce(new Error('Das Foto konnte nicht gespeichert werden.'))
      .mockResolvedValueOnce('neu');
    seite();

    await user.click(await screen.findByRole('button', { name: 'Foto aufnehmen' }));
    await user.click(await screen.findByRole('button', { name: 'Auslösen' }));
    await user.click(screen.getByRole('button', { name: 'Foto verwenden' }));
    await user.click(screen.getByRole('button', { name: 'Foto speichern' }));

    expect(await screen.findByText(/Das Foto ist noch da/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Foto speichern' }));
    expect(await screen.findByText(/ist gespeichert/)).toBeInTheDocument();
    expect(speicherePatientenfoto).toHaveBeenCalledTimes(2);
  });

  it('bietet ohne Kamera keinen Ausweg über die Mediathek an', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const { container } = seite();

    expect(
      await screen.findByText(/Die Kamera steht hier nicht zur Verfügung/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Foto aufnehmen' })).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('zeigt die Liste ohne Vorschau und ohne Verweis auf Vorrat, mit Löschdatum (Punkt 40)', async () => {
    fetchPatientenfotos.mockResolvedValue([foto()]);
    const { container } = seite();

    expect(await screen.findByText('Knie rechts')).toBeInTheDocument();
    expect(
      screen.getByText(/01.09.2026 · Anna Beispiel · wird spätestens am 01.09.2027/),
    ).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
    expect(ladePatientenfoto).not.toHaveBeenCalled();
  });

  it('lädt ein Foto erst beim Ansehen, zeigt es aus dem Speicher und gibt es beim Schließen frei', async () => {
    const user = userEvent.setup();
    fetchPatientenfotos.mockResolvedValue([foto()]);
    seite();

    await user.click(await screen.findByRole('button', { name: /^Ansehen/ }));

    const ansicht = await screen.findByRole('region', { name: 'Fotoansicht' });
    expect(ladePatientenfoto).toHaveBeenCalledTimes(1);
    expect(ladePatientenfoto).toHaveBeenCalledWith('f1');
    const bild = within(ansicht).getByRole('img', { name: 'Knie rechts' });
    expect(bild).toHaveAttribute('src', 'blob:foto');
    // Keine Schaltfläche zum Herunterladen oder Teilen, kein Verweis zum Öffnen.
    expect(within(ansicht).queryByRole('link')).toBeNull();
    expect(within(ansicht).queryByRole('button', { name: /Herunterladen|Teilen/ })).toBeNull();

    await user.click(within(ansicht).getByRole('button', { name: 'Schließen' }));
    expect(freigegeben).toHaveBeenCalledWith('blob:foto');
    expect(screen.queryByRole('region', { name: 'Fotoansicht' })).not.toBeInTheDocument();
  });

  it('vergleicht zwei Fotos nebeneinander, das ältere links, ohne Bewertung (Punkt 39)', async () => {
    const user = userEvent.setup();
    fetchPatientenfotos.mockResolvedValue([
      foto({ id: 'neu', display_name: 'Knie rechts, später', taken_at: '2026-09-20T08:00:00Z' }),
      foto({ id: 'alt', display_name: 'Knie rechts, vorher', taken_at: '2026-09-01T08:00:00Z' }),
      foto({ id: 'drittes', display_name: 'Schulter', taken_at: '2026-09-10T08:00:00Z' }),
    ]);
    seite();

    const vergleich = await screen.findAllByLabelText(/^Zum Vergleich/);
    await user.click(vergleich[0]!);
    await user.click(vergleich[1]!);
    // Mehr als zwei gibt es nicht.
    expect(vergleich[2]).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Nebeneinander ansehen' }));

    const region = await screen.findByRole('region', { name: 'Vergleich zweier Fotos' });
    expect(ladePatientenfoto.mock.calls.map(([id]) => id as string)).toEqual(['alt', 'neu']);
    const bilder = within(region).getAllByRole('img');
    expect(bilder.map((b) => b.getAttribute('alt'))).toEqual([
      'Knie rechts, vorher',
      'Knie rechts, später',
    ]);
    // Einzige Aussage: der Verweis auf den Eintrag - kein Urteil über den Unterschied.
    expect(region).toHaveTextContent('Was sich verändert hat, gehört in Worten in den Eintrag.');
    expect(region.textContent).not.toMatch(/besser|schlechter|geringer|größer|Verbesserung/);
  });

  it('meldet ein fehlendes Objekt als Fehler und bietet es nicht zum Ansehen an', async () => {
    fetchPatientenfotos.mockResolvedValue([foto({ object_missing: true })]);
    seite();

    expect(await screen.findByText(/in der Ablage nicht auffindbar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ansehen/ })).not.toBeInTheDocument();
  });

  it('lässt die Verwaltung ansehen, aber weder aufnehmen noch löschen (Punkt 37)', async () => {
    fetchPatientenfotos.mockResolvedValue([foto()]);
    seite(['office']);

    expect(await screen.findByRole('button', { name: /^Ansehen/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Foto aufnehmen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });

  it('löscht erst nach einer Rückfrage', async () => {
    const user = userEvent.setup();
    fetchPatientenfotos.mockResolvedValue([foto()]);
    seite();

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(loescheDatei).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
    await waitFor(() => expect(loescheDatei).toHaveBeenCalledWith('f1'));
  });

  it('zeigt der Trainingsbetreuung nichts (§4.8)', () => {
    const { container } = seite(['trainer']);
    expect(container).toBeEmptyDOMElement();
    expect(fetchPatientenfotos).not.toHaveBeenCalled();
  });

  it('besteht die Barrierefreiheitsprüfung', async () => {
    fetchPatientenfotos.mockResolvedValue([foto(), foto({ id: 'f2', display_name: 'Schulter' })]);
    const { container } = seite();
    await screen.findByText('Schulter');
    await pruefeBarrierefreiheit(container);
  });
});
