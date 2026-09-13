import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
    prescription_id: null,
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

  it('zeigt Name, Art und Größe einer Datei', async () => {
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
    expect(screen.getByText(/Befund · 200 KB/)).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: 'Öffnen' }));

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
    expect(screen.queryByRole('button', { name: 'Öffnen' })).not.toBeInTheDocument();
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

  it('lehnt eine zu große Datei mit ihrer Größe ab', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await userEvent.upload(screen.getByLabelText('Datei'), pdf('Riesig.pdf', 11 * 1024 * 1024));

    expect(await screen.findByText(/mit 11.0 MB zu groß/)).toBeInTheDocument();
    expect(ladeDateiHoch).not.toHaveBeenCalled();
  });

  it('legt an einer Verordnung den Scan ab, ohne nach der Art zu fragen', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        prescriptionId="v1"
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    // Genau eine sinnvolle Art: keine Auswahl, aber die Sichtbarkeitsfolge
    // steht trotzdem da (ADR-017 Punkt 12).
    expect(screen.queryByLabelText('Art des Dokuments')).not.toBeInTheDocument();
    expect(screen.getByText('Verordnungsscan')).toBeInTheDocument();
    expect(screen.getByText(/nicht für die Verwaltung/)).toBeInTheDocument();

    await userEvent.upload(screen.getByLabelText('Datei'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Datei hinzufügen' }));

    await waitFor(() =>
      expect(ladeDateiHoch).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: PATIENT,
          prescriptionId: 'v1',
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

  it('sagt bei einer klinischen Art, wer sie danach nicht sieht', async () => {
    renderWithProviders(
      <Dateiliste
        patientId={PATIENT}
        user={testUser(['therapist'])}
        darfHinzufuegen
        leerHinweis="Nichts da."
      />,
    );

    await screen.findByText('Nichts da.');
    expect(screen.getByText(/nicht für die Verwaltung/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/Art des Dokuments/), 'einwilligung');
    expect(screen.getByText(/auch für die Verwaltung/)).toBeInTheDocument();
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

  describe('Löschen und korrigieren (DAT-002)', () => {
    it('löscht erst nach einer Rückfrage und sagt, was mit der Ablage passiert', async () => {
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

      // Die Rückfrage sagt beide Hälften: sofort aus der Akte, das Objekt
      // über den Löschauftrag (ADR-017 Punkt 25).
      expect(screen.getByText(/sofort aus der Akte entfernt/)).toBeInTheDocument();
      expect(screen.getByText(/Löschauftrag/)).toBeInTheDocument();
      expect(loescheDatei).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
      await waitFor(() => expect(loescheDatei).toHaveBeenCalledWith('d1'));
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
      expect(screen.queryByRole('button', { name: 'Art korrigieren' })).not.toBeInTheDocument();
    });

    it('korrigiert die Dokumentart und zeigt dabei die neue Sichtbarkeit', async () => {
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
      await userEvent.click(screen.getByRole('button', { name: 'Art korrigieren' }));

      const auswahl = screen.getByLabelText<HTMLSelectElement>(/Art des Dokuments/);
      // Die Datei hängt an keiner Verordnung - „Verordnungsscan" steht deshalb
      // gar nicht zur Wahl (ADR-017 Punkt 10).
      expect(Array.from(auswahl.options).map((o) => o.value)).not.toContain('verordnungsscan');

      await userEvent.selectOptions(auswahl, 'einwilligung');
      expect(screen.getByText(/auch für die Verwaltung/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Art übernehmen' }));
      await waitFor(() => expect(korrigiereDokumentart).toHaveBeenCalledWith('d1', 'einwilligung'));
    });

    it('bietet den Verordnungsscan nur an einer Datei mit Verordnung an', async () => {
      fetchPatientFiles.mockResolvedValue([datei({ prescription_id: 'v1' })]);

      renderWithProviders(
        <Dateiliste
          patientId={PATIENT}
          user={testUser(['therapist'])}
          prescriptionId="v1"
          darfHinzufuegen={false}
          leerHinweis="Nichts da."
        />,
      );

      await screen.findByText('Befund Schulter.pdf');
      await userEvent.click(screen.getByRole('button', { name: 'Art korrigieren' }));

      const auswahl = screen.getByLabelText<HTMLSelectElement>(/Art des Dokuments/);
      expect(Array.from(auswahl.options).map((o) => o.value)).toContain('verordnungsscan');
    });
  });
});
