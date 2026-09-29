import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as FilesApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Die Dateiliste der Akte (DAT-001, ADR-017).
 *
 * Geprüft wird hier, was der Server **nicht** prüfen kann: dass die Oberfläche
 * keinen Verweis auf Vorrat erzeugt, dass eine fehlende Datei als Fehler
 * dasteht und dass ein abgelehntes Format gar nicht erst zum Hochladen führt.
 * Wer was sehen darf, entscheidet die Datenbank — dafür ist
 * `supabase/tests/patient-files.test.ts` da.
 */

const fetchPatientFiles = vi.fn();
const ladeDateiHoch = vi.fn();
const oeffneDatei = vi.fn();
const loescheDatei = vi.fn();
const korrigiereDokumentart = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof FilesApi>();
  return {
    ...actual,
    fetchPatientFiles: (id: string, verordnung?: string | null) =>
      fetchPatientFiles(id, verordnung) as Promise<FilesApi.PatientFile[]>,
    ladeDateiHoch: (auftrag: FilesApi.UploadAuftrag) => ladeDateiHoch(auftrag) as Promise<string>,
    oeffneDatei: (id: string) => oeffneDatei(id) as Promise<string>,
    loescheDatei: (id: string) => loescheDatei(id) as Promise<void>,
    korrigiereDokumentart: (id: string, art: string) =>
      korrigiereDokumentart(id, art) as Promise<void>,
  };
});

const { Dateiliste } = await import('./Dateiliste');

const PATIENT = '66666666-6666-4666-8666-000000000001';

function datei(rest: Partial<FilesApi.PatientFile> = {}): FilesApi.PatientFile {
  return {
    id: 'd1',
    treatment_basis_id: null,
    document_type: 'befund',
    is_clinical: true,
    display_name: 'Befund Schulter.pdf',
    mime_type: 'application/pdf',
    byte_size: 204_800,
    uploaded_at: '2026-09-13T08:00:00.000Z',
    uploaded_by_name: 'Anna Beispiel',
    object_missing: false,
    ...rest,
  };
}

function pdf(name = 'Rezept.pdf', groesse = 1024): File {
  const file = new File(['x'.repeat(groesse)], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: groesse });
  return file;
}

describe('Dateiliste', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPatientFiles.mockResolvedValue([]);
    ladeDateiHoch.mockResolvedValue('neu');
    oeffneDatei.mockResolvedValue('https://beispiel.invalid/signiert');
    loescheDatei.mockResolvedValue(undefined);
    korrigiereDokumentart.mockResolvedValue(undefined);
  });

  it('zeigt Name, Art, Größe und Tag einer Datei', async () => {
    fetchPatientFiles.mockResolvedValue([datei()]);

    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen={false}
        leerHinweis="Nichts da."
      />,
    );

    expect(await screen.findByText('Befund Schulter.pdf')).toBeInTheDocument();
    // Zweistellig wie bei den Fotos, in der Zeit der Praxis (WRT-15).
    expect(screen.getByText(/Befund · 200 KB · 13\.09\.2026 · Anna Beispiel/)).toBeInTheDocument();
    // Farbe ist nie allein Bedeutungsträger (Oberflächen-Checkliste Punkt 4).
    expect(screen.getByText('Klinisch')).toBeInTheDocument();
  });

  it('erzeugt den Verweis erst beim Tippen auf „Öffnen“ (ADR-017 Punkt 15)', async () => {
    fetchPatientFiles.mockResolvedValue([datei()]);
    const open = vi.fn();
    vi.stubGlobal('open', open);

    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen={false}
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Befund Schulter.pdf');
    // Die Liste allein hat noch keinen Verweis erzeugt - sonst stünde in jedem
    // Auditlog eine Ausstellung je angezeigter Zeile (Punkt 21).
    expect(oeffneDatei).not.toHaveBeenCalled();

    // Die Knopfliste der Vorlesesoftware nennt die Datei (DAT-24).
    await userEvent.click(screen.getByRole('button', { name: 'Öffnen: Befund Schulter.pdf' }));

    await waitFor(() => expect(oeffneDatei).toHaveBeenCalledWith('d1'));
    expect(open).toHaveBeenCalledWith(
      'https://beispiel.invalid/signiert',
      '_blank',
      'noopener,noreferrer',
    );
    vi.unstubAllGlobals();
  });

  it('meldet eine fehlende Datei als Fehler und bietet sie nicht zum Öffnen an', async () => {
    fetchPatientFiles.mockResolvedValue([datei({ object_missing: true })]);

    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen={false}
        leerHinweis="Nichts da."
      />,
    );

    expect(await screen.findByText(/in der Ablage nicht auffindbar/)).toBeInTheDocument();
    expect(screen.getByText(/steht unter „Aufbewahrung“/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Öffnen/ })).not.toBeInTheDocument();
  });

  it('nennt beim leeren Bereich, was zu tun ist', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen={false}
        leerHinweis="Noch liegt nichts vor."
      />,
    );
    expect(await screen.findByText('Noch liegt nichts vor.')).toBeInTheDocument();
  });

  it('meldet einen Ladefehler mit einem Weg hinaus (DAT-13, WRT-01)', async () => {
    const user = userEvent.setup();
    fetchPatientFiles.mockRejectedValueOnce(new Error('Die Dateien konnten nicht geladen werden.'));

    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen={false}
        leerHinweis="Nichts da."
      />,
    );

    expect(await screen.findByText('Die Dateien konnten nicht geladen werden.')).toBeVisible();
    expect(screen.getByText('Bitte die Verbindung prüfen und erneut versuchen.')).toBeVisible();
    expect(screen.queryByText(/angemeldet/)).toBeNull();

    fetchPatientFiles.mockResolvedValue([datei()]);
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByText('Befund Schulter.pdf')).toBeInTheDocument();
  });

  it('zeigt kein Uploadfeld, wo nicht hinzugefügt werden darf', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['office'])}
        darfHinzufuegen={false}
        leerHinweis="Nichts da."
      />,
    );
    await screen.findByText('Nichts da.');
    expect(screen.queryByText('Datei hinzufügen')).not.toBeInTheDocument();
  });

  it('beschraenkt den Dateiwaehler auf die erlaubten Formate', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    // Erste von drei Durchsetzungen (ADR-017 Punkt 18). Sie ist die
    // bequemste und die schwächste: `accept` filtert den Auswahldialog,
    // nicht das Ablegen per Drag-and-drop. Die zweite steht in
    // `dateiAblehnungsgrund` (siehe dokumentarten.test.ts), die dritte am
    // Server.
    expect(screen.getByLabelText('Datei')).toHaveAttribute(
      'accept',
      '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
    );
  });

  it('lehnt eine zu große Datei mit ihrer Größe ab, am Feld und angesagt (DAT-12)', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    const feld = screen.getByLabelText('Datei');
    await userEvent.upload(feld, pdf('Riesig.pdf', 11 * 1024 * 1024));

    // Der Grund hängt am Feld - neben dem Hinweis auf die Formate - und wird
    // angesagt, weil er beim Wählen entsteht und nicht beim Absenden.
    await waitFor(() => expect(feld).toHaveAccessibleDescription(/mit 11,0 MB zu groß/));
    expect(feld).toHaveAccessibleDescription(/PDF, JPEG oder PNG bis 10 MB/);
    expect(feld).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(/mit 11,0 MB zu groß/);
    expect(ladeDateiHoch).not.toHaveBeenCalled();
  });

  it('legt an einer Verordnung den Scan ab, ohne nach der Art zu fragen', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        grundlageId="v1"
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    // Genau eine sinnvolle Art: keine Auswahl, aber die Sichtbarkeitsfolge
    // steht trotzdem da (ADR-017 Punkt 12).
    expect(screen.queryByLabelText('Art des Dokuments')).not.toBeInTheDocument();
    expect(screen.getByText('Verordnungsscan')).toBeInTheDocument();
    expect(screen.getByText(/auch das Praxismanagement/)).toBeInTheDocument();

    await userEvent.upload(screen.getByLabelText('Datei'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Datei hinzufügen' }));

    await waitFor(() =>
      expect(ladeDateiHoch).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: PATIENT,
          grundlageId: 'v1',
          documentType: 'verordnungsscan',
          displayName: 'Rezept.pdf',
        }),
      ),
    );
  });

  it('bietet der Verwaltung nur organisatorische Dokumentarten an', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['office'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    const auswahl = screen.getByLabelText<HTMLSelectElement>(/Art des Dokuments/);
    const arten = Array.from(auswahl.options).map((o) => o.value);
    expect(arten).toEqual(['einwilligung', 'vertrag']);
  });

  it('sagt bei jeder Art, wer sie sieht und wer sie pflegt (E15)', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    expect(screen.getByText(/hinzufügen und löschen nur/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/Art des Dokuments/), 'einwilligung');
    expect(screen.getByText(/auch das Praxismanagement/)).toBeInTheDocument();
  });

  it('meldet einen gescheiterten Upload im Klartext', async () => {
    ladeDateiHoch.mockRejectedValue(new Error('Die Datei konnte nicht übertragen werden.'));

    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    await userEvent.upload(screen.getByLabelText('Datei'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Datei hinzufügen' }));

    expect(
      await screen.findByText('Die Datei konnte nicht übertragen werden.'),
    ).toBeInTheDocument();
  });

  it('bestätigt einen erfolgreichen Upload mit dem Namen', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    await userEvent.upload(screen.getByLabelText('Datei'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Datei hinzufügen' }));

    expect(await screen.findByText(/„Rezept.pdf“ ist in der Akte./)).toBeInTheDocument();
  });

  it('hält während des Hochladens fest, was hochgeladen wird (DAT-09)', async () => {
    ladeDateiHoch.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    await userEvent.upload(screen.getByLabelText('Datei'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Datei hinzufügen' }));

    expect(await screen.findByRole('button', { name: 'Wird hinzugefügt …' })).toBeDisabled();
    expect(screen.getByLabelText('Datei')).toBeDisabled();
    expect(screen.getByLabelText(/Art des Dokuments/)).toBeDisabled();
    expect(screen.getByLabelText('Name in der Akte')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Verwerfen' })).toBeDisabled();
  });

  it('verwirft eine gewählte Datei, ohne sie hochzuladen (DAT-08)', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    expect(screen.queryByRole('button', { name: 'Verwerfen' })).toBeNull();
    await userEvent.upload(screen.getByLabelText('Datei'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));

    expect(screen.getByRole('button', { name: 'Datei hinzufügen' })).toBeDisabled();
    expect(screen.queryByLabelText('Name in der Akte')).toBeNull();
    expect(ladeDateiHoch).not.toHaveBeenCalled();
  });

  it('stellt das Hinzufügen an der Verordnung eingeklappt und knapp dar (VER-01)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        grundlageId="v1"
        darfHinzufuegen
        hinzufuegenEingeklappt="Scan hinzufügen"
        leerKompakt
        leerHinweis="Noch kein Scan."
      />,
    );

    expect(await screen.findByText('Noch kein Scan.')).toBeInTheDocument();
    // Ein Satz statt des großen Leerzustands.
    expect(screen.queryByText('Keine Datei')).toBeNull();
    const kopf = screen.getByText('Scan hinzufügen');
    expect(kopf.closest('details')).not.toHaveAttribute('open');
    await user.click(kopf);
    expect(screen.getByLabelText('Datei')).toBeVisible();
  });

  describe('Löschen und korrigieren (DAT-002)', () => {
    it('löscht erst nach einer Rückfrage und sagt, was geschieht', async () => {
      fetchPatientFiles.mockResolvedValue([datei()]);

      renderWithProviders(
        <Dateiliste
          patientId={PATIENT}
          user={testUser(['therapist'])}
          darfHinzufuegen
          leerHinweis="Nichts da."
        />,
      );

      await screen.findByText('Befund Schulter.pdf');
      await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));

      // Was für die Person zählt, ohne Innenleben der Ablage (DAT-23).
      const frage = screen.getByRole('group', { name: '„Befund Schulter.pdf“ löschen' });
      expect(frage).toHaveTextContent(/sofort aus der Akte entfernt/);
      expect(frage).toHaveTextContent(/lässt sich nicht rückgängig machen/);
      expect(frage.textContent).not.toMatch(/Löschauftrag|Aufbewahrung und Löschung/);
      expect(loescheDatei).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
      await waitFor(() => expect(loescheDatei).toHaveBeenCalledWith('d1'));
    });

    it('zeigt einen gescheiterten Löschversuch im offenen Kasten (ZST-06)', async () => {
      loescheDatei.mockRejectedValue(new Error('Die Datei konnte nicht gelöscht werden.'));
      fetchPatientFiles.mockResolvedValue([datei()]);

      renderWithProviders(
        <Dateiliste
          patientId={PATIENT}
          user={testUser(['therapist'])}
          darfHinzufuegen
          leerHinweis="Nichts da."
        />,
      );

      await screen.findByText('Befund Schulter.pdf');
      await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
      await userEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }));

      const frage = screen.getByRole('group', { name: '„Befund Schulter.pdf“ löschen' });
      expect(await within(frage).findByRole('alert')).toHaveTextContent(
        'Die Datei konnte nicht gelöscht werden.',
      );
    });

    it('bietet der Verwaltung weder Löschen noch Art korrigieren an', async () => {
      fetchPatientFiles.mockResolvedValue([
        datei({ document_type: 'einwilligung', is_clinical: false }),
      ]);

      renderWithProviders(
        <Dateiliste
          patientId={PATIENT}
          user={testUser(['office'])}
          darfHinzufuegen={false}
          leerHinweis="Nichts da."
        />,
      );

      await screen.findByText('Befund Schulter.pdf');
      expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Art korrigieren/ })).not.toBeInTheDocument();
    });

    it('zeigt der Verwaltung klinische Dateien, laesst sie aber nur organisatorische loeschen (E15)', async () => {
      fetchPatientFiles.mockResolvedValue([
        datei(),
        datei({
          id: 'd2',
          document_type: 'einwilligung',
          is_clinical: false,
          display_name: 'Einwilligung.pdf',
        }),
      ]);

      renderWithProviders(
        <Dateiliste
          patientId={PATIENT}
          user={testUser(['office'])}
          darfHinzufuegen
          leerHinweis="Nichts da."
        />,
      );

      // Beide Dateien sind sichtbar und zu öffnen (ADR-004 Fassung 2 Punkt 3) ...
      expect(await screen.findByText('Befund Schulter.pdf')).toBeInTheDocument();
      expect(screen.getByText('Einwilligung.pdf')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^Öffnen/ })).toHaveLength(2);
      // ... gelöscht wird nur die organisatorische, korrigiert keine (Punkt 13).
      expect(screen.getAllByRole('button', { name: 'Löschen' })).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /^Art korrigieren/ })).not.toBeInTheDocument();
    });

    it('korrigiert die Dokumentart, zeigt die neue Sichtbarkeit und meldet das Ergebnis', async () => {
      fetchPatientFiles.mockResolvedValue([datei()]);

      // Ohne Uploadfeld, damit es genau eine Auswahl „Art des Dokuments" gibt.
      renderWithProviders(
        <Dateiliste
          patientId={PATIENT}
          user={testUser(['therapist'])}
          darfHinzufuegen={false}
          leerHinweis="Nichts da."
        />,
      );

      await screen.findByText('Befund Schulter.pdf');
      await userEvent.click(
        screen.getByRole('button', { name: 'Art korrigieren: Befund Schulter.pdf' }),
      );

      const auswahl = screen.getByLabelText<HTMLSelectElement>(/Art des Dokuments/);
      // Der Fokus steht in der Auswahl, wie bei einer Rückfrage (DAT-11).
      expect(auswahl).toHaveFocus();
      // Die Datei hängt an keiner Verordnung - „Verordnungsscan" steht deshalb
      // gar nicht zur Wahl (ADR-017 Punkt 10).
      expect(Array.from(auswahl.options).map((o) => o.value)).not.toContain('verordnungsscan');

      await userEvent.selectOptions(auswahl, 'einwilligung');
      expect(screen.getByText(/auch das Praxismanagement/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Art übernehmen' }));
      await waitFor(() => expect(korrigiereDokumentart).toHaveBeenCalledWith('d1', 'einwilligung'));
      // Danach steht da, was sich geändert hat, und der Fokus ist zurück (DAT-09, DAT-11).
      expect(await screen.findByText('Art geändert: Befund → Einwilligung.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Art korrigieren/ })).toHaveFocus();
    });

    it('gibt den Fokus beim Abbrechen an „Art korrigieren" zurück (DAT-11)', async () => {
      fetchPatientFiles.mockResolvedValue([datei()]);
      renderWithProviders(
        <Dateiliste
          patientId={PATIENT}
          user={testUser(['therapist'])}
          darfHinzufuegen={false}
          leerHinweis="Nichts da."
        />,
      );

      await screen.findByText('Befund Schulter.pdf');
      await userEvent.click(screen.getByRole('button', { name: /^Art korrigieren/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

      expect(screen.queryByLabelText(/Art des Dokuments/)).toBeNull();
      expect(screen.getByRole('button', { name: /^Art korrigieren/ })).toHaveFocus();
      expect(korrigiereDokumentart).not.toHaveBeenCalled();
    });

    it('bietet den Verordnungsscan nur an einer Datei mit Verordnung an', async () => {
      fetchPatientFiles.mockResolvedValue([datei({ treatment_basis_id: 'v1' })]);

      renderWithProviders(
        <Dateiliste
          patientId={PATIENT}
          user={testUser(['therapist'])}
          grundlageId="v1"
          darfHinzufuegen={false}
          leerHinweis="Nichts da."
        />,
      );

      await screen.findByText('Befund Schulter.pdf');
      await userEvent.click(screen.getByRole('button', { name: /^Art korrigieren/ }));

      const auswahl = screen.getByLabelText<HTMLSelectElement>(/Art des Dokuments/);
      expect(Array.from(auswahl.options).map((o) => o.value)).toContain('verordnungsscan');
    });
  });
});

/**
 * Ein Blatt fotografieren (DOK-006, ADR-017 Punkt 33): Für ein Blatt auf Papier
 * ist der Kameradialog der angebotene Weg, der Dateiwähler bleibt daneben. Die
 * Kamera ist eine Nachbildung; was der Dialog selbst leistet, prüft
 * `Kameradialog.test.tsx`.
 *
 * Der Knopf heißt nicht „Foto aufnehmen" wie beim Patientenfoto (DAT-01):
 * „Dokument fotografieren" in der Akte, „Rezept fotografieren" an der
 * Verordnung.
 */
describe('Dateiliste — Blatt fotografieren', () => {
  const getUserMedia = vi.fn();
  const freigeben = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchPatientFiles.mockResolvedValue([]);
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
    URL.revokeObjectURL = freigeben;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });

  async function fotografieren(knopf: string) {
    await userEvent.click(await screen.findByRole('button', { name: knopf }));
    await userEvent.click(await screen.findByRole('button', { name: 'Auslösen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Foto verwenden' }));
  }

  it('legt ein Foto aus der Kamera als Verordnungsscan ab, mit Datum als Namen', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        grundlageId="v1"
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await fotografieren('Rezept fotografieren');
    expect(screen.getByText('Foto aus der Kamera – noch nicht hinzugefügt')).toBeInTheDocument();
    const name = screen.getByLabelText('Name in der Akte');
    expect((name as HTMLInputElement).value).toMatch(/^Foto vom \d{2}\.\d{2}\.\d{4}$/);

    await userEvent.click(screen.getByRole('button', { name: 'Datei hinzufügen' }));

    await waitFor(() => expect(ladeDateiHoch).toHaveBeenCalledTimes(1));
    const auftrag = ladeDateiHoch.mock.calls[0]![0] as FilesApi.UploadAuftrag;
    expect(auftrag.documentType).toBe('verordnungsscan');
    expect(auftrag.grundlageId).toBe('v1');
    expect(auftrag.datei.type).toBe('image/jpeg');
    expect(auftrag.displayName).toMatch(/^Foto vom /);
  });

  it('heißt in der Akte „Dokument fotografieren", nicht wie das Patientenfoto (DAT-01)', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    expect(await screen.findByRole('button', { name: 'Dokument fotografieren' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Foto aufnehmen' })).toBeNull();
  });

  it('zeigt ein Kamerafoto mit Vorschau statt des leeren Dateifelds und lässt es verwerfen (DAT-08)', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await fotografieren('Dokument fotografieren');
    expect(screen.queryByLabelText('Datei')).toBeNull();
    expect(
      screen.getByRole('img', { name: 'Foto aus der Kamera, noch nicht hinzugefügt' }),
    ).toHaveAttribute('src', 'blob:vorschau');

    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(screen.getByLabelText('Datei')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(freigeben).toHaveBeenCalledWith('blob:vorschau');
    expect(ladeDateiHoch).not.toHaveBeenCalled();
  });

  it('behält das Foto nach einem gescheiterten Upload und versucht es erneut', async () => {
    ladeDateiHoch
      .mockRejectedValueOnce(new Error('Die Datei konnte nicht übertragen werden.'))
      .mockResolvedValueOnce('neu');
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await fotografieren('Dokument fotografieren');
    await userEvent.click(screen.getByRole('button', { name: 'Datei hinzufügen' }));
    expect(await screen.findByText(/Das Foto ist noch da/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Datei hinzufügen' }));
    expect(await screen.findByText(/ist in der Akte/)).toBeInTheDocument();
    expect(ladeDateiHoch).toHaveBeenCalledTimes(2);
    expect(ladeDateiHoch.mock.calls[1]![0]).toEqual(ladeDateiHoch.mock.calls[0]![0]);
  });

  it('bietet ohne Kamera nur den Dateiwähler an', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    expect(screen.getByLabelText('Datei')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fotografieren/ })).not.toBeInTheDocument();
  });

  it('bietet am Rechner ohne Kamera das Fotografieren gar nicht erst an (DAT-25)', async () => {
    const geraete = vi.fn().mockResolvedValue([{ kind: 'audioinput' }]);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, enumerateDevices: geraete },
    });
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    await waitFor(() => expect(geraete).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /fotografieren/ })).not.toBeInTheDocument();
  });
});
