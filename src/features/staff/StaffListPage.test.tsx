import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as StaffApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import { renderWithProviders, testStaffMember, testUser } from '@/test-utils';

const anna = testStaffMember({
  work_phone: '+49 7071 0000102',
  primary_location_name: 'Hauptstandort Tuebingen',
});

const nina: StaffApi.StaffMember = {
  ...anna,
  id: '55555555-5555-4555-8555-0000000000aa',
  person_id: '44444444-4444-4444-8444-0000000000aa',
  given_name: 'Nina',
  family_name: 'Neu',
  work_email: null,
  work_phone: null,
  primary_location_name: null,
};

const tim: StaffApi.StaffMember = {
  ...anna,
  id: '55555555-5555-4555-8555-000000000004',
  person_id: '44444444-4444-4444-8444-000000000004',
  given_name: 'Tim',
  family_name: 'Teamleitung',
  work_phone: '+49 7071 0000104',
  employment_status: 'inactive',
};

const fetchStaffMembers = vi.fn();
const fetchAssignableTherapists = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    fetchStaffMembers: () => fetchStaffMembers() as Promise<StaffApi.StaffMember[]>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
  };
});

const { StaffListPage } = await import('./StaffListPage');

describe('StaffListPage', () => {
  beforeEach(() => {
    fetchStaffMembers.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchStaffMembers.mockResolvedValue([anna, nina, tim]);
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: anna.id, display_name: 'Anna Beispiel' },
    ]);
  });

  it('listet die Mitarbeitenden mit ihrer dienstlichen Erreichbarkeit', async () => {
    renderWithProviders(<StaffListPage user={testUser(['office'])} />);
    // Der erste Test einer Datei zahlt das erste Zeichnen; unter Last dauert das
    // laenger als die Sekunde, die findBy von sich aus wartet.
    expect(
      await screen.findByRole('link', { name: /Anna Beispiel/ }, { timeout: 5000 }),
    ).toHaveAttribute('href', `/praxis/team/${anna.id}`);
    expect(screen.getByText(/\+49 7071 0000102/)).toBeInTheDocument();
  });

  it('kennzeichnet inaktive Personen mit dem Etikett des Systems', async () => {
    renderWithProviders(<StaffListPage user={testUser(['office'])} />);
    const etikett = await screen.findByText('Inaktiv', { selector: 'span' });
    expect(etikett).toHaveClass('rounded-pill');
  });

  it('weist aus, wer trotz aktiver Beschaeftigung nicht fuer Termine zuordenbar ist', async () => {
    // Nina hat keinen eigenen Zugang mit therapeutischer Rolle. Das ist eine
    // andere Frage als der Beschaeftigungsstatus und wird getrennt angezeigt.
    renderWithProviders(<StaffListPage user={testUser(['owner'])} />);
    expect(await screen.findByText('Nicht für Termine zuordenbar')).toBeInTheDocument();
  });

  it('fragt fuer trainer nicht nach zuordenbaren Personen (BEF-034)', async () => {
    renderWithProviders(<StaffListPage user={testUser(['trainer'])} />);
    expect(await screen.findByRole('link', { name: /Anna Beispiel/ })).toBeInTheDocument();
    expect(fetchAssignableTherapists).not.toHaveBeenCalled();
    // Ohne Antwort keine Aussage: der Hinweis bleibt weg, statt falsch zu sein.
    expect(screen.queryByText('Nicht für Termine zuordenbar')).toBeNull();
    // Die Regel zur Zuordenbarkeit erklaert die Seite dieser Rolle nicht -
    // sie sieht das Etikett nie (ORG-25).
    expect(screen.queryByText(/Als behandelnde Person zuordenbar ist/)).toBeNull();
  });

  it('sagt nach einem Ladefehler nichts ueber die Zuordenbarkeit, sondern meldet ihn (ORG-14)', async () => {
    // Bis UXR-011 trug danach jede aktive Person „nicht zuordenbar".
    fetchAssignableTherapists.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<StaffListPage user={testUser(['owner'])} />);

    expect(
      await screen.findByText(/Ob jemand für Termine zuordenbar ist, konnte nicht geladen werden/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(screen.queryByText('Nicht für Termine zuordenbar')).toBeNull();
  });

  it('gibt Suche und Filter als Rueckweg in den Datensatz mit (ORG-24)', async () => {
    renderWithProviders(
      <StaffListPage user={testUser(['office'])} />,
      '/praxis/team?status=active',
    );

    const link = await screen.findByRole('link', { name: /Anna Beispiel/ });
    expect(link).toHaveAttribute(
      'href',
      `/praxis/team/${anna.id}?zurueck=${encodeURIComponent('/praxis/team?status=active')}`,
    );
  });

  it('nutzt fuer den Filter den Baustein mit 48 px (ORG-16, TOK-13)', async () => {
    renderWithProviders(<StaffListPage user={testUser(['office'])} />);
    await screen.findByRole('link', { name: /Anna Beispiel/ });
    expect(screen.getByLabelText('Beschäftigung')).toHaveClass('h-12', 'w-full');
  });

  it('sagt nur der Praxisinhaber:in, wo Zugaenge entstehen (ORG-25)', async () => {
    const { unmount } = renderWithProviders(<StaffListPage user={testUser(['owner'])} />);
    expect(
      await screen.findByText(/Zugang und Rollen vergeben Sie bei der Person unter „Zugang“/),
    ).toBeInTheDocument();
    unmount();

    renderWithProviders(<StaffListPage user={testUser(['office'])} />);
    expect(await screen.findByText(/Als behandelnde Person zuordenbar ist/)).toBeInTheDocument();
    expect(screen.queryByText(/Zugang und Rollen vergeben Sie/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/therapeutischer Rolle/);
  });

  it('bietet nur der administrativen Rolle die Anlage an', async () => {
    renderWithProviders(<StaffListPage user={testUser(['owner'])} />);
    expect(await screen.findByRole('link', { name: 'Mitarbeiter:in anlegen' })).toHaveAttribute(
      'href',
      '/praxis/team/neu',
    );
  });

  it('bietet office die Anlage an (E10)', async () => {
    renderWithProviders(<StaffListPage user={testUser(['office'])} />);
    expect(await screen.findByRole('link', { name: 'Mitarbeiter:in anlegen' })).toBeInTheDocument();
  });

  it.each([['therapist'], ['team_lead']] as const)(
    'blendet die Anlage fuer %s aus',
    async (role) => {
      renderWithProviders(<StaffListPage user={testUser([role])} />);
      await screen.findByRole('link', { name: /Anna Beispiel/ });
      expect(
        screen.queryByRole('link', { name: 'Mitarbeiter:in anlegen' }),
      ).not.toBeInTheDocument();
    },
  );

  it('meldet einen Ladefehler verstaendlich und bietet einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    fetchStaffMembers.mockRejectedValueOnce(new Error('kaputt'));
    renderWithProviders(<StaffListPage user={testUser(['office'])} />);
    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Die Mitarbeiterliste konnte nicht geladen werden.');
    // Keine Ratefrage mehr, sondern der naechste Schritt (WRT-01).
    expect(meldung).not.toHaveTextContent(/angemeldet/);

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('link', { name: /Anna Beispiel/ })).toBeInTheDocument();
  });
});
