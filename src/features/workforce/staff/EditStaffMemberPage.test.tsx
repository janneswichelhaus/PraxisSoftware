import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as StaffApi from './api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testStaffMember, testUser } from '@/test-utils';

const STAFF_ID = '55555555-5555-4555-8555-000000000002';

/** Zurück führt in den Reiter, der die Stammdaten zeigt (R2-O6). */
const KONTAKT = `/praxis/team/${STAFF_ID}?bereich=kontakt`;

const anna = testStaffMember({
  id: STAFF_ID,
  work_phone: '+49 7071 0000102',
  primary_location_id: '33333333-3333-4333-8333-000000000001',
  primary_location_name: 'Hauptstandort Tuebingen',
  date_of_birth: '1992-06-02',
  private_email: 'anna.privat@beispiel.invalid',
  private_phone: '+49 7071 0000002',
  street: 'Beispielweg 2',
  postal_code: '72072',
  city: 'Tuebingen',
});

const fetchStaffMember = vi.fn();
const updateStaffMember = vi.fn();
const fetchLocations = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    fetchStaffMember: (id: string) => fetchStaffMember(id) as Promise<StaffApi.StaffMember | null>,
    updateStaffMember: (id: string, values: StaffApi.StaffMasterDataValues, privat?: boolean) =>
      updateStaffMember(id, values, privat) as Promise<void>,
    fetchLocations: () => fetchLocations() as Promise<StaffApi.Location[]>,
  };
});
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ staffMemberId: STAFF_ID }),
}));

const { EditStaffMemberPage } = await import('./EditStaffMemberPage');

// Die Tests tippen ganze Formulare; unter Last reichen 5 s dafuer nicht (Muster wie BausteinFeld).
describe('EditStaffMemberPage', { timeout: 20_000 }, () => {
  beforeEach(() => {
    fetchStaffMember.mockReset();
    updateStaffMember.mockReset();
    fetchLocations.mockReset();
    navigate.mockReset();
    fetchStaffMember.mockResolvedValue(anna);
    updateStaffMember.mockResolvedValue(undefined);
    fetchLocations.mockResolvedValue([
      { id: '33333333-3333-4333-8333-000000000001', name: 'Hauptstandort Tuebingen' },
    ]);
  });

  it('fuellt das Formular aus dem gelesenen Datensatz vor', async () => {
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);
    expect(await screen.findByLabelText('Vorname *')).toHaveValue('Anna');
    expect(screen.getByLabelText('Diensttelefon')).toHaveValue('+49 7071 0000102');
    expect(screen.getByLabelText('Geburtsdatum')).toHaveValue('1992-06-02');
  });

  it('speichert die geaenderten Werte und kehrt zum Datensatz zurueck', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);

    const telefon = await screen.findByLabelText('Diensttelefon');
    await user.clear(telefon);
    await user.type(telefon, '+49 7071 999');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateStaffMember).toHaveBeenCalledTimes(1));
    expect(updateStaffMember.mock.calls[0]?.[0]).toBe(STAFF_ID);
    expect(updateStaffMember.mock.calls[0]?.[1]).toMatchObject({
      given_name: 'Anna',
      work_phone: '+49 7071 999',
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(KONTAKT, { replace: true }));
  });

  it('bietet den Beschaeftigungsstatus nicht als Eingabefeld an', async () => {
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);
    await screen.findByLabelText('Vorname *');
    // Der Statuswechsel hat einen eigenen Vorgang mit eigener Rueckfrage.
    expect(screen.queryByLabelText(/Beschäftigung/)).not.toBeInTheDocument();
  });

  it('zeigt eine verstaendliche Meldung, wenn der Datensatz nicht sichtbar ist', async () => {
    fetchStaffMember.mockResolvedValue(null);
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);
    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.getByText(/Diese Person gibt es nicht/)).toBeInTheDocument();
    // Auch ohne Datensatz gibt es Titel und Weg zurueck (ORG-24).
    expect(
      screen.getByRole('heading', { level: 1, name: 'Stammdaten bearbeiten' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Zurück zu den Stammdaten' })).toHaveAttribute(
      'href',
      KONTAKT,
    );
  });

  it('bietet bei einem Ladefehler einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    fetchStaffMember.mockRejectedValueOnce(new Error('kaputt'));
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);

    expect(
      await screen.findByText('Die Mitarbeiterdaten konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByLabelText('Vorname *')).toHaveValue('Anna');
  });

  it('nennt die Person im Rueckweg und macht Abbrechen zum Link (ORG-24, WRT-02)', async () => {
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);
    await screen.findByLabelText('Vorname *');

    expect(screen.getByRole('link', { name: '← Zurück zu Anna Beispiel' })).toHaveAttribute(
      'href',
      KONTAKT,
    );
    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', KONTAKT);
  });

  it('fragt vor dem Weggehen nur, wenn etwas geaendert ist (ORG-03)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EditStaffMemberPage user={testUser(['owner'])} />,
      `/praxis/team/${STAFF_ID}/bearbeiten`,
    );

    const telefon = await screen.findByLabelText('Diensttelefon');
    await user.clear(telefon);
    await user.type(telefon, '+49 1');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

    const rueckfrage = await screen.findByRole('group', { name: 'Ungespeicherte Eingaben' });
    await user.click(within(rueckfrage).getByRole('button', { name: 'Hier bleiben' }));
    expect(screen.getByLabelText('Diensttelefon')).toHaveValue('+49 1');
    expect(updateStaffMember).not.toHaveBeenCalled();
  });

  it('meldet einen Speicherfehler im Fenster und laesst die Eingaben stehen (ORG-15)', async () => {
    const user = userEvent.setup();
    updateStaffMember.mockRejectedValue(new Error('Details aus der Datenbank'));
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);

    await screen.findByLabelText('Vorname *');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    const fenster = await screen.findByRole('dialog', {
      name: 'Die Stammdaten konnten nicht gespeichert werden.',
    });
    expect(fenster).toHaveTextContent('Bitte die Verbindung prüfen und erneut speichern.');
    expect(screen.queryByText(/Details aus der Datenbank/)).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sagt, wenn die Standorte fehlen, statt nur „kein fester Standort" anzubieten (ORG-14)', async () => {
    // Bis Überholung 6 stand diese Prüfung an der Anlage. Den Hauptstandort
    // fragt seitdem nur noch das Bearbeiten ab - die Prüfung zieht mit.
    fetchLocations.mockRejectedValue(new Error('kaputt'));
    fetchStaffMember.mockResolvedValue({
      ...anna,
      primary_location_id: null,
      primary_location_name: null,
    });
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);

    expect(
      await screen.findByText('Die Standorte konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// E10: das Office pflegt Stammdaten, sieht die Privatangaben aber nicht
// ---------------------------------------------------------------------------
describe('EditStaffMemberPage fuer office (E10, ANN-024)', { timeout: 20_000 }, () => {
  beforeEach(() => {
    fetchStaffMember.mockReset();
    updateStaffMember.mockReset();
    fetchLocations.mockReset();
    navigate.mockReset();
    // So kommt der Datensatz beim Office tatsaechlich an: die Privatspalten
    // filtert die RLS der Basistabelle weg, sie sind null.
    fetchStaffMember.mockResolvedValue({
      ...anna,
      date_of_birth: null,
      private_email: null,
      private_phone: null,
      street: null,
      postal_code: null,
      city: null,
    });
    updateStaffMember.mockResolvedValue(undefined);
    fetchLocations.mockResolvedValue([
      { id: '33333333-3333-4333-8333-000000000001', name: 'Hauptstandort Tuebingen' },
    ]);
  });

  it('zeigt den Abschnitt Privat gar nicht erst', async () => {
    renderWithProviders(<EditStaffMemberPage user={testUser(['office'])} />);

    expect(await screen.findByLabelText('Diensttelefon')).toBeInTheDocument();
    expect(screen.queryByLabelText('Private E-Mail')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Geburtsdatum')).not.toBeInTheDocument();
    // Seit R2-O7 kürzer, Aussage gleich: Privates pflegt nur owner, und es
    // bleibt beim Speichern stehen.
    expect(
      screen.getByText(/Privates pflegt nur die Praxisinhaber:in; es bleibt beim Speichern/),
    ).toBeInTheDocument();
  });

  it('speichert ohne Privatangaben, damit nichts geleert wird', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditStaffMemberPage user={testUser(['office'])} />);

    const telefon = await screen.findByLabelText('Diensttelefon');
    await user.clear(telefon);
    await user.type(telefon, '+49 7071 111');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateStaffMember).toHaveBeenCalledTimes(1));
    expect(updateStaffMember.mock.calls[0]?.[2]).toBe(false);
  });

  it('schickt fuer owner die Privatangaben mit', async () => {
    const user = userEvent.setup();
    fetchStaffMember.mockResolvedValue(anna);
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);

    expect(await screen.findByLabelText('Private E-Mail')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateStaffMember).toHaveBeenCalledTimes(1));
    expect(updateStaffMember.mock.calls[0]?.[2]).toBe(true);
  });
});
