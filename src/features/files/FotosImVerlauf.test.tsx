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

const { Patientenfotos } = await import('./FotosImVerlauf');

function foto(rest: Partial<FotoApi.Patientenfoto> = {}): FotoApi.Patientenfoto {
  return {
    id: 'f1',
    document_type: 'patientenfoto',
    display_name: 'Knie rechts',
    taken_at: '2026-09-01T08:00:00.000Z',
    taken_by_name: 'Anna Beispiel',
    delete_after: '2027-09-01T08:00:00.000Z',
    deletable: true,
    object_missing: false,
    verified_at: null,
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

const DOKU = /^Teil der Dokumentation/;
const HILFE = /^Arbeitshilfe \(/;

type Nutzer = ReturnType<typeof userEvent.setup>;

/**
 * Öffnet das Fenster „Foto aufnehmen" (Akte entschlacken, 2026-10-03): Die
 * Wahl der Art steht dort, nicht mehr in der Karte.
 */
async function wahlOeffnen(user: Nutzer): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: 'Foto aufnehmen' }));
  return screen.findByRole('dialog', { name: 'Foto aufnehmen' });
}

async function waehlen(user: Nutzer, art: RegExp = DOKU): Promise<HTMLElement> {
  const fenster = await wahlOeffnen(user);
  await user.click(within(fenster).getByRole('radio', { name: art }));
  return fenster;
}

/** Wählt die Art und öffnet die Kamera. */
async function aufnehmen(user: Nutzer, art: RegExp = DOKU): Promise<void> {
  const fenster = await waehlen(user, art);
  await user.click(within(fenster).getByRole('button', { name: 'Foto aufnehmen' }));
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

  it('bietet ohne Einwilligung nur das Dokumentationsfoto an und sagt, warum (ADR-017 Punkt 44)', async () => {
    const user = userEvent.setup();
    fetchDatenschutzvermerke.mockResolvedValue([]);
    seite();

    const fenster = await wahlOeffnen(user);
    expect(within(fenster).getByRole('radio', { name: HILFE })).toBeDisabled();
    expect(within(fenster).getByRole('radio', { name: DOKU })).toBeEnabled();
    expect(within(fenster).getByText(/Nicht möglich: Es ist keine Einwilligung/)).toBeVisible();
    expect(within(fenster).getByRole('link', { name: 'Zu den Einwilligungen' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/stammdaten#einwilligungen`,
    );
    expect(fenster).toHaveTextContent('Kein Foto ersetzt einen Eintrag');
  });

  it('nennt eine Ablehnung als erledigten Stand', async () => {
    const user = userEvent.setup();
    fetchDatenschutzvermerke.mockResolvedValue([
      { ...ERTEILT, record_kind: 'consent_refused', occurred_on: '2026-09-02' },
    ]);
    seite();
    const fenster = await wahlOeffnen(user);
    expect(fenster).toHaveTextContent(
      'Nicht möglich: Die Einwilligung zu Arbeitshilfen wurde am 02.09.2026 abgelehnt.',
    );
    expect(within(fenster).getByRole('radio', { name: HILFE })).toBeDisabled();
  });

  it('startet ohne Vorauswahl: Aufnehmen erst nach der Wahl, danach wieder ohne (Punkt 44)', async () => {
    const user = userEvent.setup();
    seite();

    let fenster = await wahlOeffnen(user);
    const weiter = within(fenster).getByRole('button', { name: 'Foto aufnehmen' });
    expect(within(fenster).getByRole('radio', { name: DOKU })).not.toBeChecked();
    expect(within(fenster).getByRole('radio', { name: HILFE })).not.toBeChecked();
    expect(weiter).toBeDisabled();

    await user.click(within(fenster).getByRole('radio', { name: HILFE }));
    expect(weiter).toBeEnabled();
    await user.click(weiter);
    await user.click(await screen.findByRole('button', { name: 'Auslösen' }));
    await user.click(screen.getByRole('button', { name: 'Foto verwenden' }));
    await user.click(screen.getByRole('button', { name: 'Foto speichern' }));

    await waitFor(() => expect(speicherePatientenfoto).toHaveBeenCalledTimes(1));
    expect((speicherePatientenfoto.mock.calls[0]![0] as { art: string }).art).toBe('patientenfoto');
    expect(await screen.findByText(/ist gespeichert/)).toBeInTheDocument();
    fenster = await wahlOeffnen(user);
    expect(within(fenster).getByRole('radio', { name: HILFE })).not.toBeChecked();
    expect(within(fenster).getByRole('button', { name: 'Foto aufnehmen' })).toBeDisabled();
  });

  it('nimmt ein Foto nur über die Kamera auf - nirgends ein Dateiwähler (Punkt 33)', async () => {
    const user = userEvent.setup();
    const { container } = seite();

    await aufnehmen(user);
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
      art: string;
      anzeigename: string;
      foto: Blob;
    };
    expect(auftrag.patientId).toBe(PATIENT);
    expect(auftrag.art).toBe('dokumentationsfoto');
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

    await aufnehmen(user);
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
    expect(screen.getByText('01.09.2026 · Anna Beispiel')).toBeVisible();
    expect(
      screen.getByText(/^Arbeitshilfe · wird spätestens am 01.09.2027 gelöscht/),
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

  it('führt ein Dokumentationsfoto als Teil der Akte, ohne Löschen nach dem Aufnahmetag (Punkt 48)', async () => {
    fetchPatientenfotos.mockResolvedValue([
      foto({ document_type: 'dokumentationsfoto', delete_after: null, deletable: false }),
    ]);
    seite();

    expect(await screen.findByText(/^Dokumentationsfoto · Teil der Akte/)).toBeVisible();
    expect(screen.queryByText(/wird spätestens/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });

  it('nennt beim Löschen eines Dokumentationsfotos am Aufnahmetag die Grenze', async () => {
    const user = userEvent.setup();
    fetchPatientenfotos.mockResolvedValue([
      foto({ document_type: 'dokumentationsfoto', delete_after: null, deletable: true }),
    ]);
    seite();

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(screen.getByRole('group', { name: '„Knie rechts“ löschen' })).toHaveTextContent(
      'nur am Tag der Aufnahme löschen',
    );
  });

  it('löscht erst nach einer Rückfrage', async () => {
    const user = userEvent.setup();
    fetchPatientenfotos.mockResolvedValue([foto()]);
    seite();

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    const frage = screen.getByRole('group', { name: '„Knie rechts“ löschen' });
    // Was für die Person zählt, ohne Innenleben der Ablage (DAT-23).
    expect(frage).toHaveTextContent('lässt sich nicht rückgängig machen');
    expect(frage.textContent).not.toMatch(/Löschauftrag/);
    expect(loescheDatei).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
    await waitFor(() => expect(loescheDatei).toHaveBeenCalledWith('f1'));
  });

  it('zeigt einen gescheiterten Löschversuch im offenen Kasten (ZST-06)', async () => {
    const user = userEvent.setup();
    loescheDatei.mockRejectedValue(new Error('Das Foto konnte nicht gelöscht werden.'));
    fetchPatientenfotos.mockResolvedValue([foto()]);
    seite();

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
    const frage = screen.getByRole('group', { name: '„Knie rechts“ löschen' });
    expect(await within(frage).findByRole('alert')).toHaveTextContent(
      'Das Foto konnte nicht gelöscht werden.',
    );
  });

  describe('Zustände (UXR-009)', () => {
    it('behauptet ohne geladene Vermerke keine fehlende Einwilligung (DAT-03)', async () => {
      const user = userEvent.setup();
      fetchDatenschutzvermerke.mockRejectedValueOnce(new Error('synthetisch'));
      fetchPatientenfotos.mockResolvedValue([foto()]);
      seite();

      expect(
        await screen.findByText('Der Stand der Einwilligung konnte nicht geladen werden.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Es ist keine Einwilligung/)).toBeNull();
      // Das Dokumentationsfoto braucht keine Einwilligung; die Arbeitshilfe
      // bleibt zu, bis der Stand geladen ist.
      let fenster = await wahlOeffnen(user);
      expect(within(fenster).getByRole('radio', { name: HILFE })).toBeDisabled();
      expect(within(fenster).getByRole('radio', { name: DOKU })).toBeEnabled();
      expect(fenster).not.toHaveTextContent('Es ist keine Einwilligung');
      await user.click(within(fenster).getByRole('button', { name: 'Abbrechen' }));

      fetchDatenschutzvermerke.mockResolvedValue([ERTEILT]);
      await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
      await waitFor(() =>
        expect(
          screen.queryByText('Der Stand der Einwilligung konnte nicht geladen werden.'),
        ).toBeNull(),
      );
      fenster = await wahlOeffnen(user);
      expect(fenster).toHaveTextContent('Einwilligung erteilt am 30.08.2026');
      expect(within(fenster).getByRole('radio', { name: HILFE })).toBeEnabled();
    });

    it('lässt, solange die Einwilligung lädt, noch nicht aufnehmen', async () => {
      fetchDatenschutzvermerke.mockReturnValue(new Promise(() => undefined));
      seite();
      expect(await screen.findByRole('button', { name: 'Foto aufnehmen' })).toBeDisabled();
      expect(screen.queryByText(/Keine Einwilligung vermerkt/)).toBeNull();
    });

    it('meldet einen Ladefehler der Liste mit einem neuen Versuch (DAT-13)', async () => {
      const user = userEvent.setup();
      fetchPatientenfotos.mockRejectedValueOnce(new Error('synthetisch'));
      seite();

      expect(await screen.findByText('Die Fotos konnten nicht geladen werden.')).toBeVisible();
      expect(screen.getByText('Bitte die Verbindung prüfen und erneut versuchen.')).toBeVisible();
      fetchPatientenfotos.mockResolvedValue([foto()]);
      await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
      expect(await screen.findByText('Knie rechts')).toBeInTheDocument();
    });

    it('zeigt das Laden an der Zeile und führt danach zur Ansicht (DAT-06, DAT-11)', async () => {
      const user = userEvent.setup();
      let fertig: (bild: Blob) => void = () => undefined;
      ladePatientenfoto.mockReturnValue(new Promise<Blob>((erledigt) => (fertig = erledigt)));
      fetchPatientenfotos.mockResolvedValue([foto()]);
      seite();

      const ansehen = await screen.findByRole('button', { name: /^Ansehen/ });
      await user.click(ansehen);
      const zeile = ansehen.closest('li')!;
      expect(within(zeile).getByText('Foto wird geladen …')).toBeInTheDocument();

      fertig(new Blob(['jpeg'], { type: 'image/jpeg' }));
      const ansicht = await screen.findByRole('region', { name: 'Fotoansicht' });
      await waitFor(() => expect(ansicht).toHaveFocus());
      expect(within(zeile).queryByText('Foto wird geladen …')).toBeNull();

      await user.click(within(ansicht).getByRole('button', { name: 'Schließen' }));
      expect(ansehen).toHaveFocus();
    });

    it('führt nach „Foto verwenden" auf „Foto speichern" (DAT-11)', async () => {
      const user = userEvent.setup();
      seite();

      await aufnehmen(user);
      await user.click(await screen.findByRole('button', { name: 'Auslösen' }));
      await user.click(screen.getByRole('button', { name: 'Foto verwenden' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Foto speichern' })).toHaveFocus(),
      );
      expect(
        screen.getByRole('heading', { level: 3, name: 'Neues Foto · Dokumentationsfoto' }),
      ).toBeInTheDocument();
    });

    it('bietet am Rechner ohne Kamera keine Aufnahme an und sagt, warum (DAT-25)', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: vi.fn(),
          enumerateDevices: vi.fn().mockResolvedValue([{ kind: 'audioinput' }]),
        },
      });
      seite();

      expect(
        await screen.findByText(/Auf diesem Gerät wurde keine Kamera gefunden/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Foto aufnehmen' })).toBeNull();
    });
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
