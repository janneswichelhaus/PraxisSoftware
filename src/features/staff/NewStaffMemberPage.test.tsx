import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as StaffApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

const createStaffMember = vi.fn();
const fetchLocations = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    createStaffMember: (values: StaffApi.StaffMasterDataValues) =>
      createStaffMember(values) as Promise<string>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchLocations: () => fetchLocations() as Promise<AppointmentsApi.Location[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const { NewStaffMemberPage } = await import('./NewStaffMemberPage');

// Die Tests tippen ganze Formulare; unter Last reichen 5 s dafuer nicht (Muster wie BausteinFeld).
describe('NewStaffMemberPage', { timeout: 20_000 }, () => {
  beforeEach(() => {
    createStaffMember.mockReset();
    fetchLocations.mockReset();
    navigate.mockReset();
    createStaffMember.mockResolvedValue('55555555-5555-4555-8555-0000000000aa');
    fetchLocations.mockResolvedValue([
      { id: '33333333-3333-4333-8333-000000000001', name: 'Hauptstandort Tuebingen' },
    ]);
  });

  it('verlangt Vor- und Nachname', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    expect(await screen.findAllByText('Vorname ist erforderlich.')).toHaveLength(2);
    expect(screen.getAllByText('Nachname ist erforderlich.')).toHaveLength(2);
    expect(createStaffMember).not.toHaveBeenCalled();
  });

  it('fuehrt aus der Fehlerzusammenfassung ins Feld', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveTextContent('Nachname ist erforderlich.');

    await user.click(screen.getByRole('link', { name: 'Nachname ist erforderlich.' }));
    expect(screen.getByLabelText('Nachname *')).toHaveFocus();
  });

  it('nennt dem Office keine Privatangabe, die es gar nicht sieht', async () => {
    // Ohne Privatzugriff fehlt der Abschnitt (ANN-024); ein Eintrag dorthin
    // fuehrte ins Leere.
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['office'])} />);

    expect(screen.queryByLabelText('Private E-Mail')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveTextContent('Vorname ist erforderlich.');
    expect(kasten).not.toHaveTextContent('Private E-Mail');
    expect(kasten).not.toHaveTextContent('Geburtsdatum');
  });

  it('legt an und leitet auf den neuen Datensatz weiter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await user.type(screen.getByLabelText('Vorname *'), 'Nina');
    await user.type(screen.getByLabelText('Nachname *'), 'Neu');
    await user.type(screen.getByLabelText('Dienstliche E-Mail'), 'nina.neu@praxis.invalid');
    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    await waitFor(() => expect(createStaffMember).toHaveBeenCalledTimes(1));
    expect(createStaffMember.mock.calls[0]?.[0]).toMatchObject({
      given_name: 'Nina',
      family_name: 'Neu',
      work_email: 'nina.neu@praxis.invalid',
      // Leere Optionalfelder gehen als null, nicht als leerer Text.
      work_phone: null,
      primary_location_id: null,
      date_of_birth: null,
    });
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/praxis/team/55555555-5555-4555-8555-0000000000aa', {
        replace: true,
      }),
    );
  });

  it('weist eine unbrauchbare E-Mail-Adresse ab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await user.type(screen.getByLabelText('Vorname *'), 'Nina');
    await user.type(screen.getByLabelText('Nachname *'), 'Neu');
    await user.type(screen.getByLabelText('Private E-Mail'), 'keine-adresse');
    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    expect(await screen.findByText('Keine gültige E-Mail-Adresse.')).toBeInTheDocument();
    expect(createStaffMember).not.toHaveBeenCalled();
  });

  it('sagt ausdruecklich, dass kein Zugang entsteht', () => {
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);
    expect(screen.getByText(/kein Zugang zur Anwendung/)).toBeInTheDocument();
  });

  it('meldet einen fehlgeschlagenen Schreibvorgang im Fenster, ohne Details preiszugeben (ORG-15)', async () => {
    // Bis UXR-011 stand der Fehler oben im Formular, am Telefon rund 1000 px
    // ueber dem Knopf und ohne Fokus.
    const user = userEvent.setup();
    createStaffMember.mockRejectedValue(new Error('irgendetwas aus der Datenbank'));
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await user.type(screen.getByLabelText('Vorname *'), 'Nina');
    await user.type(screen.getByLabelText('Nachname *'), 'Neu');
    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    const fenster = await screen.findByRole('dialog', {
      name: 'Die Mitarbeiter:in konnte nicht angelegt werden.',
    });
    expect(fenster).toHaveTextContent('Die Eingaben stehen noch im Formular.');
    expect(fenster).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
    expect(screen.queryByText(/irgendetwas aus der Datenbank/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zurück zum Formular' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Vorname *')).toHaveValue('Nina');
    expect(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' })).toHaveFocus();
  });

  // ---------------------------------------------------------------------------
  // ORG-03, ZST-05: Eingaben gehen nicht still verloren. Ohne Entwurfszustand
  // bietet die Rückfrage nur Verwerfen und Bleiben an (ANN-046).
  // ---------------------------------------------------------------------------
  it('fragt vor dem Weggehen, wenn etwas eingegeben ist, und behaelt die Eingabe beim Bleiben', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['office'])} />, '/praxis/team/neu');

    await user.type(screen.getByLabelText('Vorname *'), 'Nora');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

    const rueckfrage = await screen.findByRole('group', { name: 'Ungespeicherte Eingaben' });
    expect(
      within(rueckfrage).getByRole('button', { name: 'Verwerfen und weitergehen' }),
    ).toBeInTheDocument();
    expect(
      within(rueckfrage).queryByRole('button', { name: /Speichern und/ }),
    ).not.toBeInTheDocument();

    await user.click(within(rueckfrage).getByRole('button', { name: 'Hier bleiben' }));
    expect(screen.getByLabelText('Vorname *')).toHaveValue('Nora');
    expect(createStaffMember).not.toHaveBeenCalled();
  });

  it('warnt vor dem Neuladen nur, wenn etwas eingegeben ist', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />, '/praxis/team/neu');

    const leer = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leer);
    expect(leer.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText('Nachname *'), 'Neu');
    const gefuellt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(gefuellt);
    expect(gefuellt.defaultPrevented).toBe(true);
  });

  it('fuehrt Rueckweg und Abbrechen dorthin, woher die Anlage kam (ORG-24)', () => {
    renderWithProviders(
      <NewStaffMemberPage user={testUser(['owner'])} />,
      `/praxis/team/neu?zurueck=${encodeURIComponent('/kalender?ansicht=woche')}`,
    );

    // „Abbrechen" ist ein Link, kein Knopf mit navigate() (UIK-13).
    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute(
      'href',
      '/kalender?ansicht=woche',
    );
    expect(screen.getByRole('link', { name: '← Zurück zum Kalender' })).toHaveAttribute(
      'href',
      '/kalender?ansicht=woche',
    );
  });

  it('nimmt den Rueckweg nach dem Anlegen in den neuen Datensatz mit (ORG-24)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <NewStaffMemberPage user={testUser(['owner'])} />,
      `/praxis/team/neu?zurueck=${encodeURIComponent('/kalender')}`,
    );

    await user.type(screen.getByLabelText('Vorname *'), 'Nina');
    await user.type(screen.getByLabelText('Nachname *'), 'Neu');
    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        `/praxis/team/55555555-5555-4555-8555-0000000000aa?zurueck=${encodeURIComponent('/kalender')}`,
        { replace: true },
      ),
    );
  });

  it('sagt, wenn die Standorte fehlen, statt nur „kein fester Standort" anzubieten (ORG-14)', async () => {
    fetchLocations.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    expect(
      await screen.findByText('Die Standorte konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});
