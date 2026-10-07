import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TrainingApi from './api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Bereich Training (TRN-002). Die Grenzen sitzt im Server (ADR-004); geprüft
 * wird hier, was die Seiten anbieten und welche Aufrufe sie machen.
 */

const TINA = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const MAX_PERSON = '44444444-4444-4444-8444-000000000005';

const listTrainingClients = vi.fn();
const getTrainingClient = vi.fn();
const createTrainingClient = vi.fn();
const startTrainingForPerson = vi.fn();
const updateTrainingClient = vi.fn();
const endTrainingRelationship = vi.fn();
const reopenTrainingRelationship = vi.fn();
const findPossibleTrainingDuplicates = vi.fn();
const listTrainingBases = vi.fn();
const listTrainingClientAppointments = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TrainingApi>();
  return {
    ...actual,
    listTrainingClients: () => listTrainingClients() as Promise<unknown>,
    getTrainingClient: (id: string) => getTrainingClient(id) as Promise<unknown>,
    createTrainingClient: (werte: unknown) => createTrainingClient(werte) as Promise<string>,
    startTrainingForPerson: (id: string, werte: unknown) =>
      startTrainingForPerson(id, werte) as Promise<string>,
    updateTrainingClient: (id: string, werte: unknown) =>
      updateTrainingClient(id, werte) as Promise<void>,
    endTrainingRelationship: (id: string, tag: string) =>
      endTrainingRelationship(id, tag) as Promise<void>,
    reopenTrainingRelationship: (id: string) => reopenTrainingRelationship(id) as Promise<void>,
    findPossibleTrainingDuplicates: (v: string, n: string, g: string | null) =>
      findPossibleTrainingDuplicates(v, n, g) as Promise<unknown>,
    listTrainingBases: (id: string) => listTrainingBases(id) as Promise<unknown>,
    listTrainingClientAppointments: (id: string) =>
      listTrainingClientAppointments(id) as Promise<unknown>,
    // TRN-009: Die Einheiten haben eigene Tests (training-protokoll.test.tsx).
    listTrainingProtocols: () => Promise.resolve([]),
    // POR-017: Die Einwilligung hat eigene Tests (TrainingEinwilligung.test.tsx).
    listTrainingConsents: () => Promise.resolve([]),
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ relationshipId: TINA }),
}));

const { TrainingClientsPage } = await import('./TrainingClientsPage');
const { NewTrainingClientPage } = await import('./NewTrainingClientPage');
const { TrainingClientPage } = await import('./TrainingClientPage');

const tina = {
  id: TINA,
  person_id: '44444444-4444-4444-8444-000000000009',
  given_name: 'Tina',
  family_name: 'Trainingskundin',
  status: 'active',
  contract_started_on: '2026-09-01',
  contract_ended_on: null,
  date_of_birth: '1990-01-02',
  email: 'tina@beispiel.invalid',
  phone: '+49 7071 0000109',
  street: 'Trainingsweg 1',
  postal_code: '72070',
  city: 'Tuebingen',
};

beforeEach(() => {
  for (const f of [
    listTrainingClients,
    getTrainingClient,
    createTrainingClient,
    startTrainingForPerson,
    updateTrainingClient,
    endTrainingRelationship,
    reopenTrainingRelationship,
    findPossibleTrainingDuplicates,
    listTrainingBases,
    listTrainingClientAppointments,
    navigate,
  ]) {
    f.mockReset();
  }
  findPossibleTrainingDuplicates.mockResolvedValue([]);
  listTrainingBases.mockResolvedValue([]);
  listTrainingClientAppointments.mockResolvedValue([]);
});

describe('TrainingClientsPage', () => {
  it('listet Name und Vertrag, keinen Kontakt', async () => {
    listTrainingClients.mockResolvedValue([
      tina,
      {
        ...tina,
        id: 'eeeeeeee-eeee-4eee-8eee-000000000002',
        given_name: 'Erika',
        family_name: 'Beispiel',
        status: 'inactive',
        contract_ended_on: '2026-09-20',
      },
    ]);
    renderWithProviders(<TrainingClientsPage user={testUser(['trainer'])} />);

    const link = await screen.findByRole('link', { name: /Tina Trainingskundin/ });
    expect(link).toHaveAttribute('href', `/training/${TINA}`);
    expect(screen.getByText('Vertrag seit 01.09.2026')).toBeInTheDocument();
    expect(screen.getByText('Vertrag beendet am 20.09.2026')).toBeInTheDocument();
    expect(screen.getByText('Beendet')).toBeInTheDocument();
    expect(screen.queryByText('tina@beispiel.invalid')).toBeNull();
    expect(screen.getByRole('link', { name: 'Trainingskund:in anlegen' })).toBeInTheDocument();
  });

  it('filtert die Liste nach Namen', async () => {
    const user = userEvent.setup();
    listTrainingClients.mockResolvedValue([tina]);
    renderWithProviders(<TrainingClientsPage user={testUser(['office'])} />);
    await screen.findByRole('link', { name: /Tina/ });
    await user.type(screen.getByLabelText('Liste filtern'), 'xyz');
    expect(screen.getByText('Keine Treffer')).toBeInTheDocument();
  });

  it('meldet einen Ladefehler mit einem Weg hinaus', async () => {
    listTrainingClients.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<TrainingClientsPage user={testUser(['trainer'])} />);
    expect(
      await screen.findByText('Die Trainingskund:innen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});

describe('NewTrainingClientPage', () => {
  async function ausfuellen(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Vorname *'), 'Max');
    await user.type(screen.getByLabelText('Nachname *'), 'Mustermann');
  }

  it('verlangt Vor- und Nachnamen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewTrainingClientPage />);
    await user.click(screen.getByRole('button', { name: 'Trainingskund:in anlegen' }));
    expect(await screen.findByText('Bitte den Vornamen angeben.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nachname *')).toHaveAttribute('aria-invalid', 'true');
    expect(createTrainingClient).not.toHaveBeenCalled();
  });

  it('legt ohne Dublette an und öffnet die neue Trainingskund:in', async () => {
    const user = userEvent.setup();
    createTrainingClient.mockResolvedValue(TINA);
    renderWithProviders(<NewTrainingClientPage />);
    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Trainingskund:in anlegen' }));

    await waitFor(() => expect(createTrainingClient).toHaveBeenCalledTimes(1));
    expect(findPossibleTrainingDuplicates).toHaveBeenCalledWith('Max', 'Mustermann', null);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/training/${TINA}`, { replace: true }),
    );
  });

  it('bietet bei einem Treffer aus der Behandlung das Training ohne zweite Person an (ANN-173)', async () => {
    const user = userEvent.setup();
    findPossibleTrainingDuplicates.mockResolvedValue([
      {
        kind: 'patient',
        training_relationship_id: null,
        person_id: MAX_PERSON,
        given_name: 'Max',
        family_name: 'Mustermann',
        date_of_birth: '1957-04-30',
      },
    ]);
    startTrainingForPerson.mockResolvedValue(TINA);
    renderWithProviders(<NewTrainingClientPage />);
    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Trainingskund:in anlegen' }));

    expect(await screen.findByText(/In der Behandlung bekannt/)).toBeInTheDocument();
    expect(createTrainingClient).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Training für diese Person beginnen' }));
    // Die Eingaben aus dem Formular gehen mit (Zweitreview), aus der Akte nichts.
    await waitFor(() =>
      expect(startTrainingForPerson).toHaveBeenCalledWith(
        MAX_PERSON,
        expect.objectContaining({ given_name: 'Max', family_name: 'Mustermann' }),
      ),
    );
    expect(createTrainingClient).not.toHaveBeenCalled();
  });

  it('führt bei einer vorhandenen Trainingskund:in zu ihr und legt erst beim zweiten Tipp an', async () => {
    const user = userEvent.setup();
    findPossibleTrainingDuplicates.mockResolvedValue([
      {
        kind: 'training',
        training_relationship_id: TINA,
        person_id: MAX_PERSON,
        given_name: 'Max',
        family_name: 'Mustermann',
        date_of_birth: null,
      },
    ]);
    createTrainingClient.mockResolvedValue('eeeeeeee-eeee-4eee-8eee-0000000000aa');
    renderWithProviders(<NewTrainingClientPage />);
    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Trainingskund:in anlegen' }));

    const link = await screen.findByRole('link', { name: /schon im Training/ });
    expect(link).toHaveAttribute('href', `/training/${TINA}`);
    expect(screen.queryByRole('button', { name: 'Training für diese Person beginnen' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Trainingskund:in anlegen' }));
    await waitFor(() => expect(createTrainingClient).toHaveBeenCalledTimes(1));
  });
});

describe('TrainingClientPage', () => {
  it('zeigt Kontakt und Vertrag und bietet Beenden an', async () => {
    getTrainingClient.mockResolvedValue(tina);
    renderWithProviders(<TrainingClientPage user={testUser(['trainer'])} />);

    expect(
      await screen.findByRole('heading', { name: 'Tina Trainingskundin' }),
    ).toBeInTheDocument();
    expect(getTrainingClient).toHaveBeenCalledWith(TINA);
    expect(getTrainingClient).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'tina@beispiel.invalid' })).toHaveAttribute(
      'href',
      'mailto:tina@beispiel.invalid',
    );
    expect(screen.getByText('Trainingsweg 1, 72070 Tuebingen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vertrag beenden' })).toBeInTheDocument();
    // Kein Wort über eine Behandlung (§4.8).
    expect(screen.queryByText(/Akte|Patient/)).toBeNull();
  });

  it('beendet den Vertrag erst nach der Rückfrage mit dem gewählten Tag', async () => {
    const user = userEvent.setup();
    getTrainingClient.mockResolvedValue(tina);
    endTrainingRelationship.mockResolvedValue(undefined);
    renderWithProviders(
      <TrainingClientPage
        user={{ ...testUser(['trainer']), organizationTimeZone: 'Europe/Berlin' }}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Vertrag beenden' }));
    expect(screen.getByText(/Aufbewahrung von drei Jahren/)).toBeInTheDocument();
    const feld = screen.getByLabelText('Letzter Vertragstag');
    await user.clear(feld);
    await user.type(feld, '2026-09-15');
    await user.click(screen.getByRole('button', { name: 'Vertrag beenden' }));
    await waitFor(() => expect(endTrainingRelationship).toHaveBeenCalledWith(TINA, '2026-09-15'));
  });

  it('nimmt einen beendeten Vertrag wieder auf', async () => {
    const user = userEvent.setup();
    getTrainingClient.mockResolvedValue({
      ...tina,
      status: 'inactive',
      contract_ended_on: '2026-09-20',
    });
    reopenTrainingRelationship.mockResolvedValue(undefined);
    renderWithProviders(<TrainingClientPage user={testUser(['office'])} />);
    expect(await screen.findByText('Vertrag beendet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vertrag wieder aufnehmen' }));
    await user.click(screen.getByRole('button', { name: 'Vertrag wieder aufnehmen' }));
    await waitFor(() => expect(reopenTrainingRelationship).toHaveBeenCalledWith(TINA));
  });

  it('speichert Änderungen und verlangt den Vertragsbeginn', async () => {
    const user = userEvent.setup();
    getTrainingClient.mockResolvedValue(tina);
    updateTrainingClient.mockResolvedValue(undefined);
    renderWithProviders(<TrainingClientPage user={testUser(['trainer'])} />);
    await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));

    await user.clear(screen.getByLabelText('Vertragsbeginn *'));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findAllByText('Bitte den Vertragsbeginn angeben.')).toHaveLength(2);
    expect(updateTrainingClient).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Vertragsbeginn *'), '2026-09-02');
    await user.clear(screen.getByLabelText('Telefon'));
    await user.type(screen.getByLabelText('Telefon'), '+49 7071 0000200');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(updateTrainingClient).toHaveBeenCalledWith(
        TINA,
        expect.objectContaining({ phone: '+49 7071 0000200', contract_started_on: '2026-09-02' }),
      ),
    );
  });

  it('bietet einer Rolle ohne Schreibrecht nichts zum Ändern an', async () => {
    getTrainingClient.mockResolvedValue(tina);
    // Nur Darstellung: therapist bekommt die Seite gar nicht und vom Server
    // keine Zeile. Hier die zweite Linie der Oberfläche.
    renderWithProviders(<TrainingClientPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Tina Trainingskundin' });
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vertrag beenden' })).toBeNull();
  });
});
