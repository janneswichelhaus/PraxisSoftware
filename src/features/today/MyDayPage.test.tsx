import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, within } from '@testing-library/react';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import type * as AppointmentsApiModule from '@/features/appointments/api';
import type * as TodayApiModule from '@/features/today/api';
import { renderMitVorschau, testUser } from '@/test-utils';
import { MyDayPage } from './MyDayPage';

/**
 * „Mein Tag" mischt bewusst zwei Dinge: echte Termine aus dem Kalender und
 * Hinweise aus Bereichen, die noch keine Anbindung haben. Geprüft wird, dass
 * beides unterscheidbar bleibt, dass die eigenen Besuche nicht über den
 * Anzeigenamen, sondern über die Beschäftigtenkennung gefunden werden, und
 * seit UX-001, dass die Tagesliste die Angaben trägt, an denen ein Hausbesuch
 * sonst scheitert.
 */

// Dieselbe Kennung, die `testUser` einer Praxisrolle gibt.
const EIGENE_STAFF_ID = '55555555-5555-4555-8555-000000000002';
const FREMDE_STAFF_ID = 'staff-fremde';
const HEUTE = '2026-08-31';

function termin(teil: Partial<AppointmentsApiModule.CalendarEntry>) {
  return {
    id: 'termin-1',
    patient_id: 'p1',
    staff_member_id: EIGENE_STAFF_ID,
    location_id: null,
    appointment_type: 'home_visit' as const,
    status: 'scheduled' as const,
    starts_at: `${HEUTE}T08:00:00.000Z`,
    ends_at: `${HEUTE}T08:45:00.000Z`,
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    location_name: null,
    ...teil,
  };
}

const termine = [
  termin({ id: 't1' }),
  termin({
    id: 't2',
    staff_member_id: FREMDE_STAFF_ID,
    starts_at: `${HEUTE}T10:00:00.000Z`,
    ends_at: `${HEUTE}T10:45:00.000Z`,
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    staff_given_name: 'Olivia',
    staff_family_name: 'Office',
  }),
];

function tagesEintrag(teil: Partial<TodayApiModule.DayPlanEntry>): TodayApiModule.DayPlanEntry {
  return {
    id: 't1',
    patient_id: 'p1',
    staff_member_id: EIGENE_STAFF_ID,
    appointment_type: 'home_visit',
    status: 'scheduled',
    starts_at: `${HEUTE}T08:00:00.000Z`,
    ends_at: `${HEUTE}T08:45:00.000Z`,
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    patient_phone: '+49 7071 0000006',
    patient_phone_mobile: '+49 160 0000006',
    home_visit_access_note: 'Erdgeschoss, Klingel "Beispiel".',
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: 'Europe/Berlin',
    ...teil,
  };
}

const tagesplan: TodayApiModule.DayPlanEntry[] = [
  tagesEintrag({ id: 't1' }),
  tagesEintrag({
    id: 't3',
    starts_at: `${HEUTE}T12:00:00.000Z`,
    ends_at: `${HEUTE}T12:45:00.000Z`,
    status: 'completed',
    documentation_status: 'final',
    patient_given_name: 'Petra',
    patient_family_name: 'Platzhalter',
    visit_street: 'Fiktivgasse',
    visit_house_number: '9',
    visit_postal_code: '72074',
    home_visit_access_note: null,
  }),
];

const fetchDayPlan = vi.fn();

vi.mock('@/features/today/api', async (importOriginal) => {
  const actual = await importOriginal<typeof TodayApiModule>();
  return {
    ...actual,
    fetchDayPlan: () => fetchDayPlan() as Promise<TodayApiModule.DayPlanEntry[]>,
  };
});

/**
 * Haelt den abgefragten Zeitbereich fest.
 *
 * Der Bereich war lange falsch (`von` und `bis` derselbe Tag) und ist es
 * niemandem aufgefallen, weil dieser Ersatz die Argumente gar nicht ansah.
 */
const fetchAppointments = vi.fn();

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApiModule>();
  return {
    ...actual,
    fetchAppointments: (query: AppointmentsApiModule.CalendarQuery) => {
      fetchAppointments(query);
      return Promise.resolve(termine);
    },
  };
});

/**
 * Eigener Aufbau mit festgehaltenem QueryClient.
 *
 * `renderMitVorschau` legt je Aufruf einen neuen an; fuer den Tagesplan-Cache
 * (UX-011) wird aber genau der gemeinsame Speicher gebraucht, ueber den ein
 * zweiter, gescheiterter Abruf laeuft.
 */
function rendernMitCache(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VorschauProvider>
          <MyDayPage user={testUser(['therapist'])} />
        </VorschauProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Mein Tag', () => {
  beforeEach(() => {
    fetchDayPlan.mockReset();
    fetchDayPlan.mockResolvedValue(tagesplan);
    fetchAppointments.mockClear();
  });

  it('fragt den Tagesplan des Teams als halboffenen Bereich ab', async () => {
    // `list_appointments` weist `p_to <= p_from` mit "to must be after from"
    // zurueck. Genau das stand hier: derselbe Tag zweimal - der Abschnitt
    // zeigte dauerhaft "Die Termine konnten nicht geladen werden".
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Tagesplan des Teams' });

    const query = fetchAppointments.mock.calls[0]?.[0] as
      AppointmentsApiModule.CalendarQuery | undefined;
    expect(query).toBeDefined();
    expect(query!.bis > query!.von).toBe(true);
    expect(screen.queryByText('Die Termine konnten nicht geladen werden.')).toBeNull();
  });

  it('stellt die offenen eigenen Besuche vor den Tagesplan des Teams', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

    expect(await screen.findByRole('heading', { name: /^Offen heute/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tagesplan des Teams' })).toBeInTheDocument();
  });

  it('zaehlt nur das, was heute noch offen ist', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    // Ein offener Besuch, ein abgeschlossener mit finalisierter Dokumentation.
    expect(await screen.findByRole('heading', { name: 'Offen heute (1)' })).toBeInTheDocument();
    expect(screen.getByText('Erledigt heute (1)')).toBeInTheDocument();
  });

  it('traegt Anschrift, Zugangshinweis und Rufnummer als Waehlziel', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

    const offen = (await screen.findByRole('heading', { name: /^Offen heute/ })).closest(
      'section',
    )!;

    expect(await within(offen).findByText('Testweg 7')).toBeInTheDocument();
    expect(within(offen).getByText('72072 Tuebingen')).toBeInTheDocument();
    expect(within(offen).getByText(/Erdgeschoss, Klingel/)).toBeInTheDocument();

    // Kontakt ist Aktion, nicht Text: die Nummer waehlt, statt nur dazustehen.
    const mobil = within(offen).getByRole('link', { name: /Mobil/ });
    expect(mobil).toHaveAttribute('href', 'tel:+491600000006');
  });

  it('zeigt den Tagesplan des Teams weiterhin ohne Anschrift', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

    const teamplan = (await screen.findByRole('heading', { name: 'Tagesplan des Teams' })).closest(
      'section',
    )!;
    expect(await within(teamplan).findByText('Max Mustermann')).toBeInTheDocument();
    expect(within(teamplan).queryByText('Testweg 7')).toBeNull();
  });

  it('ist kein Begruessungsbildschirm mit Patientenzaehler', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['office'])} />);
    await screen.findByRole('heading', { name: 'Tagesplan des Teams' });
    expect(screen.queryByText(/Personen in laufender Versorgung/)).toBeNull();
  });

  it('kennzeichnet den noch nicht angebundenen Teil als zusammengefaltete Vorschau', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

    const ueberschrift = await screen.findByRole('heading', { name: 'Betrieb, Wege und Team' });
    expect(ueberschrift).toBeInTheDocument();
    // Zusammengefaltet: der echte Teil des Tages steht davor, nicht dahinter.
    expect(ueberschrift.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText(/Es entstehen keine echten Vorgänge/)).toBeInTheDocument();
  });

  it('benennt die Demoperson, der die Vorschaudaten gehoeren', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Betrieb, Wege und Team' });
    expect(screen.getByText(/zur Rolle passend gewählt/)).toBeInTheDocument();
  });

  it('sagt bei den Wegen, dass die Zeiten geschaetzt und nicht berechnet sind', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Betrieb, Wege und Team' });
    expect(screen.getByText(/Wegzeiten sind geschätzt, nicht berechnet/)).toBeInTheDocument();
  });

  it('bietet den schnellen Weg zur Pannenmeldung', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    expect(await screen.findByRole('link', { name: 'Panne melden' })).toHaveAttribute(
      'href',
      '/betrieb/flotte/panne',
    );
  });

  it('zeigt Leitungsrollen ihre Freigabeaufgaben', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['team_lead'])} />);
    expect(await screen.findByText('Zu entscheiden')).toBeInTheDocument();
  });

  it('zeigt einer behandelnden Rolle keine Freigabeaufgaben', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Betrieb, Wege und Team' });
    expect(screen.queryByText('Zu entscheiden')).toBeNull();
  });

  it('zeigt einem Patientenkonto weder Termine noch Betriebsbereiche', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['patient'], 'Max Mustermann')} />);
    expect(await screen.findByRole('heading', { name: 'Ihr Zugang' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tagesplan des Teams' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Betrieb, Wege und Team' })).toBeNull();
  });

  describe('UX-011: Tagesplan bleibt lesbar', () => {
    it('zeigt den zuletzt geladenen Stand weiter, wenn die Abfrage scheitert', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      rendernMitCache(queryClient);
      expect(await screen.findByText('Testweg 7')).toBeInTheDocument();

      // Das Funkloch im Treppenhaus: der naechste Abruf scheitert.
      fetchDayPlan.mockRejectedValue(new Error('Funkloch'));
      await act(async () => {
        await queryClient.refetchQueries({ queryKey: ['day-plan'] });
      });

      expect(await screen.findByText(/Angezeigt wird der Stand von/)).toBeInTheDocument();
      // Entscheidend: die Anschrift steht noch da.
      expect(screen.getByText('Testweg 7')).toBeInTheDocument();
      expect(screen.getByText(/Erdgeschoss, Klingel/)).toBeInTheDocument();
    });

    it('zeigt ohne jeden Stand die Fehlermeldung statt einer leeren Liste', async () => {
      fetchDayPlan.mockRejectedValue(new Error('Funkloch'));
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(
        await screen.findByText('Die Tagesliste konnte nicht geladen werden.'),
      ).toBeInTheDocument();
    });

    it('behauptet bei frischem Stand nichts ueber sein Alter', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await screen.findByText('Testweg 7');
      expect(screen.queryByText(/Angezeigt wird der Stand von/)).toBeNull();
    });
  });
});
