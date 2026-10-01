import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import type * as AppointmentsApiModule from '@/features/appointments/api';
import type * as TodayApiModule from '@/features/today/api';
import { renderMitVorschau, testUser } from '@/test-utils';
import { MyDayPage } from './MyDayPage';

/**
 * Die Übersicht mischt bewusst zwei Dinge: echte Termine aus dem Kalender und
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
    status: 'confirmed' as const,
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
    kind: 'therapy',
    title: null,
    status: 'confirmed',
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

// PRX-013: offene Erstaufnahmen; ohne Angabe keine.
const fetchOpenIntakes = vi.fn(() => Promise.resolve([] as unknown[]));
vi.mock('@/features/open-points/intake-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchOpenIntakes: () => fetchOpenIntakes(),
}));

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApiModule>();
  return {
    ...actual,
    fetchAppointments: (query: AppointmentsApiModule.CalendarQuery) =>
      fetchAppointments(query) as Promise<AppointmentsApiModule.CalendarEntry[]>,
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

describe('Übersicht', () => {
  beforeEach(() => {
    fetchDayPlan.mockReset();
    fetchDayPlan.mockResolvedValue(tagesplan);
    fetchAppointments.mockReset();
    fetchAppointments.mockResolvedValue(termine);
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
    expect(await screen.findByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.queryByText('Der Tagesplan des Teams konnte nicht geladen werden.')).toBeNull();
  });

  it('nennt an der Karte, was zur Erstaufnahme noch fehlt (PRX-013)', async () => {
    fetchOpenIntakes.mockResolvedValueOnce([
      {
        patient_id: 'p1',
        patient_given_name: 'Erika',
        patient_family_name: 'Beispiel',
        open_items: ['finding', 'treatment_table'],
      },
    ]);
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    expect(await screen.findByText('Befund · Liege')).toBeInTheDocument();
    expect(screen.getByText('Erstaufnahme offen:')).toBeInTheDocument();
  });

  it('bietet Doku als eigenen Weg neben dem Abschluss an (IDEA-PRX-040)', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    const offen = (await screen.findByRole('heading', { name: /^Offen heute/ })).closest(
      'section',
    )!;

    // Schreiben ohne Abschluss: der Abschluss schreibt als Version 1 fest.
    // Der Name beginnt mit dem sichtbaren Wort, damit die Sprachsteuerung
    // „Doku" trifft (UEB-10, WCAG 2.5.3).
    const doku = within(offen).getByRole('link', { name: 'Doku schreiben' });
    // Mit Rueckweg auf die Uebersicht (UX-012).
    expect(doku).toHaveAttribute(
      'href',
      `/termine/t1/dokumentation?zurueck=${encodeURIComponent('/')}`,
    );
    expect(doku).not.toHaveAttribute('aria-label');
    // Sichtbar bleibt es kurz: Der Rest steht nur für Vorlesesoftware da.
    expect(doku.firstChild?.textContent?.trim()).toBe('Doku');
    expect(doku.querySelector('.sr-only')).toHaveTextContent('schreiben');

    expect(within(offen).getByRole('link', { name: 'Behandlung abschließen' })).toHaveAttribute(
      'href',
      `/termine/t1/abschluss?zurueck=${encodeURIComponent('/')}`,
    );
  });

  it('setzt die Rufnummern hinter die Handlungen, ohne sie wegzunehmen', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    const offen = (await screen.findByRole('heading', { name: /^Offen heute/ })).closest(
      'section',
    )!;

    const ziele = within(offen)
      .getAllByRole('link')
      .map((l) => l.getAttribute('href') ?? '');
    const doku = ziele.findIndex((z) => z.includes('/dokumentation'));
    const nummer = ziele.findIndex((z) => z.startsWith('tel:'));

    expect(doku).toBeGreaterThanOrEqual(0);
    // Sie sind weiterhin da - im Hausflur die einzige Rettung eines
    // gescheiterten Besuchs -, stehen aber nicht mehr vorn.
    expect(nummer).toBeGreaterThan(doku);
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

  /**
   * Die Kennzeichnung „Vorschau" am Aufklapper ist am 2026-09-22 gefallen. Was
   * bleibt, ist die Reihenfolge aus UX-001: Der echte Teil des Tages steht
   * davor, der Rest zugeklappt dahinter — das war nie eine Kennzeichnung,
   * sondern die Rangfolge auf dem Bildschirm.
   */
  it('haelt den noch nicht angebundenen Teil zusammengefaltet', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

    const ueberschrift = await screen.findByRole('heading', {
      name: 'Organisatorisches und Kommunikation',
    });
    expect(ueberschrift).toBeInTheDocument();
    expect(ueberschrift.closest('details')).not.toHaveAttribute('open');
  });

  it('benennt die Demoperson, der die Vorschaudaten gehoeren', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });
    expect(screen.getByText(/zur Rolle passend gewählt/)).toBeInTheDocument();
  });

  it('zeigt keine geschaetzten Wegzeiten mehr - die Wege sind seit MAP-006 echt', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
    await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });
    expect(screen.queryByText(/Wegzeiten sind geschätzt/)).toBeNull();
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
    await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });
    expect(screen.queryByText('Zu entscheiden')).toBeNull();
  });

  it('zeigt einem Patientenkonto weder Termine noch Betriebsbereiche', async () => {
    renderMitVorschau(<MyDayPage user={testUser(['patient'], 'Max Mustermann')} />);
    expect(await screen.findByRole('heading', { name: 'Ihr Zugang' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tagesplan des Teams' })).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Organisatorisches und Kommunikation' }),
    ).toBeNull();
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

    it('aktualisiert den alten Stand ueber die Abfrage, nicht ueber ein Neuladen (UEB-05)', async () => {
      const user = userEvent.setup();
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      rendernMitCache(queryClient);
      await screen.findByText('Testweg 7');

      fetchDayPlan.mockRejectedValue(new Error('Funkloch'));
      await act(async () => {
        await queryClient.refetchQueries({ queryKey: ['day-plan'] });
      });
      const meldung = await screen.findByText(/Angezeigt wird der Stand von/);
      // Kein Satz, der nichts sagt, und kein Rat, die Seite neu zu laden
      // (UEB-11, ANN-021).
      expect(meldung).not.toHaveTextContent(/Geschrieben wird|neu laden/);

      fetchDayPlan.mockResolvedValue(tagesplan);
      await user.click(screen.getByRole('button', { name: 'Jetzt aktualisieren' }));

      await waitFor(() => expect(screen.queryByText(/Angezeigt wird der Stand von/)).toBeNull());
      expect(screen.getByText('Testweg 7')).toBeInTheDocument();
    });

    it('zeigt ohne jeden Stand die Fehlermeldung statt einer leeren Liste', async () => {
      const user = userEvent.setup();
      fetchDayPlan.mockRejectedValue(new Error('Funkloch'));
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const fehler = (
        await screen.findByText('Die Tagesliste konnte nicht geladen werden.')
      ).closest('[role="alert"]')!;
      // Was zu tun ist, ohne Ratefrage (WRT-01) - und ein Weg hinaus, der die
      // Seite stehen lässt (ZST-04).
      expect(fehler).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
      expect(fehler).not.toHaveTextContent(/angemeldet/);

      fetchDayPlan.mockResolvedValue(tagesplan);
      await user.click(
        within(fehler as HTMLElement).getByRole('button', { name: 'Erneut versuchen' }),
      );
      expect(await screen.findByText('Testweg 7')).toBeInTheDocument();
    });

    it('behauptet bei frischem Stand nichts ueber sein Alter', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await screen.findByText('Testweg 7');
      expect(screen.queryByText(/Angezeigt wird der Stand von/)).toBeNull();
    });
  });

  describe('UX-EPIC-003: Der Tag beginnt am Rad', () => {
    const zweiBesuche: TodayApiModule.DayPlanEntry[] = [
      tagesEintrag({ id: 't1' }),
      tagesEintrag({
        id: 't2',
        patient_id: 'p2',
        starts_at: `${HEUTE}T10:00:00.000Z`,
        ends_at: `${HEUTE}T10:45:00.000Z`,
        patient_given_name: 'Max',
        patient_family_name: 'Mustermann',
        visit_street: 'Beispielstrasse',
        visit_house_number: '12',
        visit_postal_code: '72070',
        treatment_table_required: true,
      }),
    ];

    it('sagt beim Tagesstart, ab welchem Besuch die Liege mit muss', async () => {
      fetchDayPlan.mockResolvedValue(zweiBesuche);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(await screen.findByText('ja, ab 2. Besuch (12:00 Uhr)')).toBeInTheDocument();
      expect(screen.getByText('Liege heute:')).toBeInTheDocument();
    });

    it('zählt zusammen, was heute mit muss - ohne Namen (PRX-007)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', take_along_items: ['Theraband'] }),
        { ...zweiBesuche[1]!, take_along_items: ['Theraband', 'Kinesiotape'] },
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const zeile = (await screen.findByText('Heute mitnehmen:')).closest('p')!;
      expect(zeile).toHaveTextContent('Heute mitnehmen: Theraband (2), Kinesiotape');
      expect(zeile).not.toHaveTextContent('Mustermann');
    });

    it('zeigt keine Mitnehmen-Zeile, wenn nichts eingetragen ist', async () => {
      fetchDayPlan.mockResolvedValue(zweiBesuche);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await screen.findByText('Erster Weg');
      expect(screen.queryByText('Heute mitnehmen:')).toBeNull();
    });

    it('zeigt keine Liegezeile, wenn heute niemand die Liege braucht (UX-005h)', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await screen.findByText('Erster Weg');
      // „Liege heute: nein" wäre der Regelfall an erster Stelle - die Zeile
      // steht nur, wenn die Liege mit muss.
      expect(screen.queryByText('Liege heute:')).toBeNull();
    });

    it('zeigt den ersten Weg mit Navigation als Hauptknopf und die Vorschau danach', async () => {
      fetchDayPlan.mockResolvedValue(zweiBesuche);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(await screen.findByText('Erster Weg')).toBeInTheDocument();
      expect(screen.getByText('Testweg 7')).toBeInTheDocument();
      // Die erste Navigation ist die des ersten Wegs - in der Hauptfarbe.
      const [ersteNavigation] = screen.getAllByRole('button', { name: 'Navigation starten' });
      expect(ersteNavigation!.className).toContain('bg-accent ');

      // Die Vorschau nennt Zeit, Person und Ziel - und dass die Liege mit muss.
      const danach = screen.getByText('Danach').parentElement!;
      expect(within(danach).getByText('Max Mustermann')).toBeInTheDocument();
      expect(within(danach).getByText(/Beispielstrasse 12/)).toBeInTheDocument();
      expect(within(danach).getByText('mitnehmen')).toBeInTheDocument();

      // Die volle Karte des zweiten Besuchs liegt zugeklappt darunter.
      const weitere = screen.getByText('Weitere offene heute (1)').closest('details')!;
      expect(weitere).not.toHaveAttribute('open');
    });

    it('macht ohne Navigationsziel den Abschluss zum Hauptknopf', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({
          appointment_type: 'practice',
          location_name: 'Hauptstandort',
          visit_street: null,
          visit_house_number: null,
          visit_postal_code: null,
          visit_city: null,
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const abschluss = await screen.findByRole('link', { name: 'Behandlung abschließen' });
      expect(abschluss.className).toContain('bg-accent ');
      expect(screen.queryByRole('button', { name: 'Navigation starten' })).toBeNull();
    });

    it('fuehrt mit einem Tipp zur bisherigen Doku, mit Rueckweg', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      expect(await screen.findByRole('link', { name: 'Bisherige Doku' })).toHaveAttribute(
        'href',
        `/patienten/p1/verlauf?zurueck=${encodeURIComponent('/')}`,
      );
    });

    it('bietet die bisherige Doku nur Rollen an, die den Verlauf lesen', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['patient'], 'Max Mustermann')} />);
      await screen.findByRole('heading', { name: 'Ihr Zugang' });
      expect(screen.queryByRole('link', { name: 'Bisherige Doku' })).toBeNull();
    });

    it('klappt den Plan des Teams fuer Behandelnde zu, fuer das Buero nicht', async () => {
      const { unmount } = renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const zu = await screen.findByRole('heading', { name: 'Tagesplan des Teams' });
      expect(zu.closest('details')).not.toHaveAttribute('open');
      unmount();

      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);
      const offen = await screen.findByRole('heading', { name: 'Tagesplan des Teams' });
      expect(offen.closest('details')).toHaveAttribute('open');
    });
  });

  describe('UXR-003: Befunde aus dem UX-Review', () => {
    /** Ein Zeitpunkt relativ zu jetzt - Fehlzeiten zählen bis zu ihrem Ende. */
    function inStunden(stunden: number): string {
      return new Date(Date.now() + stunden * 60 * 60 * 1000).toISOString();
    }

    function fehlzeit(
      id: string,
      titel: string,
      von: number,
      bis: number,
    ): TodayApiModule.DayPlanEntry {
      return tagesEintrag({
        id,
        kind: 'internal',
        patient_id: null,
        title: titel,
        appointment_type: 'practice',
        location_name: 'Hauptstandort',
        starts_at: inStunden(von),
        ends_at: inStunden(bis),
        patient_given_name: null,
        patient_family_name: null,
        visit_street: null,
        visit_house_number: null,
        visit_postal_code: null,
        visit_city: null,
        patient_phone: null,
        patient_phone_mobile: null,
        home_visit_access_note: null,
        documentation_status: null,
      });
    }

    it('nennt eine anstehende Fehlzeit unter „Heute außerdem", nicht unter „Erledigt" (UEB-02)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1' }),
        fehlzeit('f-spaeter', 'Teambesprechung', 1, 2),
        fehlzeit('f-vorbei', 'Frühbesprechung', -3, -2),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      // Gezählt wird weiter nur der Besuch (ANN-117).
      expect(await screen.findByRole('heading', { name: 'Offen heute (1)' })).toBeInTheDocument();
      const ausserdem = screen.getByText('Heute außerdem:').closest('p')!;
      expect(within(ausserdem).getByRole('link', { name: 'Teambesprechung' })).toHaveAttribute(
        'href',
        `/termine/f-spaeter?zurueck=${encodeURIComponent('/')}`,
      );

      const erledigt = screen.getByText('Erledigt heute (1)').closest('details')!;
      expect(within(erledigt).getByText('Frühbesprechung')).toBeInTheDocument();
      expect(within(erledigt).queryByText('Teambesprechung')).toBeNull();
    });

    it('sagt ohne Besuche nicht, alles sei erledigt - und nennt die Fehlzeit (UEB-02, UEB-11)', async () => {
      fetchDayPlan.mockResolvedValue([fehlzeit('f-spaeter', 'Teambesprechung', 1, 2)]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(
        await screen.findByText('Heute sind Ihnen keine Besuche zugeordnet'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Alle Besuche des Tages sind erledigt/)).toBeNull();
      expect(screen.queryByText('Heute ist nichts mehr offen')).toBeNull();
      expect(screen.getByRole('link', { name: 'Teambesprechung' })).toBeInTheDocument();
      expect(screen.queryByText(/^Erledigt heute/)).toBeNull();
    });

    it('sagt „nichts mehr offen" nur, wenn es Besuche gab', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'completed', documentation_status: 'final' }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(await screen.findByText('Heute ist nichts mehr offen')).toBeInTheDocument();
      // Der Titel sagt es schon; ein zweiter Satz darunter wiederholte ihn (UX-005h).
      expect(screen.queryByText('Alle Besuche des Tages sind erledigt.')).toBeNull();
    });

    it('navigiert nur noch zu Besuchen, die ausstehen (UEB-04)', async () => {
      fetchDayPlan.mockResolvedValue([
        // Besucht, die Doku ist noch Entwurf: offen, aber kein Weg mehr.
        tagesEintrag({ id: 't1', status: 'completed', documentation_status: 'draft' }),
        tagesEintrag({
          id: 't2',
          patient_id: 'p2',
          starts_at: `${HEUTE}T10:00:00.000Z`,
          ends_at: `${HEUTE}T10:45:00.000Z`,
          patient_given_name: 'Max',
          patient_family_name: 'Mustermann',
          visit_street: 'Beispielstrasse',
          visit_house_number: '12',
          visit_postal_code: '72070',
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      expect(await screen.findByRole('heading', { name: 'Offen heute (2)' })).toBeInTheDocument();
      // Der ganze Tag führt nur noch zum ausstehenden Besuch.
      expect(screen.getByRole('button', { name: /ganzer Tag \(1 Stopp\)/i })).toBeInTheDocument();
      // Und nur der ausstehende Besuch trägt „Navigation starten".
      expect(screen.getAllByRole('button', { name: 'Navigation starten' })).toHaveLength(1);
      expect(screen.getByText('Nächster Weg')).toBeInTheDocument();
    });

    it('gibt ohne ausstehenden Besuch nur der ersten Karte den Hauptknopf (UEB-04)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1', status: 'completed', documentation_status: 'draft' }),
        tagesEintrag({
          id: 't2',
          patient_id: 'p2',
          starts_at: `${HEUTE}T10:00:00.000Z`,
          ends_at: `${HEUTE}T10:45:00.000Z`,
          status: 'completed',
          documentation_status: 'none',
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const abschluesse = await screen.findAllByRole('link', { name: 'Behandlung abschließen' });
      expect(abschluesse).toHaveLength(2);
      expect(abschluesse.filter((link) => link.className.includes('bg-accent '))).toHaveLength(1);
      expect(abschluesse[0]!.className).toContain('bg-accent ');
      expect(screen.queryByRole('button', { name: 'Navigation starten' })).toBeNull();
      expect(screen.queryByRole('button', { name: /ganzer Tag/i })).toBeNull();
    });

    it('stellt Laden und Fehler des Teamplans in seinen Abschnitt, mit Erneut (UEB-05, ZST-18)', async () => {
      const user = userEvent.setup();
      fetchAppointments.mockRejectedValue(new Error('Serverfehler'));
      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);

      const teamplan = (
        await screen.findByRole('heading', { name: 'Tagesplan des Teams' })
      ).closest('section')!;
      const fehler = await within(teamplan).findByText(
        'Der Tagesplan des Teams konnte nicht geladen werden.',
      );
      expect(fehler.closest('[role="alert"]')).toHaveTextContent(
        'Bitte die Verbindung prüfen und erneut versuchen.',
      );
      // Ohne Daten keine leere, umrandete Liste.
      expect(within(teamplan).queryByRole('list')).toBeNull();

      fetchAppointments.mockResolvedValue(termine);
      await user.click(within(teamplan).getByRole('button', { name: 'Erneut versuchen' }));
      expect(await within(teamplan).findByText('Max Mustermann')).toBeInTheDocument();
    });

    it('nennt im Teamplan zuerst die Person, die Terminart einmal (UEB-06)', async () => {
      fetchAppointments.mockResolvedValue([
        ...termine,
        termin({
          id: 't9',
          appointment_type: 'practice',
          location_name: 'Hauptstandort',
          staff_given_name: 'Jannes',
          staff_family_name: 'Test',
          starts_at: `${HEUTE}T14:00:00.000Z`,
          ends_at: `${HEUTE}T14:45:00.000Z`,
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['office'])} />);

      const teamplan = (
        await screen.findByRole('heading', { name: 'Tagesplan des Teams' })
      ).closest('section')!;
      // Der Hausbesuch ist der Regelfall und trägt kein Wort (ANN-192).
      expect(await within(teamplan).findAllByText('Anna Beispiel')).not.toHaveLength(0);
      expect(within(teamplan).getByText('Jannes Test · Praxis Hauptstandort')).toBeInTheDocument();
      expect(within(teamplan).queryByText(/Hausbesuch/)).toBeNull();
      // Die Erklärung unter der Überschrift wiederholte sie (UX-005h).
      expect(
        within(teamplan).queryByText('Alle Termine und Fehlzeiten des Teams heute.'),
      ).toBeNull();
      expect(within(teamplan).getByRole('link', { name: /Zum Kalender/ })).toBeInTheDocument();
    });

    it('sagt einer Patientin, wozu der Zugang dient, und fuehrt zum Konto (UEB-08)', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['patient'], 'Max Mustermann')} />);

      await screen.findByRole('heading', { name: 'Ihr Zugang' });
      expect(screen.getByText(/verwalten Sie derzeit Ihr Konto/)).toBeInTheDocument();
      expect(screen.queryByText(/Patientenportal/)).toBeNull();
      expect(screen.getByRole('link', { name: 'Mein Konto' })).toHaveAttribute(
        'href',
        '/mein-konto',
      );
      // Beim „Sie" ohne Vornamen.
      expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Max');
    });

    it('zeigt an jedem Aufklapper der Übersicht ein Aufklappzeichen (UEB-03, UIK-07)', async () => {
      fetchDayPlan.mockResolvedValue([
        ...tagesplan,
        tagesEintrag({
          id: 't4',
          patient_id: 'p4',
          starts_at: `${HEUTE}T14:00:00.000Z`,
          ends_at: `${HEUTE}T14:45:00.000Z`,
        }),
        tagesEintrag({
          id: 't5',
          patient_id: 'p5',
          starts_at: `${HEUTE}T15:00:00.000Z`,
          ends_at: `${HEUTE}T15:45:00.000Z`,
        }),
      ]);
      const { container } = renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      await screen.findByText(/^Weitere offene heute/);
      await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });

      const koepfe = [...container.querySelectorAll('summary')];
      // Weitere offene, Tagesroute, Erledigt, Teamplan, Organisatorisches.
      expect(koepfe).toHaveLength(5);
      for (const kopf of koepfe) {
        expect(kopf.querySelector('[data-aufklappzeichen]')).not.toBeNull();
        expect(kopf).toHaveClass('min-h-11');
      }
      // Beide Aufklapp-Überschriften im Label-Stil wie ein Abschnitt (UEB-17).
      for (const name of ['Tagesplan des Teams', 'Organisatorisches und Kommunikation']) {
        expect(screen.getByRole('heading', { name })).toHaveClass('tracking-label', 'uppercase');
      }
    });

    it('erklaert die Uebergabe an Google Maps direkt unter dem ersten Weg (UEB-11)', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);
      const karte = (await screen.findByText('Testweg 7')).closest('address')!;

      const hinweis = screen.getByText(/öffnet Google Maps im Fahrradmodus/);
      expect(hinweis).toHaveTextContent(
        '„Navigation starten“ öffnet Google Maps im Fahrradmodus. Übergeben wird nur das Ziel – die Kartenposition oder, wo keine vorliegt, die Anschrift ohne Namen –, erst beim Tippen.',
      );
      expect(hinweis).toHaveClass('text-sm');
      // Direkt hinter der Karte, vor allem Weiteren.
      expect(
        karte.compareDocumentPosition(hinweis) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        hinweis.compareDocumentPosition(screen.getByText(/^Erledigt heute/)) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('fuehrt ueber den Namen in „Danach" in die Akte, wie auf der Karte (UEB-13)', async () => {
      fetchDayPlan.mockResolvedValue([
        tagesEintrag({ id: 't1' }),
        tagesEintrag({
          id: 't2',
          patient_id: 'p2',
          starts_at: `${HEUTE}T10:00:00.000Z`,
          ends_at: `${HEUTE}T10:45:00.000Z`,
          patient_given_name: 'Max',
          patient_family_name: 'Mustermann',
        }),
      ]);
      renderMitVorschau(<MyDayPage user={testUser(['therapist'])} />);

      const danach = (await screen.findByRole('heading', { name: 'Danach' })).parentElement!;
      expect(within(danach).getByRole('link', { name: 'Max Mustermann' })).toHaveAttribute(
        'href',
        `/patienten/p2?zurueck=${encodeURIComponent('/')}`,
      );
    });

    it('gibt den Karten der Vorschau Textlinks mit Tippziel und richtigen Zielen (UEB-18)', async () => {
      renderMitVorschau(<MyDayPage user={testUser(['team_lead'])} />);
      await screen.findByRole('heading', { name: 'Organisatorisches und Kommunikation' });

      const panne = screen.getByRole('link', { name: 'Panne melden' });
      expect(panne).toHaveClass('text-accent', 'min-h-11');
      expect(panne.className).not.toContain('text-danger');
      for (const name of ['Zur Radflotte', 'Zum Urlaub', 'Zur Kommunikation']) {
        expect(screen.getByRole('link', { name })).toHaveClass('min-h-11');
      }
      // Erstattungen haben einen eigenen Weg - bisher führte alles zum Urlaub.
      for (const link of screen.getAllByRole('link', { name: /Erstattungen$/ })) {
        expect(link).toHaveAttribute('href', '/betrieb/erstattungen');
      }
      // Mehrzahl richtig gebildet (UEB-11, WRT-19).
      expect(screen.queryByText(/Vorgange/)).toBeNull();
      expect(screen.getByText(/^\d+ Vorg(ang|änge)$/)).toBeInTheDocument();
      expect(screen.queryByText(/^\d+ offene?$/)).toBeNull();
    });
  });
});
