import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Datenexport as Daten, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * „Ich → Meine Daten" (POR-018): erst auf Knopfdruck (jeder Abruf steht im
 * Protokoll), dann Datei oder lesbare Fassung; vorher der Hinweis, dass die
 * Kopie der Akte die Praxis gibt.
 */

const ladeDatenexport = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeDatenexport: (...args: unknown[]) =>
    ladeDatenexport(...args) as Promise<{ daten: Daten; roh: unknown }>,
}));

const { Datenexport } = await import('./Datenexport');

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

const DATEN: Daten = {
  format: 'plattform-export',
  format_version: 1,
  exported_at: '2026-10-07T08:00:00.000+00:00',
  organization: 'Test Praxis Tuebingen',
  relationship: 'treatment',
  exported_by: 'self',
  person: {
    given_name: 'Erika',
    family_name: 'Beispiel',
    date_of_birth: '1948-03-02',
    street: 'Musterweg',
    house_number: '3',
    postal_code: '72070',
    city: 'Tübingen',
  },
  appointments: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      starts_at: '2026-10-08T08:00:00.000Z',
      ends_at: '2026-10-08T08:30:00.000Z',
      appointment_type: 'home_visit',
      status: 'confirmed',
      staff_name: 'Anna Beispiel',
      location_name: null,
      visit_street: null,
      visit_house_number: null,
      visit_postal_code: null,
      visit_city: null,
      late_notice: false,
      open_request_kind: null,
    },
  ],
  appointment_requests: [],
  questionnaires: [],
  invoices: [],
  documents: [],
  consents: [
    { purpose: 'email_contact', state: 'granted', occurred_on: '2026-10-06', source: 'platform' },
  ],
  training_packages: [],
  messages: [
    {
      id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
      topic: 'complaint',
      reference_label: null,
      status: 'answered',
      due_on: null,
      created_at: '2026-10-06T08:00:00.000Z',
      last_entry_at: '2026-10-06T09:00:00.000Z',
      closed_at: null,
      closed_by_side: null,
      entries: [],
    },
  ],
  training_contract: null,
};

const objektUrl = vi.fn((_blob: Blob) => 'blob:test');

beforeEach(() => {
  vi.clearAllMocks();
  ladeDatenexport.mockResolvedValue({ daten: DATEN, roh: DATEN });
  URL.createObjectURL = objektUrl;
  URL.revokeObjectURL = vi.fn();
});

describe('Datenexport (POR-018)', () => {
  it('ruft erst auf Knopfdruck ab und sagt vorher, was nicht drin ist', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Datenexport zugang={ZUGANG} />);
    expect(
      screen.getByText(/vollständige Kopie Ihrer Akte bekommen Sie bei der Praxis/),
    ).toBeInTheDocument();
    expect(ladeDatenexport).not.toHaveBeenCalled();

    await nutzer.click(screen.getByRole('button', { name: 'Daten zusammenstellen' }));
    await waitFor(() => expect(ladeDatenexport).toHaveBeenCalledWith(ZUGANG.access_id));
    expect(await screen.findByText('Ihre Daten sind zusammengestellt.')).toBeInTheDocument();
    expect(screen.getByText('Erika Beispiel')).toBeInTheDocument();
    expect(screen.getByText('Termine (1)')).toBeInTheDocument();
    expect(screen.getByText(/geplant/)).toBeInTheDocument();
    expect(screen.getByText(/erteilt am/)).toBeInTheDocument();
    expect(ladeDatenexport).toHaveBeenCalledTimes(1);
  });

  it('speichert die Antwort des Servers als JSON-Datei, ohne erneut abzurufen', async () => {
    const nutzer = userEvent.setup();
    const klick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderWithProviders(<Datenexport zugang={ZUGANG} />);
    await nutzer.click(screen.getByRole('button', { name: 'Daten zusammenstellen' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Als Datei speichern' }));
    expect(objektUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(klick).toHaveBeenCalled();
    expect(ladeDatenexport).toHaveBeenCalledTimes(1);
    klick.mockRestore();
  });

  it('zeigt einen Fehler als Satz', async () => {
    const nutzer = userEvent.setup();
    ladeDatenexport.mockRejectedValue(
      new Error('Ihre Daten konnten nicht zusammengestellt werden.'),
    );
    renderWithProviders(<Datenexport zugang={ZUGANG} />);
    await nutzer.click(screen.getByRole('button', { name: 'Daten zusammenstellen' }));
    expect(
      await screen.findByText('Ihre Daten konnten nicht zusammengestellt werden.'),
    ).toBeInTheDocument();
  });

  it('rechtliche Vertretung: sagt, wessen Daten', () => {
    renderWithProviders(
      <Datenexport
        zugang={{
          ...ZUGANG,
          access_kind: 'legal_representative',
          represented_name: 'Max Mustermann',
        }}
      />,
    );
    expect(screen.getByText(/die Daten von Max Mustermann/)).toBeInTheDocument();
  });
});
