import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as RetentionApi from './api';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const fetchRetentionSchedule = vi.fn();
const fetchLegalHolds = vi.fn();
const fetchDeletionRuns = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof RetentionApi>();
  return {
    ...actual,
    fetchRetentionSchedule: () => fetchRetentionSchedule() as Promise<RetentionApi.Datenklasse[]>,
    fetchLegalHolds: () => fetchLegalHolds() as Promise<RetentionApi.Loeschsperre[]>,
    fetchDeletionRuns: () => fetchDeletionRuns() as Promise<RetentionApi.Loeschlauf[]>,
  };
});

const { AufbewahrungPage } = await import('./AufbewahrungPage');

const akte: RetentionApi.Datenklasse = {
  key: 'patientenakte',
  basis: 'gesetzlich',
  legal_reference: 'Par. 630f Abs. 3 BGB',
  anchor: 'care_concluded',
  retention_interval: '10 years',
  assumption_key: null,
  note: 'Zehn Jahre nach Abschluss der Behandlung.',
  sort_order: 10,
  tabellen: [
    { name: 'patients', modus: 'automatisch' },
    { name: 'treatment_notes', modus: 'ueber_elterndatensatz' },
  ],
};

const beschaeftigte: RetentionApi.Datenklasse = {
  key: 'beschaeftigtendaten',
  basis: 'offen',
  legal_reference: null,
  anchor: 'none',
  retention_interval: null,
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
  });

  it('nennt Frist, Anker und gesetzliche Grundlage je Datenklasse', async () => {
    renderWithProviders(<AufbewahrungPage />);

    expect(await screen.findByText('Klinische Patientenakte')).toBeInTheDocument();
    expect(screen.getByText('10 Jahre')).toBeInTheDocument();
    expect(screen.getByText('ab Abschluss der Versorgung')).toBeInTheDocument();
    expect(screen.getByText('Par. 630f Abs. 3 BGB')).toBeInTheDocument();
  });

  it('sagt bei einer Klasse ohne Frist ausdruecklich, dass nicht geloescht wird', async () => {
    renderWithProviders(<AufbewahrungPage />);

    expect(await screen.findByText('Beschäftigtendaten')).toBeInTheDocument();
    expect(screen.getByText('Keine automatische Löschung')).toBeInTheDocument();
  });

  it('macht eine ungeklaerte Frist als Annahme sichtbar, statt sie zu verschweigen', async () => {
    renderWithProviders(<AufbewahrungPage />);

    // Die Datenschutzprüfung muss am Bildschirm erkennen, welche Frist noch
    // niemand bestätigt hat.
    expect(await screen.findByText('ANN-030')).toBeInTheDocument();
  });

  it('zeigt die betroffenen Tabellen erst auf Wunsch', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AufbewahrungPage />);

    const aufklappen = await screen.findByText('Betroffene Tabellen (2)');
    // Der Inhalt eines geschlossenen <details> steht im Dokument, ist aber
    // nicht sichtbar - genau das ist hier die Zusage.
    expect(screen.getByText('treatment_notes')).not.toBeVisible();

    await user.click(aufklappen);
    expect(screen.getByText('treatment_notes')).toBeVisible();
  });

  it('sagt als Text, dass keine Loeschsperre laeuft', async () => {
    renderWithProviders(<AufbewahrungPage />);
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

    renderWithProviders(<AufbewahrungPage />);

    expect(await screen.findByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Honorarstreit')).toBeInTheDocument();
    expect(screen.getByText('Jannes Test')).toBeInTheDocument();
  });

  it('sagt als Text, dass noch nichts geloescht wurde', async () => {
    renderWithProviders(<AufbewahrungPage />);
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

    renderWithProviders(<AufbewahrungPage />);

    expect(await screen.findByText('1 Datensatz')).toBeInTheDocument();
    expect(screen.getByText('12 Datensätze')).toBeInTheDocument();
    expect(screen.getByText('Auditlog')).toBeInTheDocument();
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
        <AufbewahrungPage />
      </main>,
    );
    await screen.findByText('Max Mustermann');

    await pruefeBarrierefreiheit(container);
  });

  it('meldet einen Fehler, ohne eine leere Liste vorzutaeuschen', async () => {
    fetchDeletionRuns.mockRejectedValue(new Error('abgelehnt'));
    renderWithProviders(<AufbewahrungPage />);

    expect(
      await screen.findByText('Das Löschjournal konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Es wurde noch nichts gelöscht')).toBeNull();
  });
});
