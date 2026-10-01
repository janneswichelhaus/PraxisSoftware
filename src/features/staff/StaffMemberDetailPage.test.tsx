import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as StaffApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testStaffMember, testUser } from '@/test-utils';

const STAFF_ID = '55555555-5555-4555-8555-000000000002';

const aktiv = testStaffMember({
  id: STAFF_ID,
  work_phone: '+49 7071 0000102',
  primary_location_id: '33333333-3333-4333-8333-000000000001',
  primary_location_name: 'Hauptstandort Tuebingen',
});

const fetchStaffMember = vi.fn();
const setStaffEmploymentStatus = vi.fn();
const fetchStaffFutureAppointments = vi.fn();
const fetchAssignableTherapists = vi.fn();
const fetchVerguetungsmodell = vi.fn();
const setzeVerguetungsmodell = vi.fn();

// Kalender und Arbeitszeiten kennen nur zuordenbare Personen (UX-012); die
// Seite fragt deshalb, ob diese Person ueberhaupt behandelt.
vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    fetchStaffMember: (id: string) => fetchStaffMember(id) as Promise<StaffApi.StaffMember | null>,
    setStaffEmploymentStatus: (id: string, status: string, bestaetigt?: boolean) =>
      setStaffEmploymentStatus(id, status, bestaetigt) as Promise<void>,
    fetchStaffFutureAppointments: (id: string) =>
      fetchStaffFutureAppointments(id) as Promise<StaffApi.FutureAppointment[]>,
    fetchVerguetungsmodell: (id: string) =>
      fetchVerguetungsmodell(id) as Promise<StaffApi.Verguetungsmodell | null>,
    setzeVerguetungsmodell: (id: string, modell: string | null) =>
      setzeVerguetungsmodell(id, modell) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useParams: () => ({ staffMemberId: STAFF_ID }),
}));

const { StaffMemberDetailPage } = await import('./StaffMemberDetailPage');
const { OffeneTermineError } = await import('./api');

/** Der letzte Schreibvorgang mit seinem Bestätigungskennzeichen. */
function letzterStatusaufruf(): { id: string; status: string; bestaetigt: boolean | undefined } {
  const aufruf = setStaffEmploymentStatus.mock.calls.at(-1) as
    [string, string, boolean | undefined] | undefined;
  if (!aufruf) throw new Error('Es wurde kein Statuswechsel ausgelöst.');
  return { id: aufruf[0], status: aufruf[1], bestaetigt: aufruf[2] };
}

describe('StaffMemberDetailPage', () => {
  beforeEach(() => {
    fetchStaffMember.mockReset();
    setStaffEmploymentStatus.mockReset();
    fetchStaffFutureAppointments.mockReset();
    fetchStaffMember.mockResolvedValue(aktiv);
    setStaffEmploymentStatus.mockResolvedValue(undefined);
    fetchStaffFutureAppointments.mockResolvedValue([]);
    fetchVerguetungsmodell.mockReset().mockResolvedValue(null);
    setzeVerguetungsmodell.mockReset().mockResolvedValue(undefined);
    fetchAssignableTherapists.mockReset();
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: STAFF_ID, display_name: 'Anna Beispiel' },
    ]);
  });

  // ---------------------------------------------------------------------------
  // UX-012: Der Datensatz ist der Ausgangspunkt fuer das, was mit dieser Person
  // zu tun ist - anrufen, schreiben, nachsehen wann sie arbeitet.
  // ---------------------------------------------------------------------------
  describe('Kontakt und Planung', () => {
    it('bietet Diensttelefon und dienstliche E-Mail als Weg an', async () => {
      renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
      // Der erste Test einer Datei zahlt das erste Zeichnen; unter Last dauert
      // das laenger als die Sekunde, die findBy von sich aus wartet.
      await screen.findByRole('heading', { name: 'Anna Beispiel' }, { timeout: 5000 });

      expect(screen.getByRole('link', { name: '+49 7071 0000102' })).toHaveAttribute(
        'href',
        'tel:+4970710000102',
      );
      expect(screen.getByRole('link', { name: 'anna.beispiel@praxis.invalid' })).toHaveAttribute(
        'href',
        'mailto:anna.beispiel@praxis.invalid',
      );
    });

    it('fuehrt in die Woche im Kalender und zu den Arbeitszeiten dieser Person', async () => {
      renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Anna Beispiel' });

      const kalender = await screen.findByRole('link', { name: 'Woche im Kalender' });
      expect(kalender.getAttribute('href')).toContain(`person=${STAFF_ID}`);
      expect(kalender.getAttribute('href')).toContain('ansicht=woche');
      expect(screen.getByRole('link', { name: 'Arbeitszeiten' })).toHaveAttribute(
        'href',
        `/praxis/planung?person=${STAFF_ID}`,
      );
    });

    it('bietet beides nicht an, wenn die Person gar nicht behandelt - und sagt warum (ORG-25)', async () => {
      fetchAssignableTherapists.mockResolvedValue([]);
      renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Anna Beispiel' });

      await waitFor(() => expect(fetchAssignableTherapists).toHaveBeenCalled());
      expect(screen.queryByRole('link', { name: 'Woche im Kalender' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Arbeitszeiten' })).not.toBeInTheDocument();
      expect(
        await screen.findByText(
          /Nicht für Termine zuordenbar – dafür braucht die Person einen Zugang/,
        ),
      ).toBeInTheDocument();
    });

    it('sagt ohne geladene Antwort nichts zur Zuordenbarkeit (ORG-14)', async () => {
      fetchAssignableTherapists.mockRejectedValue(new Error('kaputt'));
      renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Anna Beispiel' });

      await waitFor(() => expect(fetchAssignableTherapists).toHaveBeenCalled());
      expect(screen.queryByText(/Nicht für Termine zuordenbar/)).not.toBeInTheDocument();
    });

    it('fragt fuer trainer nicht nach zuordenbaren Personen (BEF-034)', async () => {
      // Die Datenbank weist trainer ab; jeder Seitenaufruf stuende sonst als
      // `denied` im Auditlog. Kalender und Arbeitszeiten sind trainer ohnehin
      // verschlossen.
      renderWithProviders(<StaffMemberDetailPage user={testUser(['trainer'])} />);
      await screen.findByRole('heading', { name: 'Anna Beispiel' });
      expect(fetchAssignableTherapists).not.toHaveBeenCalled();
      expect(screen.queryByRole('link', { name: 'Woche im Kalender' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Nicht für Termine zuordenbar/)).not.toBeInTheDocument();
    });

    it('macht Telefon und E-Mail zu Links mit 44 px Tippziel (RSP-05)', async () => {
      renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Anna Beispiel' });

      for (const name of ['+49 7071 0000102', 'anna.beispiel@praxis.invalid']) {
        expect(screen.getByRole('link', { name })).toHaveClass('min-h-11', 'underline');
      }
    });
  });

  it('nennt den Abschnitt „Zugang“ nur, wo es ihn gibt (ORG-25)', async () => {
    renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
    await screen.findByRole('heading', { name: 'Anna Beispiel' });

    expect(screen.queryByRole('heading', { name: 'Zugang' })).not.toBeInTheDocument();
    // Seit UX-005i ohne Fußnote: Die Seite erklärt nicht, was sie nicht zeigt.
    expect(screen.queryByText(/Zugänge und Rollen vergibt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/im Abschnitt/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Benutzerkonto|Mitarbeiterdatensatz|getrennt/);
  });

  it('zeigt die dienstlichen Angaben', async () => {
    renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
    expect(await screen.findByRole('heading', { name: 'Anna Beispiel' })).toBeInTheDocument();
    expect(screen.getByText('Hauptstandort Tuebingen')).toBeInTheDocument();
  });

  it('zeigt keine Privatangaben, wenn der Server keine geliefert hat', async () => {
    renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
    await screen.findByRole('heading', { name: 'Anna Beispiel' });
    // Die Felder werden gar nicht erst geliefert - nicht nur ausgeblendet.
    expect(screen.queryByText('Privat')).not.toBeInTheDocument();
  });

  it('zeigt Privatangaben, wenn der Server sie geliefert hat', async () => {
    fetchStaffMember.mockResolvedValue({
      ...aktiv,
      date_of_birth: '1992-06-02',
      private_phone: '+49 7071 0000002',
    });
    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
    expect(await screen.findByText('Privat')).toBeInTheDocument();
    expect(screen.getByText('+49 7071 0000002')).toBeInTheDocument();
  });

  it.each([['therapist'], ['team_lead']] as const)(
    'bietet %s weder Bearbeiten noch Statuswechsel an',
    async (role) => {
      renderWithProviders(<StaffMemberDetailPage user={testUser([role])} />);
      await screen.findByRole('heading', { name: 'Anna Beispiel' });
      expect(screen.queryByRole('link', { name: 'Stammdaten bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Als inaktiv führen' })).not.toBeInTheDocument();
    },
  );

  // E10 teilt die beiden Rechte: das Office pflegt Stammdaten, der
  // Statuswechsel bleibt bei der Praxisinhaberin.
  it('bietet office das Bearbeiten an, aber keinen Statuswechsel', async () => {
    renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
    expect(await screen.findByRole('link', { name: 'Stammdaten bearbeiten' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Als inaktiv führen' })).not.toBeInTheDocument();
  });

  it('bietet owner die Verwaltung an', async () => {
    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
    const link = await screen.findByRole('link', { name: 'Stammdaten bearbeiten' });
    expect(link).toHaveAttribute('href', `/praxis/team/${STAFF_ID}/bearbeiten`);
    expect(screen.getByRole('button', { name: 'Als inaktiv führen' })).toBeInTheDocument();
  });

  it('schreibt erst nach der Rueckfrage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Als inaktiv führen' }));
    expect(setStaffEmploymentStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Als inaktiv führen' }));
    await waitFor(() => expect(setStaffEmploymentStatus).toHaveBeenCalledTimes(1));
    expect(letzterStatusaufruf()).toEqual({
      id: STAFF_ID,
      status: 'inactive',
      bestaetigt: false,
    });
  });

  it('sagt in der Rueckfrage zu, dass bestehende Zuordnungen erhalten bleiben', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Als inaktiv führen' }));
    expect(screen.getByText(/bleiben vollständig erhalten/)).toBeInTheDocument();
    expect(
      screen.getByText(/Zugang zur Anwendung wird dadurch nicht gesperrt/),
    ).toBeInTheDocument();
  });

  it('zeigt die offenen Termine, wenn der Server die Deaktivierung abweist', async () => {
    const user = userEvent.setup();
    setStaffEmploymentStatus.mockRejectedValueOnce(new OffeneTermineError());
    fetchStaffFutureAppointments.mockResolvedValue([
      {
        id: '77777777-7777-4777-8777-000000000001',
        starts_at: '2026-09-15T08:00:00.000Z',
        ends_at: '2026-09-15T09:00:00.000Z',
        appointment_type: 'home_visit',
        patient_id: '66666666-6666-4666-8666-000000000001',
        kind: 'therapy' as const,
        title: null,
        patient_given_name: 'Max',
        patient_family_name: 'Mustermann',
        location_name: null,
      },
    ]);

    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
    await user.click(await screen.findByRole('button', { name: 'Als inaktiv führen' }));
    await user.click(screen.getByRole('button', { name: 'Als inaktiv führen' }));

    expect(await screen.findByText(/noch Termine in der Zukunft geplant/)).toBeInTheDocument();
    expect(await screen.findByText(/Max Mustermann/)).toBeInTheDocument();
    // Der abgewiesene Vorgang hat nichts geschrieben: der Status steht noch.
    expect(screen.getByText(/weder abgesagt noch umgebucht/)).toBeInTheDocument();
  });

  it('wiederholt den Vorgang erst nach ausdruecklicher Bestaetigung', async () => {
    const user = userEvent.setup();
    setStaffEmploymentStatus.mockRejectedValueOnce(new OffeneTermineError());
    fetchStaffFutureAppointments.mockResolvedValue([]);

    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
    await user.click(await screen.findByRole('button', { name: 'Als inaktiv führen' }));
    await user.click(screen.getByRole('button', { name: 'Als inaktiv führen' }));

    const erneut = await screen.findByRole('button', {
      name: 'Trotz offener Termine deaktivieren',
    });
    expect(setStaffEmploymentStatus).toHaveBeenCalledTimes(1);
    expect(letzterStatusaufruf().bestaetigt).toBe(false);

    await user.click(erneut);
    await waitFor(() => expect(setStaffEmploymentStatus).toHaveBeenCalledTimes(2));
    expect(letzterStatusaufruf().bestaetigt).toBe(true);
  });

  it('bietet bei einer inaktiven Person die Reaktivierung an', async () => {
    const user = userEvent.setup();
    fetchStaffMember.mockResolvedValue({ ...aktiv, employment_status: 'inactive' });

    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
    await user.click(await screen.findByRole('button', { name: 'Wieder als aktiv führen' }));
    await user.click(screen.getByRole('button', { name: 'Wieder als aktiv führen' }));

    await waitFor(() => expect(setStaffEmploymentStatus).toHaveBeenCalledTimes(1));
    expect(letzterStatusaufruf().status).toBe('active');
  });

  it('bestaetigt den Wechsel am Knopf und nimmt den Fokus dorthin (ZST-16)', async () => {
    // Bis UXR-011 aenderte sich nur der Seitenkopf - am Telefon weit ueber
    // dem Knopf, und der Fokus fiel an den Seitenanfang.
    const user = userEvent.setup();
    fetchStaffMember
      .mockResolvedValueOnce(aktiv)
      .mockResolvedValue({ ...aktiv, employment_status: 'inactive' });
    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Als inaktiv führen' }));
    await user.click(screen.getByRole('button', { name: 'Als inaktiv führen' }));

    const meldung = await screen.findByText('Als inaktiv geführt.');
    expect(meldung.closest('[tabindex="-1"]')).toHaveFocus();
    expect(
      screen.getByText('Inaktiv – wird nicht mehr für neue Termine angeboten.'),
    ).toBeInTheDocument();
  });

  it('sagt beim gescheiterten Wechsel, was zu tun ist (ORG-15)', async () => {
    const user = userEvent.setup();
    setStaffEmploymentStatus.mockRejectedValue(new Error('Netz weg'));
    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Als inaktiv führen' }));
    await user.click(screen.getByRole('button', { name: 'Als inaktiv führen' }));

    expect(
      await screen.findByText(
        'Der Beschäftigungsstatus konnte nicht geändert werden. Bitte die Verbindung prüfen und erneut versuchen.',
      ),
    ).toBeInTheDocument();
  });

  it('zeigt eine verstaendliche Meldung, wenn der Datensatz nicht sichtbar ist', async () => {
    fetchStaffMember.mockResolvedValue(null);
    renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.getByText(/Diese Person gibt es nicht/)).toBeInTheDocument();
    // Auch ohne Datensatz traegt die Seite einen Titel und einen Weg zurueck.
    expect(screen.getByRole('heading', { level: 1, name: 'Mitarbeiter:in' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '← Zurück zu den Mitarbeitenden' }),
    ).toBeInTheDocument();
  });

  it('bietet bei einem Ladefehler einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    fetchStaffMember.mockRejectedValueOnce(new Error('kaputt'));
    renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);

    expect(
      await screen.findByText('Die Mitarbeiterdaten konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('heading', { name: 'Anna Beispiel' })).toBeInTheDocument();
  });

  describe('Vergütungsmodell (STA-005)', () => {
    it('laesst owner das Modell eintragen', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
      const auswahl = await screen.findByLabelText('Vergütungsmodell');
      expect(auswahl).toHaveValue('');
      await user.selectOptions(auswahl, 'revenue_share');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(setzeVerguetungsmodell).toHaveBeenCalledWith(STAFF_ID, 'revenue_share');
    });

    it('zeigt den Abschnitt keiner anderen Rolle', async () => {
      renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
      expect(await screen.findByRole('heading', { name: 'Anna Beispiel' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Vergütungsmodell')).toBeNull();
      expect(fetchVerguetungsmodell).not.toHaveBeenCalled();
    });
  });
});
