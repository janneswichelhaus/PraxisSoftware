import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type * as FilesApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import { DOKUMENTARTEN, aktenortDerDatei, dateibereich } from './dokumentarten';

/**
 * Die Dateien der Akte nach dem Wegfall des Bereichs „Dateien" (AKTE-007).
 *
 * Die Frage dahinter: Ist jede Datei, die bisher unter „Dateien" stand, nach
 * dem Umbau in genau einem Reiter zu finden - nicht in keinem und nicht in
 * zweien?
 */

const fetchPatientFiles = vi.fn();
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof FilesApi>();
  return {
    ...actual,
    fetchPatientFiles: (id: string, verordnung?: string | null) =>
      fetchPatientFiles(id, verordnung) as Promise<FilesApi.PatientFile[]>,
  };
});

const { AnmeldebogenDateien, DokuDateien, OffeneVerordnungsfotos, SonstigeDateien } =
  await import('./Aktendateien');

const PATIENT = '66666666-6666-4666-8666-000000000001';
const GRUNDLAGE = '99999999-9999-4999-8999-000000000001';

function datei(art: string, name: string, grundlage: string | null = null): FilesApi.PatientFile {
  return {
    id: `id-${name}`,
    treatment_basis_id: grundlage,
    document_type: art,
    is_clinical: !['einwilligung', 'vertrag'].includes(art),
    display_name: name,
    mime_type: 'application/pdf',
    byte_size: 1024,
    uploaded_at: '2026-09-13T08:00:00.000Z',
    uploaded_by_name: 'Anna Beispiel',
    object_missing: false,
    verified_at: null,
  };
}

/**
 * Was `list_patient_files` bisher dem Bereich „Dateien" lieferte: jede Art
 * außer den beiden Fotoarten (die stehen seit DOK-006 unter „Fotos" im
 * Verlauf, heute in der Doku). Dazu eine Art, die niemand zugeordnet hat.
 */
const BESTAND = [
  datei('verordnungsscan', 'Scan offen.jpg'),
  datei('verordnungsscan', 'Scan zugeordnet.jpg', GRUNDLAGE),
  datei('befund', 'Befund Knie.pdf'),
  datei('arztbrief', 'Arztbrief.pdf'),
  datei('klinisches_bild', 'MRT.pdf'),
  datei('einwilligung', 'Einwilligung.pdf'),
  datei('vertrag', 'Vertrag.pdf'),
  datei('kuenftige_art', 'Unbekannt.pdf'),
];

describe('Dateien je Reiter (AKTE-007)', () => {
  beforeEach(() => {
    fetchPatientFiles.mockReset().mockResolvedValue(BESTAND);
  });

  it('ordnet jeder Dokumentart genau einen Bereich zu, und Unbekanntes den sonstigen', () => {
    for (const art of DOKUMENTARTEN) {
      expect(['grundlagen', 'doku', 'anmeldebogen']).toContain(dateibereich(art));
    }
    expect(dateibereich('kuenftige_art')).toBe('sonstige');
    expect(dateibereich('patientenfoto')).toBe('doku');
    expect(dateibereich('verordnungsscan')).toBe('grundlagen');
    expect(dateibereich('einwilligung')).toBe('anmeldebogen');
  });

  it('führt jede Art in ihren Reiter', () => {
    expect(aktenortDerDatei(PATIENT, 'befund')).toBe(`/patienten/${PATIENT}/doku`);
    expect(aktenortDerDatei(PATIENT, 'verordnungsscan')).toBe(`/patienten/${PATIENT}/verordnungen`);
    expect(aktenortDerDatei(PATIENT, 'vertrag')).toBe(
      `/patienten/${PATIENT}/stammdaten#anmeldebogen`,
    );
    expect(aktenortDerDatei(PATIENT, 'kuenftige_art')).toBe(`/patienten/${PATIENT}/stammdaten`);
  });

  it('zeigt jede bisherige Datei in genau einem Reiter', async () => {
    const nutzer = testUser(['therapist']);
    // Die vier Ausschnitte, wie sie in Doku, Stammdaten und
    // Behandlungsgrundlagen stehen - gemeinsam gerendert, damit eine doppelte
    // Datei auffällt.
    renderWithProviders(
      <>
        <div data-reiter="Doku">
          <DokuDateien patientId={PATIENT} user={nutzer} />
        </div>
        <div data-reiter="Stammdaten">
          <AnmeldebogenDateien patientId={PATIENT} user={nutzer} />
          <SonstigeDateien patientId={PATIENT} user={nutzer} />
        </div>
        <div data-reiter="Behandlungsgrundlagen">
          <OffeneVerordnungsfotos patientId={PATIENT} user={nutzer} />
        </div>
      </>,
    );

    await screen.findByText('Befund Knie.pdf');
    const ort = (name: string) =>
      screen.getAllByText(name).map((el) => el.closest('[data-reiter]'));

    for (const name of ['Befund Knie.pdf', 'Arztbrief.pdf', 'MRT.pdf']) {
      expect(
        ort(name).map((s) => s?.getAttribute('data-reiter')),
        name,
      ).toEqual(['Doku']);
    }
    for (const name of ['Einwilligung.pdf', 'Vertrag.pdf', 'Unbekannt.pdf']) {
      expect(
        ort(name).map((s) => s?.getAttribute('data-reiter')),
        name,
      ).toEqual(['Stammdaten']);
    }
    expect(ort('Scan offen.jpg').map((s) => s?.getAttribute('data-reiter'))).toEqual([
      'Behandlungsgrundlagen',
    ]);
    // Der zugeordnete Scan steht an seiner Grundlage (eigene Abfrage mit der
    // Grundlage), nicht ein zweites Mal hier.
    expect(screen.queryByText('Scan zugeordnet.jpg')).toBeNull();
    expect(screen.getByText('Sonstige Dateien')).toBeInTheDocument();
    expect(screen.getByText('Verordnungsfotos ohne Grundlage')).toBeInTheDocument();
  });

  it('blendet „Sonstige Dateien" und offene Scans aus, wenn es keine gibt', async () => {
    fetchPatientFiles.mockResolvedValue([datei('befund', 'Befund Knie.pdf')]);
    const nutzer = testUser(['office']);
    renderWithProviders(
      <>
        <DokuDateien patientId={PATIENT} user={nutzer} />
        <SonstigeDateien patientId={PATIENT} user={nutzer} />
        <OffeneVerordnungsfotos patientId={PATIENT} user={nutzer} />
      </>,
    );
    await screen.findByText('Befund Knie.pdf');
    expect(screen.queryByText('Sonstige Dateien')).toBeNull();
    expect(screen.queryByText('Verordnungsfotos ohne Grundlage')).toBeNull();
  });

  it('bietet in der Doku nur klinische Arten an - und dem Praxismanagement kein Hinzufügen', async () => {
    fetchPatientFiles.mockResolvedValue([]);
    const { unmount } = renderWithProviders(
      <DokuDateien patientId={PATIENT} user={testUser(['therapist'])} />,
    );
    expect(await screen.findByText('Dokument hinzufügen')).toBeInTheDocument();
    const auswahl = screen.getByLabelText('Art des Dokuments');
    const arten = Array.from(auswahl.querySelectorAll('option')).map((o) => o.value);
    expect(arten).toEqual(['befund', 'arztbrief', 'klinisches_bild']);
    unmount();

    renderWithProviders(<DokuDateien patientId={PATIENT} user={testUser(['office'])} />);
    await waitFor(() => expect(fetchPatientFiles).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Dokument hinzufügen')).toBeNull();
  });

  it('bietet beim Anmeldebogen Einwilligung und Vertrag an, auch dem Praxismanagement', async () => {
    fetchPatientFiles.mockResolvedValue([]);
    renderWithProviders(<AnmeldebogenDateien patientId={PATIENT} user={testUser(['office'])} />);
    expect(await screen.findByText('Unterschriebenes Blatt hinzufügen')).toBeInTheDocument();
    const arten = Array.from(
      screen.getByLabelText('Art des Dokuments').querySelectorAll('option'),
    ).map((o) => o.value);
    expect(arten).toEqual(['einwilligung', 'vertrag']);
  });
});
