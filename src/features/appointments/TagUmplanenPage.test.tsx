import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as TodayApi from '@/features/today/api';
import { renderWithProviders, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * Tag umplanen mit Anrufliste (CAL-009).
 *
 * Geprüft wird, was die Seite verspricht und was sie bewusst nicht tut: nur
 * bestätigte Termine gehen in die Absage, der Grund ist Pflicht, und aus der
 * Absage wird unmittelbar die Anrufliste mit Wählzielen. Der Schreibpfad
 * selbst hat seine Prüfungen in `supabase/tests/appointment-states.test.ts`.
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
    cancelStaffDay: (person: string, datum: string, grund: AppointmentsApi.CancellationReason) =>
      cancelStaffDay(person, datum, grund) as Promise<number>,
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
      }),
    ]);
    cancelStaffDay.mockResolvedValue(2);
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: ANNA, display_name: 'Anna Beispiel' },
    ]);
  });

  it('nennt Person und Tag und zaehlt die betroffenen Termine', async () => {
    rendern();
    expect(await screen.findByText(/Anna Beispiel/)).toBeInTheDocument();
    expect(screen.getByText(/Diese Termine werden abgesagt \(2\)/)).toBeInTheDocument();
  });

  it('zaehlt nur bestaetigte Termine - abgeschlossene und abgesagte bleiben aussen vor', async () => {
    fetchDayPlan.mockResolvedValue([
      eintrag({}),
      eintrag({ id: 'termin-2', status: 'completed' }),
      eintrag({ id: 'termin-3', status: 'cancelled' }),
      eintrag({ id: 'termin-4', status: 'documented' }),
    ]);
    rendern();

    expect(await screen.findByText(/Diese Termine werden abgesagt \(1\)/)).toBeInTheDocument();
  });

  /**
   * „Tag umplanen" sagt Behandlungstermine ab; ein Ereignis des Praxisbetriebs
   * lässt `cancel_staff_day` ausdrücklich stehen (CAL-015b). Stünde es hier in
   * der Zählung, verspräche die Vorschau eine Absage, die nicht käme.
   */
  it('laesst ein Ereignis des Praxisbetriebs aussen vor', async () => {
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

    expect(await screen.findByText(/Diese Termine werden abgesagt \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Teambesprechung/)).not.toBeInTheDocument();
  });

  /**
   * Der Ausfall einer behandelnden Person ist praxisbedingt. Seit CAL-016
   * weist der Server „Patient:in hat abgesagt" hier ab - die Auswahl bietet
   * ihn deshalb gar nicht erst an (ADR-018 Fassung 2 Punkt 8.4).
   */
  it('bietet "Patient:in hat abgesagt" nicht als Grund an', async () => {
    rendern();
    await screen.findByText(/Diese Termine werden abgesagt/);

    const auswahl = screen.getByLabelText('Absagegrund');
    expect(
      within(auswahl).queryByRole('option', { name: 'Patient:in hat abgesagt' }),
    ).not.toBeInTheDocument();
    expect(
      within(auswahl).getByRole('option', { name: 'Praxis hat abgesagt' }),
    ).toBeInTheDocument();
  });

  it('sagt nichts ohne ausgewaehlten Grund ab', async () => {
    const user = userEvent.setup();
    rendern();
    await screen.findByText(/Diese Termine werden abgesagt/);

    await user.click(screen.getByRole('button', { name: '2 Termine absagen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, alle absagen' }));

    expect(await screen.findByText('Bitte einen Absagegrund auswählen.')).toBeInTheDocument();
    expect(cancelStaffDay).not.toHaveBeenCalled();
  });

  it('sagt nach Rueckfrage mit Person, Tag und Grund ab', async () => {
    const user = userEvent.setup();
    rendern();
    await screen.findByText(/Diese Termine werden abgesagt/);

    await user.selectOptions(screen.getByLabelText('Absagegrund'), 'practice_request');
    await user.click(screen.getByRole('button', { name: '2 Termine absagen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, alle absagen' }));

    await waitFor(() =>
      expect(cancelStaffDay).toHaveBeenCalledWith(ANNA, DATUM, 'practice_request'),
    );
  });

  it('zeigt danach die Anrufliste mit Waehlziel', async () => {
    const user = userEvent.setup();
    fetchDayPlan
      .mockResolvedValueOnce([eintrag({}), eintrag({ id: 'termin-2' })])
      .mockResolvedValue([
        eintrag({ status: 'cancelled' }),
        eintrag({ id: 'termin-2', status: 'cancelled' }),
      ]);
    rendern();
    await screen.findByText(/Diese Termine werden abgesagt/);

    await user.selectOptions(screen.getByLabelText('Absagegrund'), 'practice_request');
    await user.click(screen.getByRole('button', { name: '2 Termine absagen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, alle absagen' }));

    // Eine Erfolgsmeldung mit Zeichen (UIK-21).
    expect(await screen.findByText(/2 Termine sind abgesagt\. Jetzt anrufen\./)).toHaveTextContent(
      '✓',
    );
    const anruf = await screen.findAllByRole('link', { name: /Mobil: 0170 1234567/ });
    expect(anruf[0]).toHaveAttribute('href', 'tel:01701234567');
    expect(screen.getByText(/nicht gespeichert/)).toBeInTheDocument();
    // Die Anrufliste steht in der Adresse (KAL-06): Der Weg in die Akte nimmt
    // sie als Rückweg mit - nur Kennungen, keine Namen.
    const name = screen.getAllByRole('link', { name: 'Erika Beispiel' })[0]!;
    const zurueck = new URL(name.getAttribute('href')!, 'http://test').searchParams.get('zurueck');
    expect(zurueck).toContain('abgesagt=termin-1%2Ctermin-2');
    expect(zurueck).not.toMatch(/Erika|Beispiel/);
    // Nach dem letzten Anruf der Weg zum Kalender (KAL-19).
    expect(screen.getByRole('link', { name: 'Zum Kalender' })).toHaveAttribute('href', '/kalender');
  });

  it('bietet einem Zugang ohne Terminrecht keine Absage an', async () => {
    rendern(`/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}`, ['patient']);
    await screen.findByText(/Diese Termine werden abgesagt/);

    expect(screen.queryByRole('button', { name: '2 Termine absagen' })).not.toBeInTheDocument();
    expect(screen.getByText(/fehlt Ihrem Zugang die Berechtigung/)).toBeInTheDocument();
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
  it('haelt die Absageansicht barrierefrei', async () => {
    const { container } = rendern();
    await screen.findByText(/Diese Termine werden abgesagt/);
    await pruefeBarrierefreiheit(container);
  });

  it('haelt die Anrufliste barrierefrei - Waehlziele und Haken', async () => {
    const user = userEvent.setup();
    fetchDayPlan
      .mockResolvedValueOnce([eintrag({})])
      .mockResolvedValue([eintrag({ status: 'cancelled' })]);
    cancelStaffDay.mockResolvedValue(1);

    const { container } = rendern();
    await screen.findByText(/Diese Termine werden abgesagt/);
    await user.selectOptions(screen.getByLabelText('Absagegrund'), 'moved');
    await user.click(screen.getByRole('button', { name: '1 Termin absagen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, alle absagen' }));
    await screen.findByText(/Ein Termin ist abgesagt\. Jetzt anrufen\./);

    await pruefeBarrierefreiheit(container);
  });

  // ---------------------------------------------------------------------------
  // UX-Review 2026-09 (UXR-004)
  // ---------------------------------------------------------------------------

  it('fuehrt die Anrufliste nur aus den eben abgesagten Kennungen der Adresse (KAL-06)', async () => {
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

    expect(await screen.findByText('Anrufliste (1)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Erika Beispiel' })).toBeInTheDocument();
    expect(screen.queryByText(/Frueher Abgesagt/)).toBeNull();
    // Keine zweite Absage: Die Seite steht nach dem Neuladen wieder bei der Anrufliste.
    expect(screen.queryByRole('button', { name: /absagen/ })).toBeNull();
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
    expect(await screen.findByText(/Diese Termine werden abgesagt \(2\)/)).toBeInTheDocument();
  });

  it('beschriftet die leere Wahl wie ueberall (WRT-14)', async () => {
    rendern();
    await screen.findByText(/Diese Termine werden abgesagt/);

    expect(
      within(screen.getByLabelText('Absagegrund')).getByRole('option', { name: 'Bitte wählen …' }),
    ).toBeInTheDocument();
  });

  it('laesst die Anrufliste stehen, wenn nur das Nachladen scheitert (ZST-03)', async () => {
    fetchDayPlan.mockResolvedValue([eintrag({ status: 'cancelled' })]);
    rendern(`/kalender/tag-umplanen?person=${ANNA}&datum=${DATUM}&abgesagt=termin-1`);
    expect(await screen.findByText('Anrufliste (1)')).toBeInTheDocument();

    // Das Gerät kommt zurück, das Nachladen scheitert - der Stand bleibt.
    fetchDayPlan.mockRejectedValue(new Error('Netz'));
    window.dispatchEvent(new Event('visibilitychange'));

    expect(
      await screen.findByText('Der Stand konnte nicht aktualisiert werden.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Anrufliste (1)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Erika Beispiel' })).toBeInTheDocument();
  });

  it('sagt an einem Tag ohne bestaetigte Termine nichts an', async () => {
    fetchDayPlan.mockResolvedValue([]);
    rendern();

    expect(await screen.findByText('Hier ist nichts umzuplanen.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /absagen/ })).not.toBeInTheDocument();
  });
});
