import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as PlattformApi from './api';
import type { Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Die Übersicht (POR-015, DSN-001 4.1): Befundbogen, nächster Termin, Antwort
 * der Praxis, offene Rechnung - in dieser Reihenfolge; leer sagt sie es.
 */

const ladeTermine = vi.fn();
const ladeWuensche = vi.fn();
const ladeRechnungen = vi.fn();
const ladeBefundbogen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<unknown[]>,
  ladeWuensche: (...args: unknown[]) => ladeWuensche(...args) as Promise<unknown[]>,
  ladeRechnungen: (...args: unknown[]) => ladeRechnungen(...args) as Promise<unknown[]>,
  ladeBefundbogen: (...args: unknown[]) => ladeBefundbogen(...args) as Promise<unknown[]>,
}));

const { Uebersicht } = await import('./Uebersicht');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

function inTagen(tage: number, stunde: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, 30, 0, 0);
  return d.toISOString();
}

const TERMIN = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  starts_at: inTagen(3, 9),
  ends_at: inTagen(3, 10),
  appointment_type: 'home_visit',
  status: 'confirmed',
  staff_name: 'Anna Beispiel',
  location_name: null,
  visit_street: 'Testweg',
  visit_house_number: '7',
  visit_postal_code: '72072',
  visit_city: 'Tuebingen',
  late_notice: false,
  open_request_kind: null,
};

function zeige(zugang = ZUGANG, pfad = '/p?bereich=treatment') {
  return renderWithProviders(
    <Uebersicht praxis="Test Praxis Tuebingen" zugang={zugang} eigeneBereiche={1} />,
    pfad,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeTermine.mockResolvedValue([]);
  ladeWuensche.mockResolvedValue([]);
  ladeRechnungen.mockResolvedValue([]);
  ladeBefundbogen.mockResolvedValue([]);
});

describe('Uebersicht (POR-015)', () => {
  it('zeigt Befundbogen, naechsten Termin und offene Rechnung in der Reihenfolge aus DSN-001', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    ladeRechnungen.mockResolvedValue([
      {
        id: 'ffffffff-ffff-4fff-8fff-000000000001',
        invoice_number: 'RG-2026-0001',
        issued_on: '2026-09-25',
        due_on: '2026-10-09',
        total_cents: 14000,
        currency: 'EUR',
        paid_cents: 0,
        outstanding_cents: 14000,
        payment_state: 'unpaid',
        overdue: false,
        cancelled: false,
        cancelled_on: null,
        recipient_kind: 'self',
        recipient_name: 'Erika Beispiel',
        service_from: null,
        service_to: null,
      },
    ]);
    zeige();
    expect(await screen.findByText('Befundbogen ausfüllen')).toBeInTheDocument();
    const beschriftungen = screen.getAllByRole('term').map((t) => t.textContent?.trim());
    expect(beschriftungen).toEqual(['Befundbogen ausfüllen', 'Nächster Termin', 'Offene Rechnung']);
    expect(screen.getByRole('link', { name: 'Jetzt ausfüllen →' })).toHaveAttribute(
      'href',
      '/p/befundbogen?bereich=treatment',
    );
    expect(screen.getByText('Hausbesuch · Anna Beispiel kommt zu Ihnen')).toBeInTheDocument();
    expect(screen.getByText('Testweg 7, 72072 Tuebingen')).toBeInTheDocument();
    expect(screen.getByText('140,00 €')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Rechnung →' })).toHaveAttribute(
      'href',
      '/p/rechnungen/ffffffff-ffff-4fff-8fff-000000000001?bereich=treatment',
    );
    expect(screen.queryByText(/Gerade ist nichts zu tun/)).not.toBeInTheDocument();
  });

  it('fuehrt eine Begleitung nicht zum Befundbogen (ANN-248) und meldet einen Fehler als Satz', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    zeige({
      ...ZUGANG,
      access_id: 'cafecafe-cafe-4afe-8afe-000000000004',
      access_kind: 'companion',
      represented_name: 'Max Mustermann',
    });
    expect(await screen.findByText('Nächster Termin')).toBeInTheDocument();
    expect(screen.queryByText('Befundbogen ausfüllen')).not.toBeInTheDocument();

    ladeRechnungen.mockRejectedValue(new Error('Netz weg'));
    zeige();
    expect(
      await screen.findByText('Ihre Übersicht konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Gerade ist nichts zu tun/)).not.toBeInTheDocument();
  });

  it('laesst den Befundbogen weg, wenn er vorliegt, und sagt sonst, dass nichts zu tun ist', async () => {
    ladeBefundbogen.mockResolvedValue([
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
        instrument_id: 'anamnese_v8',
        definition_version: '1.0.0',
        status: 'abgeschlossen',
        recorded_on: '2026-10-01',
        source: 'practice',
        answers: null,
        updated_at: '2026-10-01T08:00:00.000Z',
        completed_at: '2026-10-01T08:00:00.000Z',
      },
    ]);
    zeige();
    expect(await screen.findByText(/Gerade ist nichts zu tun/)).toBeInTheDocument();
    expect(screen.getByText(/Zurzeit ist kein Termin vereinbart/)).toBeInTheDocument();
    expect(screen.queryByText('Befundbogen ausfüllen')).not.toBeInTheDocument();
  });

  it('zeigt die Antwort der Praxis auf einen Wunsch und im Training keinen Befundbogen', async () => {
    ladeWuensche.mockResolvedValue([
      {
        id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
        kind: 'new',
        appointment_id: null,
        preferred_days: ['2026-10-20'],
        preferred_times: [],
        note: null,
        status: 'declined',
        created_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
        answer: 'Diese Woche ist voll.',
      },
    ]);
    zeige({ ...ZUGANG, relationship_kind: 'training' }, '/p?bereich=training');
    expect(await screen.findByText('Antwort der Praxis')).toBeInTheDocument();
    expect(screen.getByText('Diese Woche ist voll.')).toBeInTheDocument();
    expect(screen.queryByText('Befundbogen ausfüllen')).not.toBeInTheDocument();
    expect(ladeBefundbogen).not.toHaveBeenCalled();
  });

  it('bestaetigt den abgeschickten Befundbogen', async () => {
    zeige(ZUGANG, '/p?bereich=treatment&bogen=1');
    expect(await screen.findByText(/Ihr Befundbogen ist bei der Praxis/)).toBeInTheDocument();
  });
});
