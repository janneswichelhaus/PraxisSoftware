import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PrescriptionsApi from './api';
import type * as RouterModule from 'react-router-dom';
import type * as SessionContextModule from '@/features/auth/sessionContext';
import { renderWithProviders } from '@/test-utils';

const PRESCRIBER_ID = '77777777-7777-4777-8777-000000000001';
const BENUTZER_ID = '11111111-1111-4111-8111-000000000002';

const fetchPrescriber = vi.fn();
const createPrescriber = vi.fn();
const updatePrescriber = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PrescriptionsApi>();
  return {
    ...actual,
    fetchPrescriber: (id: string) =>
      fetchPrescriber(id) as Promise<PrescriptionsApi.Prescriber | null>,
    createPrescriber: (values: unknown) => createPrescriber(values) as Promise<string>,
    updatePrescriber: (id: string, values: unknown) =>
      updatePrescriber(id, values) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ prescriberId: PRESCRIBER_ID }),
  };
});

// Der Entwurfsspeicher bindet an die Benutzer-ID aus der Sitzung (ANN-019) -
// ohne diesen Mock würde useSession() außerhalb eines SessionProvider werfen.
// Der echte Zusammenspiel-Test mit tatsächlicher Anmeldeperson lebt in
// PrescriptionFormPage.entwurf.test.tsx.
vi.mock('@/features/auth/sessionContext', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContextModule>();
  return {
    ...actual,
    useSession: () => ({
      session: { user: { id: BENUTZER_ID } },
      initialising: false,
      signOut: vi.fn(),
    }),
  };
});

const { EditPrescriberPage, NewPrescriberPage } = await import('./PrescriberFormPage');
const { VerordnerBereitsVorhanden } = await import('./api');

const bestand: PrescriptionsApi.Prescriber = {
  id: PRESCRIBER_ID,
  title: 'Dr. med.',
  given_name: 'Petra',
  family_name: 'Probst',
  practice_name: 'Praxis Fiktiv',
  speciality: 'Orthopaedie',
  street: 'Aerztegasse',
  house_number: '3',
  postal_code: '72070',
  city: 'Tuebingen',
  phone: '+49 7071 0000401',
  fax: null,
  email: null,
};

describe('NewPrescriberPage', () => {
  beforeEach(() => {
    createPrescriber.mockReset();
    navigate.mockReset();
  });

  it('verlangt einen Nachnamen und schreibt ohne ihn nicht', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    expect(await screen.findByText('Nachname ist erforderlich.')).toBeInTheDocument();
    expect(createPrescriber).not.toHaveBeenCalled();
  });

  it('trimmt Texte und sendet leere Optionalfelder als null', async () => {
    createPrescriber.mockResolvedValue('neue-id');
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.type(screen.getByLabelText('Nachname *'), '  Probst  ');
    await user.type(screen.getByLabelText('Praxis oder Einrichtung'), 'Praxis Fiktiv');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    await waitFor(() => expect(createPrescriber).toHaveBeenCalledTimes(1));
    expect(createPrescriber).toHaveBeenCalledWith({
      family_name: 'Probst',
      given_name: null,
      title: null,
      practice_name: 'Praxis Fiktiv',
      speciality: null,
      street: null,
      house_number: null,
      postal_code: null,
      city: null,
      phone: null,
      fax: null,
      email: null,
    });
  });

  it('erklaert einen Doppeleintrag, statt nur zu scheitern', async () => {
    createPrescriber.mockRejectedValue(new VerordnerBereitsVorhanden());
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.type(screen.getByLabelText('Nachname *'), 'Probst');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    expect(await screen.findByText('Diese Verordner:in ist bereits erfasst.')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('legt bei doppeltem Absenden nur einen Datensatz an', async () => {
    let aufloesen: (id: string) => void = () => {};
    createPrescriber.mockReturnValue(
      new Promise<string>((resolve) => {
        aufloesen = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.type(screen.getByLabelText('Nachname *'), 'Probst');
    const knopf = screen.getByRole('button', { name: 'Verordner:in anlegen' });
    await user.click(knopf);
    await user.click(knopf);

    expect(createPrescriber).toHaveBeenCalledTimes(1);
    aufloesen('neue-id');
  });

  it('sendet keine Organisation und keine IDs mit', async () => {
    createPrescriber.mockResolvedValue('neue-id');
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.type(screen.getByLabelText('Nachname *'), 'Probst');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    await waitFor(() => expect(createPrescriber).toHaveBeenCalledTimes(1));
    const gesendet = JSON.stringify(createPrescriber.mock.calls[0]?.[0]);
    expect(gesendet).not.toMatch(/organization/i);
    expect(gesendet).not.toMatch(/"id"/);
  });

  // Das Nachtragen der neuen Verordner:in in einen vorhandenen Entwurf des
  // Verordnungsformulars (VER-003) und der Fall ohne vorhandenen Entwurf sind
  // als Store-Verhalten in api.test.ts abgedeckt (entwurfVerordnerNachtragen)
  // und im echten Seitenwechsel in PrescriptionFormPage.entwurf.test.tsx.
});

describe('EditPrescriberPage', () => {
  beforeEach(() => {
    fetchPrescriber.mockReset();
    fetchPrescriber.mockResolvedValue(bestand);
    updatePrescriber.mockReset();
    updatePrescriber.mockResolvedValue(undefined);
    navigate.mockReset();
  });

  it('befuellt das Formular mit den aktuellen Werten', async () => {
    renderWithProviders(<EditPrescriberPage />);

    expect(await screen.findByLabelText('Nachname *')).toHaveValue('Probst');
    expect(screen.getByLabelText('Titel')).toHaveValue('Dr. med.');
    expect(screen.getByLabelText('Praxis oder Einrichtung')).toHaveValue('Praxis Fiktiv');
    expect(screen.getByLabelText('Telefax')).toHaveValue('');
  });

  it('speichert die Aenderung und kehrt zur Kartei zurueck', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditPrescriberPage />);
    await screen.findByLabelText('Nachname *');

    await user.type(screen.getByLabelText('Telefax'), '+49 7071 0000402');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updatePrescriber).toHaveBeenCalledTimes(1));
    expect(updatePrescriber.mock.calls[0]?.[0]).toBe(PRESCRIBER_ID);
    expect(updatePrescriber.mock.calls[0]?.[1]).toMatchObject({ fax: '+49 7071 0000402' });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/verordner', { replace: true }));
  });

  it('zeigt einen unzugaenglichen Datensatz nicht als Formular', async () => {
    fetchPrescriber.mockResolvedValue(null);
    renderWithProviders(<EditPrescriberPage />);

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nachname *')).not.toBeInTheDocument();
  });
});
