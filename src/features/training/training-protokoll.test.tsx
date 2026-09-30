import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TrainingApi from './api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Trainingsprotokoll und Abschluss am Trainingstermin (TRN-009, TRN-010).
 * Die Grenze sitzt im Server (`training-protocols.test.ts`); geprüft wird
 * hier, was die Seiten anbieten, welche Aufrufe sie machen - und was sie
 * nicht zeigen (ADR-006 Punkte 9 bis 13: keine Bewertung, kein Befund).
 */

const TINA = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const TERMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000007';
const PROTOKOLL = '99999999-9999-4999-8999-000000000001';

const getTrainingAppointment = vi.fn();
const getTrainingProtocol = vi.fn();
const saveTrainingProtocol = vi.fn();
const finalizeTrainingProtocol = vi.fn();
const listTrainingProtocols = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TrainingApi>();
  return {
    ...actual,
    getTrainingAppointment: (id: string) => getTrainingAppointment(id) as Promise<unknown>,
    listTrainingBases: () => Promise.resolve([]),
    getTrainingProtocol: (id: string) => getTrainingProtocol(id) as Promise<unknown>,
    saveTrainingProtocol: (...args: unknown[]) => saveTrainingProtocol(...args) as Promise<unknown>,
    finalizeTrainingProtocol: (...args: unknown[]) =>
      finalizeTrainingProtocol(...args) as Promise<void>,
    listTrainingProtocols: (id: string) => listTrainingProtocols(id) as Promise<unknown>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useParams: () => ({ appointmentId: TERMIN }),
}));

const { TrainingAppointmentPage } = await import('./TrainingAppointmentPage');
const { TrainingEinheiten } = await import('./TrainingProtocol');

const termin = {
  id: TERMIN,
  training_relationship_id: TINA,
  training_basis_id: null,
  client_given_name: 'Tina',
  client_family_name: 'Trainingskundin',
  staff_member_id: '55555555-5555-4555-8555-000000000006',
  staff_given_name: 'Tom',
  staff_family_name: 'Trainingsbetreuung',
  location_id: null,
  location_name: null,
  appointment_type: 'video',
  status: 'confirmed',
  starts_at: '2027-05-13T08:00:00+00:00',
  ends_at: '2027-05-13T09:00:00+00:00',
  updated_at: '2027-05-01T10:00:00.123456+00:00',
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  cancellation_reason: null,
  cancellation_received_at: null,
  organization_time_zone: 'Europe/Berlin',
};

const entwurf = {
  id: PROTOKOLL,
  appointment_id: TERMIN,
  status: 'draft',
  content: 'Kniebeugen 3 x 10',
  created_at: '2027-05-13T09:00:00+00:00',
  updated_at: '2027-05-13T09:05:00.654321+00:00',
  finalized_at: null,
  author_name: 'Tom Trainingsbetreuung',
  finalized_by_name: null,
};

beforeEach(() => {
  for (const f of [
    getTrainingAppointment,
    getTrainingProtocol,
    saveTrainingProtocol,
    finalizeTrainingProtocol,
    listTrainingProtocols,
  ]) {
    f.mockReset();
  }
  getTrainingAppointment.mockResolvedValue(termin);
  getTrainingProtocol.mockResolvedValue(null);
  saveTrainingProtocol.mockResolvedValue({ id: PROTOKOLL, updated_at: entwurf.updated_at });
  finalizeTrainingProtocol.mockResolvedValue(undefined);
});

describe('Trainingsprotokoll am Trainingstermin', () => {
  it('speichert den ersten Entwurf ohne erwarteten Stand', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<TrainingAppointmentPage user={testUser(['trainer'], 'Tom')} />);
    const feld = await screen.findByLabelText('Was in der Einheit gemacht wurde');
    // Heißt nie Befund (ADR-006 Fassung 3: Beschriftung ist Zweckbestimmung).
    expect(screen.getByRole('heading', { name: 'Trainingsprotokoll' })).toBeInTheDocument();
    expect(screen.queryByText(/Befund/)).toBeNull();

    await nutzer.type(feld, 'Rudern 4 x 8');
    await nutzer.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
    await waitFor(() =>
      expect(saveTrainingProtocol).toHaveBeenCalledWith(TERMIN, 'Rudern 4 x 8', null),
    );
    expect(await screen.findByText('Entwurf gespeichert.')).toBeInTheDocument();
  });

  it('ändert einen vorhandenen Entwurf mit seinem Stand', async () => {
    getTrainingProtocol.mockResolvedValue(entwurf);
    const nutzer = userEvent.setup();
    renderWithProviders(<TrainingAppointmentPage user={testUser(['owner'], 'Jannes')} />);
    const feld = await screen.findByLabelText('Was in der Einheit gemacht wurde');
    expect(feld).toHaveValue('Kniebeugen 3 x 10');

    await nutzer.type(feld, ', Plank');
    await nutzer.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
    await waitFor(() =>
      expect(saveTrainingProtocol).toHaveBeenCalledWith(
        TERMIN,
        'Kniebeugen 3 x 10, Plank',
        entwurf.updated_at,
      ),
    );
  });

  it('schließt erst nach Rückfrage ab - mit dem Text im Feld', async () => {
    getTrainingProtocol.mockResolvedValue(entwurf);
    const nutzer = userEvent.setup();
    renderWithProviders(<TrainingAppointmentPage user={testUser(['trainer'], 'Tom')} />);
    await nutzer.click(await screen.findByRole('button', { name: 'Protokoll abschließen' }));
    expect(screen.getByText(/lässt sich danach nicht mehr ändern/)).toBeInTheDocument();
    expect(finalizeTrainingProtocol).not.toHaveBeenCalled();

    await nutzer.click(screen.getByRole('button', { name: 'Ja, abschließen' }));
    await waitFor(() =>
      expect(finalizeTrainingProtocol).toHaveBeenCalledWith(
        TERMIN,
        'Kniebeugen 3 x 10',
        entwurf.updated_at,
      ),
    );
  });

  it('zeigt ein abgeschlossenes Protokoll nur noch zum Lesen', async () => {
    getTrainingAppointment.mockResolvedValue({ ...termin, status: 'documented' });
    getTrainingProtocol.mockResolvedValue({
      ...entwurf,
      status: 'final',
      finalized_at: '2027-05-13T09:10:00+00:00',
      finalized_by_name: 'Tom Trainingsbetreuung',
    });
    renderWithProviders(<TrainingAppointmentPage user={testUser(['trainer'], 'Tom')} />);
    expect(await screen.findByText('Kniebeugen 3 x 10')).toBeInTheDocument();
    expect(screen.getByText(/Abgeschlossen am 13\.05\.2027, 11:10 von Tom/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Was in der Einheit gemacht wurde')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Protokoll abschließen' })).toBeNull();
    // Ein dokumentierter Termin hat keinen Rückweg (ADR-018 Punkt 2).
    expect(screen.queryByRole('button', { name: 'Wieder öffnen' })).toBeNull();
  });

  it('zeigt dem Büro kein Protokoll (ANN-184)', async () => {
    renderWithProviders(<TrainingAppointmentPage user={testUser(['office'], 'Olivia')} />);
    expect(await screen.findByRole('button', { name: 'Termin absagen' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Trainingsprotokoll' })).toBeNull();
    expect(getTrainingProtocol).not.toHaveBeenCalled();
  });

  it('bietet an einem abgesagten Termin kein Protokoll an', async () => {
    getTrainingAppointment.mockResolvedValue({
      ...termin,
      status: 'cancelled',
      cancellation_reason: 'other',
    });
    renderWithProviders(<TrainingAppointmentPage user={testUser(['trainer'], 'Tom')} />);
    await screen.findByRole('link', { name: 'Tina Trainingskundin' });
    expect(screen.queryByRole('heading', { name: 'Trainingsprotokoll' })).toBeNull();
  });
});

describe('Einheiten einer Kundin', () => {
  const kundin = {
    id: TINA,
    person_id: '44444444-4444-4444-8444-000000000009',
    given_name: 'Tina',
    family_name: 'Trainingskundin',
    status: 'active' as const,
    contract_started_on: '2026-03-02',
    contract_ended_on: null,
    date_of_birth: null,
    email: null,
    phone: null,
    street: null,
    postal_code: null,
    city: null,
  };

  it('listet die Einheiten mit Datum, Art und Text - ohne Zähler und Bewertung', async () => {
    listTrainingProtocols.mockResolvedValue([
      {
        id: PROTOKOLL,
        appointment_id: TERMIN,
        starts_at: '2027-05-13T08:00:00+00:00',
        ends_at: '2027-05-13T09:00:00+00:00',
        appointment_type: 'video',
        staff_given_name: 'Tom',
        staff_family_name: 'Trainingsbetreuung',
        status: 'final',
        content: 'Rudern 4 x 8',
        finalized_at: '2027-05-13T09:10:00+00:00',
        author_name: 'Tom Trainingsbetreuung',
        organization_time_zone: 'Europe/Berlin',
      },
    ]);
    renderWithProviders(<TrainingEinheiten kundin={kundin} />);
    expect(await screen.findByText('Rudern 4 x 8')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2027/ })).toHaveAttribute(
      'href',
      expect.stringContaining(`/training/termine/${TERMIN}`),
    );
    expect(screen.queryByText(/Einheiten gesamt|Fortschritt|Verschlechter/)).toBeNull();
  });

  it('sagt, wo ein Protokoll entsteht, solange es keines gibt', async () => {
    listTrainingProtocols.mockResolvedValue([]);
    renderWithProviders(<TrainingEinheiten kundin={kundin} />);
    expect(await screen.findByText(/Es entsteht am Trainingstermin/)).toBeInTheDocument();
  });
});
