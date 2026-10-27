import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type * as FotoApi from './patientenfotos';
import { renderWithProviders, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * Fotos im Verlauf (DOK-006, ADR-017 Abschnitt G).
 *
 * Geprüft wird, was die Oberfläche leisten muss und kein Server nachprüfen
 * kann: kein Dateiwähler für Fotos (Punkt 33), kein Verweis auf Vorrat und
 * keine Vorschau in der Liste (Punkte 15 und 40), die Ansicht aus dem
 * Speicher, die beim Schließen frei wird, und der Vergleich ohne Bewertung
 * (Punkt 39). Seit ABN-032 fragt die Aufnahme nicht nach dem Zweck: Jedes
 * neue Foto ist ein Dokumentationsfoto (ADR-017 Fassung 4 Punkt 56). Ob die
 * Rolle reicht, entscheidet die Datenbank
 * (`supabase/tests/documentation-photos.test.ts`).
 */

const PATIENT = '66666666-6666-4666-8666-000000000001';

const fetchPatientenfotos = vi.fn();
const ladePatientenfoto = vi.fn();
const speicherePatientenfoto = vi.fn();
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

type Nutzer = ReturnType<typeof userEvent.setup>;

/** „Foto aufnehmen" öffnet die Kamera sofort - ohne Wahl der Art (Punkt 56). */
async function aufnehmen(user: Nutzer): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Foto aufnehmen' }));
}

function seite(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(<Patientenfotos patientId={PATIENT} user={testUser(rollen)} />);
}

describe('Patientenfotos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPatientenfotos.mockResolvedValue([]);
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

  it('fragt nicht nach dem Zweck: jedes neue Foto ist ein Dokumentationsfoto (Punkt 56, ANN-316)', async () => {
    const user = userEvent.setup();
    seite();

    await aufnehmen(user);
    const dialog = await screen.findByRole('dialog', { name: 'Foto aufnehmen' });
    expect(within(dialog).queryByRole('radio')).toBeNull();
    expect(dialog).toHaveTextContent(
      'Teil der Dokumentation (Akte, zehn Jahre); löschen nur heute',
    );
    expect(dialog).toHaveTextContent('Kein Foto ersetzt einen Eintrag');
    expect(screen.queryByText(/Arbeitshilfe/)).toBeNull();

    await user.click(await within(dialog).findByRole('button', { name: 'Auslösen' }));
    await user.click(within(dialog).getByRole('button', { name: 'Foto verwenden' }));
    await user.click(screen.getByRole('button', { name: 'Foto speichern' }));
    await waitFor(() => expect(speicherePatientenfoto).toHaveBeenCalledTimes(1));
    expect((speicherePatientenfoto.mock.calls[0]![0] as { art: string }).art).toBe(
      'dokumentationsfoto',
    );
  });

  it('führt eine vorhandene Arbeitshilfe weiter in der Liste (Punkt 57)', async () => {
    fetchPatientenfotos.mockResolvedValue([foto()]);
    seite();
    expect(await screen.findByText('Knie rechts')).toBeInTheDocument();
    expect(screen.getByText(/Arbeitshilfe/)).toBeInTheDocument();
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
    const user = userEvent.setup();
    const { container } = seite();

    expect(await screen.findByText('Knie rechts')).toBeInTheDocument();
    // Zugeklappt als „Fotos (1)“ (BEF-058); ein Tipp zeigt die Liste.
    expect(screen.getByText('01.09.2026 · Anna Beispiel')).not.toBeVisible();
    await user.click(screen.getByText('Fotos (1)'));
    expect(screen.getByText('01.09.2026 · Anna Beispiel')).toBeVisible();
    expect(
      screen.getByText(/^Arbeitshilfe · wird spätestens am 01.09.2027 gelöscht/),
    ).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
    expect(ladePatientenfoto).not.toHaveBeenCalled();
  });

  it('steht ohne Fotos als eine Zeile da, ohne Kleingedrucktes (BEF-058)', async () => {
    fetchPatientenfotos.mockResolvedValue([]);
    seite();

    expect(await screen.findByText('Fotos: keine.')).toBeInTheDocument();
    expect(screen.queryByText(/weder herunterladen noch teilen/)).toBeNull();
    expect(screen.queryByText(/^Fotos \(/)).toBeNull();
  });

  it('klappt die Fotos auf, sobald ein neues dazukommt (BEF-058)', async () => {
    focusManager.setFocused(false);
    fetchPatientenfotos.mockResolvedValue([foto()]);
    seite();
    const zusammenfassung = await screen.findByText('Fotos (1)');
    expect(zusammenfassung.closest('details')).not.toHaveAttribute('open');

    fetchPatientenfotos.mockResolvedValue([foto(), foto({ id: 'f2', display_name: 'Knie links' })]);
    // Das Nachladen nach einer Aufnahme, hier über den Fensterfokus ausgelöst.
    act(() => focusManager.setFocused(true));
    const neu = await screen.findByText('Fotos (2)');
    expect(neu.closest('details')).toHaveAttribute('open');
    focusManager.setFocused(undefined);
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
    const user = userEvent.setup();
    seite();

    await user.click(await screen.findByText('Fotos (1)'));
    expect(screen.getByText(/^Dokumentationsfoto · Teil der Akte/)).toBeVisible();
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
