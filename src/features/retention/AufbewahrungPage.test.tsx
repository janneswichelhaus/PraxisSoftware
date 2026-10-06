import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as RetentionApi from './api';
import type * as FilesApi from '@/features/files/api';
import { renderWithProviders, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const fetchRetentionSchedule = vi.fn();
const fetchLegalHolds = vi.fn();
const fetchDeletionRuns = vi.fn();
const fetchLoeschauftraege = vi.fn();
const fuehreLoeschauftragAus = vi.fn();
const fetchFehlendeDateien = vi.fn();
const fetchVerwaisteAnzahl = vi.fn();
const merkeVerwaisteZurLoeschungVor = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof RetentionApi>();
  return {
    ...actual,
    fetchRetentionSchedule: () => fetchRetentionSchedule() as Promise<RetentionApi.Datenklasse[]>,
    fetchLegalHolds: () => fetchLegalHolds() as Promise<RetentionApi.Loeschsperre[]>,
    fetchDeletionRuns: () => fetchDeletionRuns() as Promise<RetentionApi.Loeschlauf[]>,
  };
});

vi.mock('@/features/files/api', async (importOriginal) => {
  const actual = await importOriginal<typeof FilesApi>();
  return {
    ...actual,
    fetchLoeschauftraege: () => fetchLoeschauftraege() as Promise<FilesApi.Loeschauftrag[]>,
    fuehreLoeschauftragAus: (id: string) => fuehreLoeschauftragAus(id) as Promise<void>,
    fetchFehlendeDateien: () => fetchFehlendeDateien() as Promise<FilesApi.FehlendeDatei[]>,
    fetchVerwaisteAnzahl: () => fetchVerwaisteAnzahl() as Promise<number>,
    merkeVerwaisteZurLoeschungVor: () => merkeVerwaisteZurLoeschungVor() as Promise<number>,
  };
});

const { AufbewahrungPage } = await import('./AufbewahrungPage');

function auftrag(rest: Partial<FilesApi.Loeschauftrag> = {}): FilesApi.Loeschauftrag {
  return {
    id: 'o1',
    bucket_id: 'patientenakte',
    ordered_at: '2026-09-13T07:00:00.000Z',
    object_present: true,
    ...rest,
  };
}

const akte: RetentionApi.Datenklasse = {
  key: 'patientenakte',
  basis: 'gesetzlich',
  legal_reference: 'Par. 630f Abs. 3 BGB',
  anchor: 'care_concluded',
  retention_interval: '10 years',
  upper_bound_anchor: null,
  upper_bound_interval: null,
  assumption_key: null,
  note: 'Zehn Jahre nach Abschluss der Behandlung.',
  sort_order: 10,
  tabellen: [
    { name: 'patients', modus: 'automatisch' },
    { name: 'treatment_notes', modus: 'ueber_elterndatensatz' },
  ],
};

const fotos: RetentionApi.Datenklasse = {
  key: 'patientenfoto',
  basis: 'intern',
  legal_reference: 'Art. 9 Abs. 2 lit. a DSGVO',
  anchor: 'event_time',
  retention_interval: '1 year',
  upper_bound_anchor: 'care_concluded_recorded',
  upper_bound_interval: '3 mons',
  assumption_key: 'ANN-126',
  note: 'Zwölf Monate nach der Aufnahme, spätestens drei Monate nach Abschluss.',
  sort_order: 12,
  tabellen: [{ name: 'patient_files', modus: 'automatisch' }],
};

const beschaeftigte: RetentionApi.Datenklasse = {
  key: 'beschaeftigtendaten',
  basis: 'offen',
  legal_reference: null,
  anchor: 'none',
  retention_interval: null,
  upper_bound_anchor: null,
  upper_bound_interval: null,
  assumption_key: 'ANN-030',
  note: 'Frist offen.',
  sort_order: 60,
  tabellen: [{ name: 'staff_members', modus: 'keine' }],
};

describe('AufbewahrungPage', () => {
  beforeEach(() => {
    fetchRetentionSchedule.mockReset();
    fetchLegalHolds.mockReset();
    fetchDeletionRuns.mockReset();
    fetchRetentionSchedule.mockResolvedValue([akte, beschaeftigte]);
    fetchLegalHolds.mockResolvedValue([]);
    fetchDeletionRuns.mockResolvedValue([]);
    fetchLoeschauftraege.mockReset();
    fuehreLoeschauftragAus.mockReset();
    fetchLoeschauftraege.mockResolvedValue([]);
    fuehreLoeschauftragAus.mockResolvedValue(undefined);
    fetchFehlendeDateien.mockReset();
    fetchVerwaisteAnzahl.mockReset();
    merkeVerwaisteZurLoeschungVor.mockReset();
    fetchFehlendeDateien.mockResolvedValue([]);
    fetchVerwaisteAnzahl.mockResolvedValue(0);
    merkeVerwaisteZurLoeschungVor.mockResolvedValue(1);
  });

  it('nennt Frist, Anker und gesetzliche Grundlage je Datenklasse', async () => {
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    expect(await screen.findByText('Klinische Patientenakte')).toBeInTheDocument();
    expect(screen.getByText('10 Jahre')).toBeInTheDocument();
    expect(screen.getByText('ab Abschluss der Versorgung')).toBeInTheDocument();
    // Die Datenbank traegt `Par.`, die Seite das Zeichen (BEF-033).
    expect(screen.getByText('§ 630f Abs. 3 BGB')).toBeInTheDocument();
    expect(screen.queryByText(/Par\./)).toBeNull();
  });

  it('nennt bei Patientenfotos die Obergrenze neben der Frist (ADR-017 Punkt 38)', async () => {
    fetchRetentionSchedule.mockResolvedValue([akte, fotos, beschaeftigte]);
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    expect(await screen.findByText('Foto-Arbeitshilfen')).toBeInTheDocument();
    expect(screen.getByText('1 Jahr')).toBeInTheDocument();
    expect(screen.getByText('ab dem Ereignis')).toBeInTheDocument();
    expect(
      screen.getByText('3 Monate nach dem festgehaltenen Abschluss der Versorgung'),
    ).toBeInTheDocument();
    // Nur dort, wo es eine Obergrenze gibt.
    expect(screen.getAllByText('Spätestens')).toHaveLength(1);
  });

  it('sagt bei einer Klasse ohne Frist ausdruecklich, dass nicht geloescht wird', async () => {
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    expect(await screen.findByText('Beschäftigtendaten')).toBeInTheDocument();
    expect(screen.getByText('Keine automatische Löschung')).toBeInTheDocument();
  });

  it('macht eine ungeklaerte Frist als Annahme sichtbar, statt sie zu verschweigen', async () => {
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    // Die Datenschutzprüfung muss am Bildschirm erkennen, welche Frist noch
    // niemand bestätigt hat.
    expect(await screen.findByText('ANN-030')).toBeInTheDocument();
  });

  it('zeigt die betroffenen Tabellen erst auf Wunsch', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    const aufklappen = await screen.findByText('Betroffene Tabellen (2)');
    // Der Inhalt eines geschlossenen <details> steht im Dokument, ist aber
    // nicht sichtbar - genau das ist hier die Zusage.
    expect(screen.getByText('treatment_notes')).not.toBeVisible();

    await user.click(aufklappen);
    expect(screen.getByText('treatment_notes')).toBeVisible();
  });

  it('sagt als Text, dass keine Loeschsperre laeuft', async () => {
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);
    expect(await screen.findByText('Keine laufende Löschsperre')).toBeInTheDocument();
  });

  it('nennt eine laufende Loeschsperre mit Person, Grund und Beginn', async () => {
    fetchLegalHolds.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        subject_type: 'patient',
        subject_id: '66666666-6666-4666-8666-000000000001',
        subject_name: 'Max Mustermann',
        reason: 'Honorarstreit',
        placed_at: '2026-09-01T08:00:00Z',
        placed_by_name: 'Jannes Test',
      },
    ]);

    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    expect(await screen.findByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Honorarstreit')).toBeInTheDocument();
    expect(screen.getByText('Jannes Test')).toBeInTheDocument();
  });

  it('sagt als Text, dass noch nichts geloescht wurde', async () => {
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);
    expect(await screen.findByText('Es wurde noch nichts gelöscht')).toBeInTheDocument();
  });

  it('listet die Loeschlaeufe mit Datenklasse und Anzahl', async () => {
    fetchDeletionRuns.mockResolvedValue([
      {
        run_id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
        deleted_at: '2026-09-10T03:10:00Z',
        retention_class: 'patientenakte',
        target_table: 'patients',
        record_count: 1,
      },
      {
        run_id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
        deleted_at: '2026-09-10T03:10:00Z',
        retention_class: 'auditlog',
        target_table: 'audit_log',
        record_count: 12,
      },
    ]);

    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    expect(await screen.findByText('1 Datensatz')).toBeInTheDocument();
    expect(screen.getByText('12 Datensätze')).toBeInTheDocument();
    // Die Klasse heisst im Journal „Protokoll" - nicht zu verwechseln mit dem
    // Reiter desselben Namens im Kopf der Seite (RAH-005).
    expect(screen.getAllByText('Protokoll').filter((el) => el.closest('a') === null)).toHaveLength(
      1,
    );
    expect(screen.getByRole('link', { name: 'Protokoll' })).toHaveAttribute(
      'href',
      '/praxis/sicherheit/audit',
    );
  });

  it('haelt die Seite barrierefrei - mit Sperre und mit Loeschjournal', async () => {
    fetchLegalHolds.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        subject_type: 'patient',
        subject_id: '66666666-6666-4666-8666-000000000001',
        subject_name: 'Max Mustermann',
        reason: 'Honorarstreit',
        placed_at: '2026-09-01T08:00:00Z',
        placed_by_name: 'Jannes Test',
      },
    ]);
    fetchDeletionRuns.mockResolvedValue([
      {
        run_id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
        deleted_at: '2026-09-10T03:10:00Z',
        retention_class: 'patientenakte',
        target_table: 'patients',
        record_count: 1,
      },
    ]);

    const { container } = renderWithProviders(
      <main>
        <AufbewahrungPage user={testUser(['owner'])} />
      </main>,
    );
    await screen.findByText('Max Mustermann');

    await pruefeBarrierefreiheit(container);
  });

  it('meldet einen Fehler, ohne eine leere Liste vorzutaeuschen', async () => {
    fetchDeletionRuns.mockRejectedValue(new Error('abgelehnt'));
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    expect(
      await screen.findByText('Das Löschjournal konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Es wurde noch nichts gelöscht')).toBeNull();
  });

  describe('Offene Löschaufträge (DAT-002, ADR-017 Punkt 25)', () => {
    it('sagt, dass nichts offen ist, wenn nichts offen ist', async () => {
      renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);
      expect(await screen.findByText('Nichts offen')).toBeInTheDocument();
    });

    it('nennt offene Aufträge als noch nicht abgeschlossene Löschung', async () => {
      fetchLoeschauftraege.mockResolvedValue([auftrag()]);

      renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

      expect(
        await screen.findByText(/Eine Datei ist aus der Akte entfernt, liegt aber noch/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Datei liegt noch in der Ablage/)).toBeInTheDocument();
    });

    it('führt alle Aufträge erst nach der Rückfrage aus und meldet das Ergebnis (ORG-21)', async () => {
      fetchLoeschauftraege.mockResolvedValue([auftrag(), auftrag({ id: 'o2' })]);

      renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

      await screen.findByText(/2 Dateien sind aus der Akte entfernt/);
      await userEvent.click(
        screen.getByRole('button', { name: 'Alle 2 ausführen und quittieren' }),
      );

      // Endgueltig ist es erst mit der Bestaetigung - ein Fehlgriff loescht nichts.
      const frage = screen.getByRole('group', { name: 'Alle 2 ausführen und quittieren' });
      expect(frage).toHaveTextContent('2 Dateien endgültig aus der Ablage entfernen?');
      expect(fuehreLoeschauftragAus).not.toHaveBeenCalled();

      await userEvent.click(within(frage).getByRole('button', { name: 'Endgültig entfernen' }));

      expect(
        await screen.findByText(/2 Löschungen abgeschlossen und quittiert/),
      ).toBeInTheDocument();
      expect(fuehreLoeschauftragAus).toHaveBeenCalledTimes(2);
    });

    it('lässt nach „Abbrechen“ alles offen (ORG-21)', async () => {
      fetchLoeschauftraege.mockResolvedValue([auftrag()]);

      renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

      await screen.findByText(/Eine Datei ist aus der Akte entfernt/);
      await userEvent.click(
        screen.getByRole('button', { name: 'Alle 1 ausführen und quittieren' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

      expect(fuehreLoeschauftragAus).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Alle 1 ausführen und quittieren' }),
      ).toBeInTheDocument();
    });

    it('lässt einen gescheiterten Auftrag offen und sagt warum', async () => {
      fetchLoeschauftraege.mockResolvedValue([auftrag()]);
      fuehreLoeschauftragAus.mockRejectedValue(
        new Error('Die Ablage meldet die Datei weiterhin als vorhanden. Der Auftrag bleibt offen.'),
      );

      renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

      await screen.findByText(/Eine Datei ist aus der Akte entfernt/);
      await userEvent.click(
        screen.getByRole('button', { name: 'Alle 1 ausführen und quittieren' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Endgültig entfernen' }));

      expect(
        await screen.findByText(/0 erledigt, 1 offen geblieben: Die Ablage meldet/),
      ).toBeInTheDocument();
    });
  });

  it('legt um die Karten von Plan und Sperren keinen zweiten Rahmen (RSP-16)', async () => {
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);
    await screen.findByText('Klinische Patientenakte');

    for (const titel of ['Aufbewahrungsplan', 'Löschsperren']) {
      const abschnitt = screen.getByRole('heading', { name: titel }).closest('section')!;
      // Inhaltsflaeche ist der Rahmen um Auskunft; eine Kartenliste traegt
      // ihre Rahmen selbst.
      expect(abschnitt.querySelector('.rounded-card.px-4')).toBeNull();
    }
  });

  it('benennt die Angaben des Löschjournals für Vorlesesoftware (UIK-24)', async () => {
    fetchDeletionRuns.mockResolvedValue([
      {
        run_id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
        deleted_at: '2026-09-10T03:10:00Z',
        retention_class: 'auditlog',
        target_table: 'audit_log',
        record_count: 12,
      },
    ]);
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    const zeile = (await screen.findByText('12 Datensätze')).closest('li')!;
    for (const spalte of ['Zeitpunkt:', 'Datenklasse:', 'Anzahl:']) {
      expect(within(zeile).getByText(spalte)).toHaveClass('sr-only');
    }
  });

  it('sagt, dass das Journal nur die letzten 50 Einträge zeigt (ORG-22)', async () => {
    fetchDeletionRuns.mockResolvedValue(
      Array.from({ length: 50 }, (_, index) => ({
        run_id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
        deleted_at: '2026-09-10T03:10:00Z',
        retention_class: 'auditlog',
        target_table: 'audit_log',
        record_count: 1,
      })),
    );
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    expect(await screen.findByText(/Angezeigt werden die letzten 50 Einträge/)).toBeInTheDocument();
  });

  it('bietet nach einem Ladefehler einen neuen Versuch an (WRT-01)', async () => {
    fetchLegalHolds.mockRejectedValueOnce(new Error('kaputt')).mockResolvedValue([]);
    renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

    const meldung = await screen.findByText('Die Löschsperren konnten nicht geladen werden.');
    const kasten = meldung.closest('[role="alert"]') as HTMLElement;
    expect(kasten).toHaveTextContent('Bitte die Verbindung prüfen');
    await userEvent.click(within(kasten).getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByText('Keine laufende Löschsperre')).toBeInTheDocument();
  });

  describe('Abgleich der Dateiablage (DAT-003, ADR-017 Punkt 27)', () => {
    it('sagt, dass beide Speicher deckungsgleich sind', async () => {
      renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);
      expect(await screen.findByText('Beide Speicher sind deckungsgleich')).toBeInTheDocument();
    });

    it('nennt eine fehlende Datei als Verlust, mit Akte und Weg dorthin', async () => {
      fetchFehlendeDateien.mockResolvedValue([
        {
          file_id: 'd1',
          patient_id: 'p1',
          patient_name: 'Max Mustermann',
          document_type: 'verordnungsscan',
          display_name: 'Rezept.pdf',
          uploaded_at: '2026-09-13T07:00:00.000Z',
        },
      ]);

      renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

      expect(await screen.findByText(/fehlt die abgelegte Fassung/)).toBeInTheDocument();
      expect(screen.getByText(/kein Aufräumfall/)).toBeInTheDocument();
      expect(screen.getByText('Rezept.pdf')).toBeInTheDocument();
      expect(screen.getByText(/Max Mustermann/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Akte öffnen' })).toHaveAttribute(
        'href',
        '/patienten/p1/verordnungen',
      );
    });

    it('merkt verwaiste Objekte über den gewöhnlichen Löschweg vor', async () => {
      fetchVerwaisteAnzahl.mockResolvedValue(3);
      merkeVerwaisteZurLoeschungVor.mockResolvedValue(3);

      renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

      expect(
        await screen.findByText(/3 Objekte in der Ablage gehören zu keiner Datei/),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Zur Löschung vormerken' }));

      expect(await screen.findByText(/3 Löschaufträge angelegt/)).toBeInTheDocument();
      expect(merkeVerwaisteZurLoeschungVor).toHaveBeenCalled();
    });

    it('meldet „deckungsgleich“ erst, wenn keine Löschaufträge mehr offen sind (ORG-22)', async () => {
      // Vorgemerkte Objekte zaehlt der Abgleich nicht mehr - sie liegen aber
      // noch in der Ablage, bis die Auftraege ausgefuehrt sind.
      fetchVerwaisteAnzahl.mockResolvedValue(0);
      fetchLoeschauftraege.mockResolvedValue([auftrag()]);

      renderWithProviders(<AufbewahrungPage user={testUser(['owner'])} />);

      expect(
        await screen.findByText(
          'Deckungsgleich, sobald die offenen Löschaufträge oben ausgeführt sind',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('Beide Speicher sind deckungsgleich')).toBeNull();
    });
  });
});
