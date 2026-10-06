import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlatformRequestsApi from './platform-requests-api';
import { renderWithProviders } from '@/test-utils';

/**
 * Terminwünsche in Offene Punkte (POR-011, DSN-001 Abschnitt 6, D4): je Wunsch
 * Person, Inhalt, Urheber und die passende Handlung; die Absage aus dem
 * Absagewunsch trägt den Zeitpunkt des Wunsches als Eingang.
 */

const fetchPlatformRequests = vi.fn();
const resolvePlatformRequest = vi.fn();
const cancelFromRequest = vi.fn();

vi.mock('./platform-requests-api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlatformRequestsApi>()),
  fetchPlatformRequests: () =>
    fetchPlatformRequests() as Promise<PlatformRequestsApi.PlatformRequest[]>,
  resolvePlatformRequest: (...args: unknown[]) => resolvePlatformRequest(...args) as Promise<void>,
  cancelFromRequest: (...args: unknown[]) => cancelFromRequest(...args) as Promise<void>,
}));

const { PlatformRequests } = await import('./PlatformRequests');

const NEU: PlatformRequestsApi.PlatformRequest = {
  id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
  kind: 'new',
  relationship_kind: 'treatment',
  patient_id: '66666666-6666-4666-8666-000000000002',
  training_relationship_id: null,
  given_name: 'Erika',
  family_name: 'Beispiel',
  appointment_id: null,
  appointment_starts_at: null,
  appointment_ends_at: null,
  appointment_updated_at: null,
  appointment_status: null,
  preferred_days: ['2026-10-20', '2026-10-22'],
  preferred_times: ['morning'],
  note: 'Bitte nicht vor 9 Uhr.',
  status: 'open',
  created_at: '2026-10-06T08:00:00.000Z',
  requested_by: 'self',
  representative_name: null,
  resolved_at: null,
  answer: null,
  resulting_appointment_id: null,
};

const ABSAGE: PlatformRequestsApi.PlatformRequest = {
  ...NEU,
  id: 'dddddddd-dddd-4ddd-8ddd-000000000002',
  kind: 'cancel',
  patient_id: '66666666-6666-4666-8666-000000000001',
  given_name: 'Max',
  family_name: 'Mustermann',
  appointment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  appointment_starts_at: '2026-10-09T07:00:00.000Z',
  appointment_ends_at: '2026-10-09T08:00:00.000Z',
  appointment_updated_at: '2026-10-01T10:00:00.000Z',
  appointment_status: 'confirmed',
  preferred_days: [],
  preferred_times: [],
  note: null,
  requested_by: 'companion',
  representative_name: 'Paula Mustermann',
};

const TRAINING: PlatformRequestsApi.PlatformRequest = {
  ...NEU,
  id: 'dddddddd-dddd-4ddd-8ddd-000000000003',
  relationship_kind: 'training',
  patient_id: null,
  training_relationship_id: 'eeeeeeee-eeee-4eee-8eee-000000000001',
  given_name: 'Tina',
  family_name: 'Training',
  preferred_days: ['2026-10-21'],
  preferred_times: [],
  note: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  resolvePlatformRequest.mockResolvedValue(undefined);
  cancelFromRequest.mockResolvedValue(undefined);
});

describe('PlatformRequests (POR-011)', () => {
  it('zeigt je Wunsch Person, Inhalt, Urheber und den Weg zum Termin', async () => {
    fetchPlatformRequests.mockResolvedValue([NEU, ABSAGE, TRAINING]);
    renderWithProviders(<PlatformRequests timeZone="Europe/Berlin" />, '/offen');
    expect(await screen.findByRole('heading', { name: 'Terminwünsche (3)' })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Beispiel, Erika' })).toHaveAttribute(
      'href',
      expect.stringContaining('/patienten/66666666-6666-4666-8666-000000000002'),
    );
    expect(screen.getByText(/20\.10\.2026, 22\.10\.2026 · Vormittag/)).toBeInTheDocument();
    expect(screen.getByText('„Bitte nicht vor 9 Uhr.“')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Termin anlegen' })[0]).toHaveAttribute(
      'href',
      expect.stringContaining(
        '/patienten/66666666-6666-4666-8666-000000000002/termine/neu?datum=2026-10-20',
      ),
    );

    expect(screen.getByText(/durch Paula Mustermann \(Vertretung\)/)).toBeInTheDocument();
    const terminLink = screen
      .getAllByRole('link')
      .find((a) =>
        a.getAttribute('href')?.includes('/termine/aaaaaaaa-aaaa-4aaa-8aaa-000000000001'),
      );
    expect(terminLink).toBeDefined();
    expect(terminLink).toHaveTextContent(/9\. Oktober 2026/);
    expect(terminLink).toHaveTextContent(/09:00/);

    expect(screen.getByRole('link', { name: 'Training, Tina' })).toHaveAttribute(
      'href',
      expect.stringContaining('/training/eeeeeeee-eeee-4eee-8eee-000000000001'),
    );
    expect(screen.getAllByRole('link', { name: 'Termin anlegen' })[1]).toHaveAttribute(
      'href',
      expect.stringContaining(
        '/training/termine/neu?kunde=eeeeeeee-eeee-4eee-8eee-000000000001&datum=2026-10-21',
      ),
    );
  });

  it('traegt die Absage aus dem Absagewunsch ein - mit dem Zeitpunkt des Wunsches als Eingang (D4)', async () => {
    const nutzer = userEvent.setup();
    fetchPlatformRequests.mockResolvedValue([ABSAGE]);
    renderWithProviders(<PlatformRequests timeZone="Europe/Berlin" />, '/offen');
    await nutzer.click(await screen.findByRole('button', { name: 'Absage eintragen' }));
    expect(
      screen.getByText(/Als Eingang der Absage gilt der Zeitpunkt des Wunsches/),
    ).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Absage eintragen', hidden: false }));
    await waitFor(() =>
      expect(cancelFromRequest).toHaveBeenCalledWith(ABSAGE.id, ABSAGE.appointment_updated_at),
    );
  });

  it('beantwortet einen Wunsch als nicht moeglich mit Antwort an die Person', async () => {
    const nutzer = userEvent.setup();
    fetchPlatformRequests.mockResolvedValue([NEU]);
    renderWithProviders(<PlatformRequests timeZone="Europe/Berlin" />, '/offen');
    await nutzer.click(await screen.findByRole('button', { name: 'Nicht möglich' }));
    await nutzer.type(
      screen.getByLabelText(/Antwort an die Person/),
      'Diese Woche ist voll, bitte rufen Sie an.',
    );
    await nutzer.click(screen.getByRole('button', { name: 'Als nicht möglich beantworten' }));
    await waitFor(() =>
      expect(resolvePlatformRequest).toHaveBeenCalledWith({
        id: NEU.id,
        outcome: 'declined',
        answer: 'Diese Woche ist voll, bitte rufen Sie an.',
      }),
    );
  });

  it('sagt ohne Wuensche, dass nichts offen ist', async () => {
    fetchPlatformRequests.mockResolvedValue([]);
    renderWithProviders(<PlatformRequests timeZone="Europe/Berlin" />, '/offen');
    expect(await screen.findByText('Kein offener Wunsch von der Plattform.')).toBeInTheDocument();
  });
});
