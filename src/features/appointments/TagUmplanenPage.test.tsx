import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STAND_VERALTET } from '@/components/ui/abfrageTexte';
import type * as AppointmentsApi from './api';
import type * as TodayApi from '@/features/today/api';
import { renderWithProviders, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * Tag umplanen mit Anrufliste (CAL-009), geführt seit Überholung 6 (G2,
 * ANN-574).
 *
 * Geprüft wird, was der Ablauf verspricht und was er bewusst nicht tut: nur
 * bestätigte Termine gehen in die Absage, alle vorgewählt und abwählbar, der
 * Grund ist Pflicht und nicht vorgewählt, abgesagt wird genau die Auswahl,
 * und danach führt er je Person durch die Anrufe. Der Schreibpfad selbst hat
 * seine Prüfungen in `supabase/tests/appointment-states.test.ts`.
 */

const ANNA = '55555555-5555-4555-8555-000000000002';
const DATUM = '2027-05-12';

function eintrag(teil: Partial<TodayApi.DayPlanEntry>): TodayApi.DayPlanEntry {
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

vi.mock('@/features/today/api', async (importOriginal) => {
  const actual = await importOriginal<typeof TodayApi>();
  return {
    ...actual,
    fetchDayPlan: (datum: string, person: string) =>
      fetchDayPlan(datum, person) as Promise<TodayApi.DayPlanEntry[]>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
    cancelStaffDay: (
      person: string,
      datum: string,
      grund: AppointmentsApi.CancellationReason,
      auswahl?: readonly string[],
    ) => cancelStaffDay(person, datum, grund, auswahl) as Promise<number>,
  };
});

const { TagUmplanenPage } = await import('./TagUmplanenPage');

function rendern(
  pfad = `/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}`,
  rollen: Parameters<typeof testUser>[0] = ['office'],
) {
  return renderWithProviders(<TagUmplanenPage user={testUser(rollen)} />, pfad);
}

describe('TagUmplanenPage', () => {
  beforeEach(() => {
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

  /** Grund wählen und zur Auswahl der Termine. */
  async function bisZurAuswahl(user: ReturnType<typeof userEvent.setup>) {
    const grund = await fenster('Warum fällt der Tag aus?');
    await user.click(within(grund).getByRole('button', { name: 'Praxis hat abgesagt' }));
    return fenster('Welche Termine absagen?');
  }

  it('nennt Person und Tag und fragt zuerst nach dem Grund - keiner vorgewählt', async () => {
    rendern();
    const grund = await fenster('Warum fällt der Tag aus?');
    expect(within(grund).getByText('Anna Beispiel · Mittwoch, 12. Mai 2027')).toBeInTheDocument();
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
    expect(within(erste).getByRole('link', { name: /Mobil anrufen/ })).toHaveAttribute(
      'href',
      'tel:01701234567',
    );
    // Der Weg in die Akte nimmt die Anrufliste als Rückweg mit - nur Kennungen,
    // keine Namen (KAL-06, ADR-011).
    const akte = within(erste).getByRole('link', { name: 'Akte' });
    const zurueck = new URL(akte.getAttribute('href')!, 'http://test').searchParams.get('zurueck');
    expect(zurueck).toContain('abgesagt=termin-1%2Ctermin-2');
    expect(zurueck).not.toMatch(/Erika|Beispiel/);
    await user.click(within(erste).getByRole('button', { name: 'Nicht erreicht' }));

    const zweite = await fenster('Max Beispiel erreicht?');
    await user.click(within(zweite).getByRole('button', { name: 'Erreicht' }));

    const ende = await fenster('1 noch nicht erreicht');
    expect(within(ende).getByText('Erika Beispiel')).toBeInTheDocument();
    expect(within(ende).getByText('1 Person erreicht von 2.')).toBeInTheDocument();
    expect(within(ende).getByText(/nicht gespeichert/)).toBeInTheDocument();
    // Nach dem letzten Anruf der Weg zum Kalender (KAL-19).
    expect(within(ende).getByRole('link', { name: 'Zum Kalender' })).toHaveAttribute(
      'href',
      '/kalender',
    );
    // Noch einmal anrufen führt zur Person und danach zurück zum Abschluss.
    await user.click(
      within(ende).getByRole('button', { name: 'Erika Beispiel noch einmal anrufen' }),
    );
    await user.click(
      within(await fenster('Erika Beispiel erreicht?')).getByRole('button', { name: 'Erreicht' }),
    );
    expect(await fenster('Alle angerufen')).toBeInTheDocument();
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

  it('führt die Anrufliste nur aus den eben abgesagten Kennungen der Adresse (KAL-06)', async () => {
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
    rendern(`/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}&abgesagt=termin-2`);

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
      `/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}&abgesagt=termin-1,termin-2&nicht=termin-1`,
    );
    expect(await fenster('Max Beispiel erreicht?')).toBeInTheDocument();
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
    rendern(`/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}&abgesagt=termin-1`);
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
