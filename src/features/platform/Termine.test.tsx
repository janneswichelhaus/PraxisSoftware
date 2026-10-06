import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Plattformzugang, Termin, Terminwunsch } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Reiter „Termine" (POR-008, DSN-001 4.1): kommende oben, vergangene darunter,
 * je Zeile Zeit, Art, wer kommt, Ort und der Zustand als Wort.
 */

const ladeTermine = vi.fn();
const ladeWuensche = vi.fn();
const wunschZurueckziehen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<Termin[]>,
  ladeWuensche: (...args: unknown[]) => ladeWuensche(...args) as Promise<Terminwunsch[]>,
  wunschZurueckziehen: (...args: unknown[]) => wunschZurueckziehen(...args) as Promise<void>,
}));

const { Termine } = await import('./Termine');
const { terminBeschreibung } = await import('./termine');

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

function in_(tage: number, stunde: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, 30, 0, 0);
  return d.toISOString();
}

const HAUSBESUCH: Termin = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  starts_at: in_(3, 9),
  ends_at: in_(3, 10),
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
const PRAXIS_VERGANGEN: Termin = {
  ...HAUSBESUCH,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  starts_at: in_(-7, 14),
  ends_at: in_(-7, 15),
  appointment_type: 'practice',
  status: 'completed',
  location_name: 'Hauptstandort Tuebingen',
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  late_notice: null,
};
const ABGESAGT: Termin = {
  ...HAUSBESUCH,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
  starts_at: in_(5, 11),
  ends_at: in_(5, 12),
  status: 'cancelled',
};

beforeEach(() => {
  vi.clearAllMocks();
  ladeWuensche.mockResolvedValue([]);
  wunschZurueckziehen.mockResolvedValue(undefined);
});

describe('Termine (POR-008)', () => {
  it('trennt kommende und vergangene Termine und nennt wer, wo und Zustand', async () => {
    ladeTermine.mockResolvedValue([PRAXIS_VERGANGEN, HAUSBESUCH, ABGESAGT]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    expect(await screen.findByRole('heading', { name: 'Kommende Termine' })).toBeInTheDocument();
    expect(ladeTermine).toHaveBeenCalledWith(ZUGANG.access_id);

    // Der Hausbesuch und die Absage sind beide Hausbesuche bei Anna.
    expect(screen.getAllByText('Hausbesuch · Anna Beispiel kommt zu Ihnen')).toHaveLength(2);
    expect(screen.getAllByText('Testweg 7, 72072 Tuebingen')).toHaveLength(2);
    expect(screen.getByText('abgesagt')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Vergangene Termine' })).toBeInTheDocument();
    expect(screen.getByText('In der Praxis bei Anna Beispiel')).toBeInTheDocument();
    expect(screen.getByText('Hauptstandort Tuebingen')).toBeInTheDocument();
    expect(screen.getByText('durchgeführt')).toBeInTheDocument();
  });

  it('sagt ohne kommende Termine, wie es weitergeht (Abschnitt 7, Leerzustand)', async () => {
    ladeTermine.mockResolvedValue([PRAXIS_VERGANGEN]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    expect(await screen.findByText(/Zurzeit ist kein Termin vereinbart/)).toBeInTheDocument();
  });

  it('zeigt einen Fehler mit Weg zurueck, ohne interne Details', async () => {
    ladeTermine.mockRejectedValue(new Error('Ihre Termine konnten nicht geladen werden.'));
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    await waitFor(() =>
      expect(screen.getByText('Ihre Termine konnten nicht geladen werden.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /erneut/i })).toBeInTheDocument();
  });

  it('fuehrt zum Wunschformular und zeigt einen offenen Wunsch als angefragt (POR-009)', async () => {
    const nutzer = userEvent.setup();
    ladeTermine.mockResolvedValue([HAUSBESUCH]);
    const offen: Terminwunsch = {
      id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
      kind: 'new',
      appointment_id: null,
      preferred_days: ['2026-10-20', '2026-10-22'],
      preferred_times: ['morning'],
      note: 'Bitte nicht vor 9 Uhr.',
      status: 'open',
      created_at: new Date().toISOString(),
      resolved_at: null,
      answer: null,
    };
    const alt: Terminwunsch = {
      ...offen,
      id: 'dddddddd-dddd-4ddd-8ddd-000000000002',
      status: 'declined',
      resolved_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      answer: 'Leider voll.',
    };
    ladeWuensche.mockResolvedValue([offen, alt]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?bereich=treatment');

    expect(await screen.findByText('angefragt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Termin wünschen' })).toHaveAttribute(
      'href',
      '/p/termine/wunsch?bereich=treatment',
    );
    expect(
      screen.getByText(/Dienstag, 20\.10\., Donnerstag, 22\.10\. · Vormittag/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ein vereinbarter Termin ist das noch nicht/)).toBeInTheDocument();
    // Ein vor 30 Tagen beantworteter Wunsch ist keine Auskunft mehr.
    expect(screen.queryByText('Leider voll.')).not.toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Wunsch zurückziehen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja, zurückziehen' }));
    await waitFor(() =>
      expect(wunschZurueckziehen).toHaveBeenCalledWith(ZUGANG.access_id, offen.id),
    );
  });

  it('beschreibt einen Videotermin ohne Ort und einen Hausbesuch mit Anschrift', () => {
    expect(terminBeschreibung({ ...HAUSBESUCH, appointment_type: 'video' })).toEqual({
      titel: 'Videotermin mit Anna Beispiel',
      ort: null,
    });
    expect(terminBeschreibung({ ...HAUSBESUCH, staff_name: null })).toEqual({
      titel: 'Hausbesuch · Ihre Praxis kommt zu Ihnen',
      ort: 'Testweg 7, 72072 Tuebingen',
    });
  });
});
