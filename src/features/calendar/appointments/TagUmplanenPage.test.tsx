import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STAND_VERALTET } from '@/components/ui/abfrageTexte';
import type * as AppointmentsApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { leseRueckweg } from '@/lib/rueckweg';
import type * as StaffApi from '@/features/workforce/staff/api';
import type * as Tagesplan from '@/features/calendar/day-plan/api';
import type * as RouterModul from 'react-router-dom';

// Tag umplanen (ANN-574): nur bestätigte Termine, alle vorgewählt und abwählbar, Grund Pflicht, genau
// die Auswahl abgesagt, danach je Person ein Anruf; die Anrufliste liegt im Tab. Den Schreibpfad prüft
// `supabase/tests/appointment-states.test.ts`.

const ANNA = '55555555-5555-4555-8555-000000000002';
const DATUM = '2027-05-12';

function eintrag(teil: Partial<Tagesplan.DayPlanEntry>): Tagesplan.DayPlanEntry {
  return {
    id: 'termin-1',
    patient_id: 'p1',
    staff_member_id: ANNA,
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: `${DATUM}T07:00:00.000Z`,
    ends_at: `${DATUM}T08:00:00.000Z`,
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: 'Altstrasse',
    visit_house_number: '1',
    visit_postal_code: '72070',
    visit_city: 'Tuebingen',
    patient_phone: null,
    patient_phone_mobile: '0170 1234567',
    home_visit_access_note: null,
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: 'Europe/Berlin',
    ...teil,
  };
}

const fetchDayPlan = vi.fn();
const cancelStaffDay = vi.fn();
const fetchAssignableTherapists = vi.fn();
vi.mock('@/features/calendar/day-plan/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Tagesplan>()),
  fetchDayPlan: (datum: string, person: string) =>
    fetchDayPlan(datum, person) as Promise<Tagesplan.DayPlanEntry[]>,
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    cancelStaffDay: (
      person: string,
      datum: string,
      grund: AppointmentsApi.CancellationReason,
      auswahl?: readonly string[],
    ) => cancelStaffDay(person, datum, grund, auswahl) as Promise<number>,
  };
});

vi.mock('@/features/workforce/staff/api', async (importOriginal) => ({
  ...(await importOriginal<typeof StaffApi>()),
  fetchAssignableTherapists: () =>
    fetchAssignableTherapists() as Promise<StaffApi.AssignableTherapist[]>,
}));

/** Hält das Schreiben der Adresse zurück wie ein Übergang des Routers, der noch aussteht. */
const adresse = { zurueckhalten: false };
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModul>();
  return {
    ...actual,
    useSearchParams: (...args: Parameters<typeof actual.useSearchParams>) => {
      const [suche, setSuche] = actual.useSearchParams(...args);
      const halten: typeof setSuche = (...neu) => {
        if (!adresse.zurueckhalten) setSuche(...neu);
      };
      return [suche, halten];
    },
  };
});

const { TagUmplanenPage } = await import('./TagUmplanenPage');
const { merkeAnrufliste } = await import('./tagumplanen');

/** Eine Anrufliste, wie sie ein früherer Besuch dieses Tabs hinterlassen hat. */
function anruflisteImTab(liste: Parameters<typeof merkeAnrufliste>[4], kennung = 'v1') {
  merkeAnrufliste(testUser(['office']).profile.id, kennung, ANNA, DATUM, liste);
  return `/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}&anrufliste=${kennung}`;
}

function rendern(
  pfad = `/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}`,
  rollen: Parameters<typeof testUser>[0] = ['office'],
) {
  return renderWithProviders(<TagUmplanenPage user={testUser(rollen)} />, pfad);
}

describe('TagUmplanenPage', () => {
  beforeEach(() => {
    adresse.zurueckhalten = false;
    fetchDayPlan.mockReset();
    cancelStaffDay.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchDayPlan.mockResolvedValue([
      eintrag({}),
      eintrag({
        id: 'termin-2',
        starts_at: `${DATUM}T09:00:00.000Z`,
        ends_at: `${DATUM}T10:00:00.000Z`,
        patient_given_name: 'Max',
        patient_family_name: 'Mustermann',
      }),
    ]);
    cancelStaffDay.mockResolvedValue(2);
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: ANNA, display_name: 'Anna Beispiel' },
    ]);
  });

  /** Das Fenster des Ablaufs; sein Name ist die Frage der Seite. */
  function fenster(name: string | RegExp) {
    return screen.findByRole('dialog', { name });
  }

  /** Der Rückweg des Links „Akte“ in einem Fenster, so wie die Akte ihn liest. */
  function rueckwegDerAkte(element: HTMLElement): string {
    const akte = within(element).getByRole('link', { name: 'Akte' });
    return leseRueckweg(new URL(akte.getAttribute('href')!, 'http://test').searchParams, '');
  }

  /** Grund wählen und zur Auswahl der Termine. */
  async function bisZurAuswahl(user: ReturnType<typeof userEvent.setup>) {
    const grund = await fenster('Warum fällt der Tag aus?');
    await user.click(within(grund).getByRole('button', { name: 'Praxis hat abgesagt' }));
    return fenster('Welche Termine absagen?');
  }

  it('nennt Person und Tag und fragt zuerst nach dem Grund - keiner vorgewählt', async () => {
    rendern();
    const grund = await fenster('Warum fällt der Tag aus?');
    // Im Kopf des Fensters das kurze Datum vorn (Design-Review Überholung 9, Runde 2).
    expect(within(grund).getByText('Mi., 12. Mai · Anna Beispiel')).toBeInTheDocument();
    expect(within(grund).getByText('Schritt 1 von 3')).toBeInTheDocument();
    // Der Ausfall einer behandelnden Person ist praxisbedingt (CAL-016, ADR-018
    // Fassung 2 Punkt 8.4): „Patient:in hat abgesagt" steht nicht zur Wahl.
    expect(within(grund).queryByRole('button', { name: 'Patient:in hat abgesagt' })).toBeNull();
    for (const name of ['Praxis hat abgesagt', 'Praxis hat verlegt', 'Sonstiger Grund']) {
      expect(within(grund).getByRole('button', { name })).not.toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
  });

  it('wählt alle bestätigten Termine vor - abgeschlossene und abgesagte bleiben außen vor', async () => {
    const user = userEvent.setup();
    fetchDayPlan.mockResolvedValue([
      eintrag({}),
      eintrag({ id: 'termin-2', status: 'completed' }),
      eintrag({ id: 'termin-3', status: 'cancelled' }),
      eintrag({ id: 'termin-4', status: 'documented' }),
    ]);
    rendern();
    const auswahl = await bisZurAuswahl(user);
    const kaesten = within(auswahl).getAllByRole('checkbox');
    expect(kaesten).toHaveLength(1);
    expect(kaesten[0]).toBeChecked();
    expect(within(auswahl).getByRole('button', { name: 'Weiter mit 1 Termin' })).toBeEnabled();
  });

  it('wählt nach einer Teiländerung nur die Termine außerhalb der Arbeitszeit vor (Praxis-Review Überholung 9)', async () => {
    const user = userEvent.setup();
    // Ortszeit im Mai: termin-1 09:00–10:00, termin-2 11:00–12:00; nach der
    // Änderung arbeitet Anna 11:00–13:00 - nur termin-1 fällt heraus.
    rendern(`/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}&zeiten=11:00-13:00`);
    const grund = await fenster('Warum fallen die Termine aus?');
    await user.click(within(grund).getByRole('button', { name: 'Praxis hat abgesagt' }));
    const auswahl = await fenster('Welche Termine absagen?');
    const [erster, zweiter] = within(auswahl).getAllByRole('checkbox');
    expect(erster).toBeChecked();
    expect(zweiter).not.toBeChecked();
    await user.click(within(auswahl).getByRole('button', { name: 'Weiter mit 1 Termin' }));
    const rueckfrage = await fenster('1 Termin absagen?');
    await user.click(within(rueckfrage).getByRole('button', { name: 'Ja, 1 Termin absagen' }));
    await waitFor(() =>
      expect(cancelStaffDay).toHaveBeenCalledWith(ANNA, DATUM, 'practice_request', ['termin-1']),
    );
  });

  it('wählt bei einer ungültigen Angabe der Zeiten den ganzen Tag vor', async () => {
    const user = userEvent.setup();
    rendern(`/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}&zeiten=11-13`);
    const auswahl = await bisZurAuswahl(user);
    for (const kasten of within(auswahl).getAllByRole('checkbox')) expect(kasten).toBeChecked();
  });

  /**
   * „Tag umplanen" sagt Behandlungstermine ab; ein Ereignis des Praxisbetriebs
   * lässt `cancel_staff_day` ausdrücklich stehen (CAL-015b). Stünde es hier in
   * der Auswahl, verspräche sie eine Absage, die nicht käme.
   */
  it('laesst ein Ereignis des Praxisbetriebs aussen vor', async () => {
    const user = userEvent.setup();
    fetchDayPlan.mockResolvedValue([
      eintrag({}),
      eintrag({
        id: 'ereignis-1',
        kind: 'internal',
        title: 'Teambesprechung',
        patient_id: null,
        patient_given_name: null,
        patient_family_name: null,
      }),
    ]);
    rendern();
    const auswahl = await bisZurAuswahl(user);
    expect(within(auswahl).getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByText(/Teambesprechung/)).not.toBeInTheDocument();
  });

  it('sagt nach der Rückfrage genau die Auswahl ab - abgewählte Termine bleiben', async () => {
    const user = userEvent.setup();
    cancelStaffDay.mockResolvedValue(1);
    rendern();
    const auswahl = await bisZurAuswahl(user);
    await user.click(within(auswahl).getByRole('checkbox', { name: /Max Mustermann/ }));
    await user.click(within(auswahl).getByRole('button', { name: 'Weiter mit 1 Termin' }));

    const rueckfrage = await fenster('1 Termin absagen?');
    expect(within(rueckfrage).getByText('1 von 2 Terminen')).toBeInTheDocument();
    expect(within(rueckfrage).getByText('Praxis hat abgesagt')).toBeInTheDocument();
    // Die Folge steht vor dem Knopf, nicht dahinter.
    expect(within(rueckfrage).getByText(/lässt sich nicht zurücknehmen/)).toBeInTheDocument();
    await user.click(within(rueckfrage).getByRole('button', { name: 'Ja, 1 Termin absagen' }));

    await waitFor(() =>
      expect(cancelStaffDay).toHaveBeenCalledWith(ANNA, DATUM, 'practice_request', ['termin-1']),
    );
  });

  it('schickt die Auswahl auch mit, wenn alle gewählt sind (Zweitreview Überholung 6)', async () => {
    const user = userEvent.setup();
    rendern();
    const auswahl = await bisZurAuswahl(user);
    await user.click(within(auswahl).getByRole('button', { name: 'Weiter mit 2 Terminen' }));
    await user.click(
      within(await fenster('2 Termine absagen?')).getByRole('button', {
        name: 'Ja, 2 Termine absagen',
      }),
    );
    await waitFor(() =>
      expect(cancelStaffDay).toHaveBeenCalledWith(ANNA, DATUM, 'practice_request', [
        'termin-1',
        'termin-2',
      ]),
    );
  });

  it('lässt ohne gewählten Termin nicht weiter und kehrt aus „Ändern“ zur Rückfrage zurück', async () => {
    const user = userEvent.setup();
    rendern();
    let auswahl = await bisZurAuswahl(user);
    for (const kasten of within(auswahl).getAllByRole('checkbox')) await user.click(kasten);
    expect(within(auswahl).getByRole('button', { name: 'Weiter mit 0 Terminen' })).toBeDisabled();
    for (const kasten of within(auswahl).getAllByRole('checkbox')) await user.click(kasten);
    await user.click(within(auswahl).getByRole('button', { name: 'Weiter mit 2 Terminen' }));

    const rueckfrage = await fenster('2 Termine absagen?');
    await user.click(within(rueckfrage).getByRole('button', { name: 'Grund ändern' }));
    await user.click(
      within(await fenster('Warum fällt der Tag aus?')).getByRole('button', {
        name: 'Praxis hat verlegt',
      }),
    );
    // Zurück zur Rückfrage, nicht noch einmal durch die Auswahl.
    expect(
      within(await fenster('2 Termine absagen?')).getByText('Praxis hat verlegt'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Termine ändern' }));
    auswahl = await fenster('Welche Termine absagen?');
    await user.click(within(auswahl).getByRole('button', { name: 'Weiter mit 2 Terminen' }));
    expect(await fenster('2 Termine absagen?')).toBeInTheDocument();
    expect(cancelStaffDay).not.toHaveBeenCalled();
  });

  it('führt danach je Person durch die Anrufe und nennt am Ende, wer fehlt', async () => {
    const user = userEvent.setup();
    fetchDayPlan
      .mockResolvedValueOnce([eintrag({}), eintrag({ id: 'termin-2', patient_given_name: 'Max' })])
      .mockResolvedValue([
        eintrag({ status: 'cancelled' }),
        eintrag({ id: 'termin-2', status: 'cancelled', patient_given_name: 'Max' }),
      ]);
    rendern();
    const auswahl = await bisZurAuswahl(user);
    await user.click(within(auswahl).getByRole('button', { name: 'Weiter mit 2 Terminen' }));
    await user.click(
      within(await fenster('2 Termine absagen?')).getByRole('button', {
        name: 'Ja, 2 Termine absagen',
      }),
    );

    const erste = await fenster('Erika Beispiel erreicht?');
    // Eine Erfolgsmeldung mit Zeichen (UIK-21), dann der Anruf als Knopf.
    expect(within(erste).getByText(/2 Termine sind abgesagt\. Jetzt anrufen\./)).toHaveTextContent(
      '✓',
    );
    expect(within(erste).getByText('Anruf 1 von 2')).toBeInTheDocument();
    // Der Anruf ist der Hauptknopf, die Antwort danach sekundär (BEF-192).
    const waehlen = within(erste).getByRole('link', { name: /Mobil anrufen/ });
    expect(waehlen).toHaveAttribute('href', 'tel:01701234567');
    expect(waehlen).toHaveClass('bg-accent');
    expect(within(erste).getByRole('button', { name: 'Erreicht' })).not.toHaveClass('bg-accent');
    // Der Weg in die Akte nimmt als Rückweg nur die Kennung der Anrufliste mit (ADR-011).
    const zurueck = rueckwegDerAkte(erste);
    expect(zurueck).toMatch(/anrufliste=[\w-]+/);
    expect(zurueck).not.toMatch(/termin-1|termin-2|Erika|Beispiel/);
    await user.click(within(erste).getByRole('button', { name: 'Nicht erreicht' }));

    const zweite = await fenster('Max Beispiel erreicht?');
    await user.click(within(zweite).getByRole('button', { name: 'Erreicht' }));

    const ende = await fenster('1 noch nicht erreicht');
    expect(within(ende).getByText('Erika Beispiel')).toBeInTheDocument();
    expect(within(ende).getByText('1 Person erreicht von 2.')).toBeInTheDocument();
    expect(within(ende).getByText(/nur in diesem Tab/)).toBeInTheDocument();
    // Nach dem letzten Anruf der Weg zum Kalender (KAL-19).
    expect(within(ende).getByRole('link', { name: 'Zum Kalender' })).toHaveAttribute(
      'href',
      '/kalender',
    );
    // Noch einmal anrufen wählt gleich, führt zur Person und danach zurück
    // zum Abschluss (BEF-192).
    const nochmal = within(ende).getByRole('link', { name: 'Erika Beispiel noch einmal anrufen' });
    expect(nochmal).toHaveAttribute('href', 'tel:01701234567');
    // jsdom kennt kein `tel:`; das Wählen selbst übernimmt das Telefon.
    nochmal.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await user.click(nochmal);
    await user.click(
      within(await fenster('Erika Beispiel erreicht?')).getByRole('button', { name: 'Erreicht' }),
    );
    expect(await fenster('Alle angerufen')).toBeInTheDocument();
  });

  // Unter Last folgt die Adresse spät; hier folgt sie gar nicht. Rückweg und Anrufstand kommen
  // trotzdem vollständig aus dem Zustand.
  it('baut Rückweg und Anrufstand aus dem Zustand, auch bevor die Adresse folgt', async () => {
    const user = userEvent.setup();
    fetchDayPlan
      .mockResolvedValueOnce([eintrag({}), eintrag({ id: 'termin-2', patient_given_name: 'Max' })])
      .mockResolvedValue([
        eintrag({ status: 'cancelled' }),
        eintrag({ id: 'termin-2', status: 'cancelled', patient_given_name: 'Max' }),
      ]);
    rendern();
    const auswahl = await bisZurAuswahl(user);
    await user.click(within(auswahl).getByRole('button', { name: 'Weiter mit 2 Terminen' }));
    adresse.zurueckhalten = true;
    await user.click(
      within(await fenster('2 Termine absagen?')).getByRole('button', {
        name: 'Ja, 2 Termine absagen',
      }),
    );

    const erste = await fenster('Erika Beispiel erreicht?');
    const rueckweg = rueckwegDerAkte(erste);
    expect(rueckweg).toMatch(/anrufliste=[\w-]+/);
    await user.click(within(erste).getByRole('button', { name: 'Nicht erreicht' }));

    const zweite = await fenster('Max Beispiel erreicht?');
    expect(rueckwegDerAkte(zweite)).toBe(rueckweg);
    await user.click(within(zweite).getByRole('button', { name: 'Erreicht' }));

    // Die erste Antwort geht nicht verloren, obwohl die Adresse sie nie trug.
    const ende = await fenster('1 noch nicht erreicht');
    expect(within(ende).getByText('1 Person erreicht von 2.')).toBeInTheDocument();
  });

  it('bietet einem Zugang ohne Terminrecht keine Absage an', async () => {
    rendern(`/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}`, ['patient']);
    expect(await screen.findByText(/fehlt Ihrem Zugang die Berechtigung/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sagt bei fehlender Person nichts ab, sondern verweist auf den Kalender', async () => {
    rendern('/kalender/tag-umplanen?zurueck=%2Fkalender%3Fansicht%3Dwoche');

    expect(await screen.findByText('Person und Tag fehlen')).toBeInTheDocument();
    expect(fetchDayPlan).not.toHaveBeenCalled();
    // Der Weg dorthin nimmt den mitgereisten Rückweg (NAV-02).
    expect(screen.getByRole('link', { name: 'Zum Kalender' })).toHaveAttribute(
      'href',
      '/kalender?ansicht=woche',
    );
  });

  it('weist ein unplausibles Datum ab, statt still auf heute zu fallen', async () => {
    rendern(`/kalender/tag-umplanen?person=${ANNA}&datum=2027-02-31`);

    expect(await screen.findByText('Person und Tag fehlen')).toBeInTheDocument();
    expect(fetchDayPlan).not.toHaveBeenCalled();
  });

  // Die Seite steht nicht in src/barrierefreiheit.test.tsx: sie braucht zwei
  // gemockte Lesepfade und gehoert deshalb hierher, wo die Mocks schon stehen.
  it('haelt Grund, Auswahl, Rückfrage und Anruf barrierefrei', async () => {
    const user = userEvent.setup();
    fetchDayPlan
      .mockResolvedValueOnce([eintrag({})])
      .mockResolvedValue([eintrag({ status: 'cancelled' })]);
    cancelStaffDay.mockResolvedValue(1);
    rendern();
    await fenster('Warum fällt der Tag aus?');
    await pruefeBarrierefreiheit(document.body);
    const auswahl = await bisZurAuswahl(user);
    await pruefeBarrierefreiheit(document.body);
    await user.click(within(auswahl).getByRole('button', { name: 'Weiter mit 1 Termin' }));
    const rueckfrage = await fenster('1 Termin absagen?');
    await pruefeBarrierefreiheit(document.body);
    await user.click(within(rueckfrage).getByRole('button', { name: 'Ja, 1 Termin absagen' }));
    await fenster('Erika Beispiel erreicht?');
    await pruefeBarrierefreiheit(document.body);
  });

  it('führt die Anrufliste nur aus den eben abgesagten Kennungen des Tabs', async () => {
    // termin-1 hatte die Patient:in schon vorher abgesagt - er gehört nicht auf
    // die Liste. termin-2 ist in diesem Vorgang abgesagt worden.
    fetchDayPlan.mockResolvedValue([
      eintrag({
        status: 'cancelled',
        patient_given_name: 'Frueher',
        patient_family_name: 'Abgesagt',
      }),
      eintrag({ id: 'termin-2', status: 'cancelled' }),
    ]);
    rendern(anruflisteImTab({ abgesagt: ['termin-2'], stand: {} }));

    const anruf = await fenster('Erika Beispiel erreicht?');
    expect(within(anruf).getByText('Anruf 1 von 1')).toBeInTheDocument();
    expect(screen.queryByText(/Frueher Abgesagt/)).toBeNull();
    // Keine zweite Absage: Die Seite steht nach dem Neuladen wieder bei der Anrufliste.
    expect(screen.queryByRole('button', { name: /absagen/ })).toBeNull();
  });

  it('beginnt nach dem Neuladen bei der ersten Person ohne Ergebnis (ANN-574)', async () => {
    fetchDayPlan.mockResolvedValue([
      eintrag({ status: 'cancelled' }),
      eintrag({ id: 'termin-2', status: 'cancelled', patient_given_name: 'Max' }),
    ]);
    rendern(
      anruflisteImTab({ abgesagt: ['termin-1', 'termin-2'], stand: { 'termin-1': 'nicht' } }),
    );
    expect(await fenster('Max Beispiel erreicht?')).toBeInTheDocument();
  });

  it('nimmt keine Anrufliste eines anderen Tages und beginnt dann mit der Absage', async () => {
    merkeAnrufliste(testUser(['office']).profile.id, 'v1', ANNA, '2027-05-13', {
      abgesagt: ['termin-1'],
      stand: {},
    });
    rendern(`/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}&anrufliste=v1`);
    expect(await fenster('Warum fällt der Tag aus?')).toBeInTheDocument();
  });

  it('hält den Rückweg aus der Akte kurz, auch bei 15 Terminen mit echten Kennungen', async () => {
    const user = userEvent.setup();
    const kennungen = Array.from(
      { length: 15 },
      (_, i) => `77777777-7777-4777-8777-${String(i + 1).padStart(12, '0')}`,
    );
    const tag = (status: 'confirmed' | 'cancelled') =>
      kennungen.map((id, i) =>
        eintrag({
          id,
          status,
          patient_id: `66666666-6666-4666-8666-${String(i + 1).padStart(12, '0')}`,
          patient_given_name: `Person${i + 1}`,
          starts_at: `${DATUM}T${String(6 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00.000Z`,
          ends_at: `${DATUM}T${String(6 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '55' : '25'}:00.000Z`,
        }),
      );
    fetchDayPlan.mockResolvedValueOnce(tag('confirmed')).mockResolvedValue(tag('cancelled'));
    cancelStaffDay.mockResolvedValue(15);
    const kalender = `/kalender?ansicht=tag&datum=${DATUM}&person=${ANNA}&status=all`;
    const { unmount } = rendern(
      `/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}&zurueck=${encodeURIComponent(kalender)}`,
    );
    const auswahl = await bisZurAuswahl(user);
    await user.click(within(auswahl).getByRole('button', { name: 'Weiter mit 15 Terminen' }));
    await user.click(
      within(await fenster('15 Termine absagen?')).getByRole('button', {
        name: 'Ja, 15 Termine absagen',
      }),
    );

    let rueckweg = '';
    for (let i = 1; i <= 15; i += 1) {
      const seite = await fenster(`Person${i} Beispiel erreicht?`);
      const jetzt = rueckwegDerAkte(seite);
      // Die Akte nimmt ihn an, und er wächst nicht mit den Antworten.
      expect(jetzt).toMatch(/^\/kalender\/tag-umplanen\?/);
      if (rueckweg) expect(jetzt).toBe(rueckweg);
      rueckweg = jetzt;
      await user.click(within(seite).getByRole('button', { name: 'Nicht erreicht' }));
    }
    expect(await fenster('15 noch nicht erreicht')).toBeInTheDocument();
    expect(rueckweg.length).toBeLessThan(300);
    expect(new URLSearchParams(rueckweg.split('?')[1]).get('zurueck')).toBe(kalender);

    // Zurück aus der Akte: Die Liste steht wieder, mit allen Antworten.
    unmount();
    rendern(rueckweg);
    expect(await fenster('15 noch nicht erreicht')).toBeInTheDocument();
  });

  it('nennt den Tag in der Zeitzone der Praxis, auch ohne Termine (KAL-10)', async () => {
    fetchDayPlan.mockResolvedValue([]);
    rendern();

    expect(await screen.findByText('Anna Beispiel · Mittwoch, 12. Mai 2027')).toBeInTheDocument();
    expect(screen.queryByText(/2027-05-12/)).toBeNull();
  });

  it('hat einen Rueckweg, der den mitgereisten Kalenderstand nimmt (KAL-19)', async () => {
    rendern(
      `/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}&zurueck=%2Fkalender%3Fansicht%3Dtag%26datum%3D${DATUM}`,
    );

    expect(await screen.findByRole('link', { name: '← Zurück zum Kalender' })).toHaveAttribute(
      'href',
      `/kalender?ansicht=tag&datum=${DATUM}`,
    );
  });

  it('bietet beim Ladefehler einen Weg heraus (WRT-01)', async () => {
    fetchDayPlan.mockRejectedValueOnce(new Error('Netz'));
    rendern();

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveTextContent('Der Tag konnte nicht geladen werden.');
    expect(kasten).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');

    await userEvent.click(within(kasten).getByRole('button', { name: 'Erneut versuchen' }));
    expect(await fenster('Warum fällt der Tag aus?')).toBeInTheDocument();
  });

  it('laesst die Anrufliste stehen, wenn nur das Nachladen scheitert (ZST-03)', async () => {
    fetchDayPlan.mockResolvedValue([eintrag({ status: 'cancelled' })]);
    rendern(anruflisteImTab({ abgesagt: ['termin-1'], stand: {} }));
    expect(await fenster('Erika Beispiel erreicht?')).toBeInTheDocument();

    // Das Gerät kommt zurück, das Nachladen scheitert - der Stand bleibt.
    fetchDayPlan.mockRejectedValue(new Error('Netz'));
    window.dispatchEvent(new Event('visibilitychange'));

    // Der Satz des Bausteins für einen veralteten Stand (Abfragezustand).
    expect(await screen.findByText(STAND_VERALTET)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Erika Beispiel erreicht?' })).toBeInTheDocument();
  });

  it('sagt an einem Tag ohne bestaetigte Termine nichts an', async () => {
    fetchDayPlan.mockResolvedValue([]);
    rendern();

    expect(await screen.findByText('Hier ist nichts umzuplanen.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /absagen/ })).not.toBeInTheDocument();
  });
});
