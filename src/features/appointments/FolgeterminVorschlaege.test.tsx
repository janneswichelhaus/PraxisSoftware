import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as SlotApi from '@/features/slot-search/api';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { tagePlus } from './calendar';
import { FolgeterminVorschlaege } from './FolgeterminVorschlaege';

const fetchUpcomingAppointments = vi.fn();
const createAppointment = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  fetchUpcomingAppointments: (id: string) =>
    fetchUpcomingAppointments(id) as Promise<AppointmentsApi.UpcomingAppointment[]>,
  createAppointment: (...args: unknown[]) => createAppointment(...args) as Promise<string>,
}));
const findFreeSlots = vi.fn();
const rateSlotTravel = vi.fn();
vi.mock('@/features/slot-search/api', async (importOriginal) => ({
  ...(await importOriginal<typeof SlotApi>()),
  findFreeSlots: (params: SlotApi.SearchParams) => findFreeSlots(params) as Promise<SlotApi.Slot[]>,
  rateSlotTravel: (items: SlotApi.TravelItem[]) =>
    rateSlotTravel(items) as Promise<SlotApi.TravelRating[]>,
}));
// Ohne Kartendienst: Die Matrix scheitert, bewertet wird trotzdem (ANN-136).
vi.mock('@/features/tours/fahrzeitfaktor', () => ({
  usePlanungsmatrix: () => ({ isSuccess: false, isError: true, data: undefined }),
}));

const ZONE = 'Europe/Berlin';
// Ein Termin in der Zukunft, damit „nächste Woche" sicher im Suchfenster liegt.
const TAG = tagePlus(new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date()), 2);
const termin = testAppointment({
  appointment_type: 'home_visit',
  location_id: null,
  starts_at: `${TAG}T08:00:00.000Z`,
  ends_at: `${TAG}T09:00:00.000Z`,
  organization_time_zone: ZONE,
});
const BEGINN = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ZONE,
}).format(new Date(termin.starts_at));

function platz(datum: string, von: string, teil: Partial<SlotApi.Slot> = {}): SlotApi.Slot {
  return {
    staff_member_id: termin.staff_member_id,
    staff_name: 'Anna Beispiel',
    slot_date: datum,
    start_time: von,
    end_time: `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}${von.slice(2)}`,
    territory_status: 'match',
    prev_appointment_id: null,
    prev_lat: null,
    prev_lon: null,
    next_appointment_id: null,
    next_lat: null,
    next_lon: null,
    target_lat: 48.52,
    target_lon: 9.05,
    ...teil,
  };
}

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(
    <FolgeterminVorschlaege appointment={termin} user={testUser(rollen)} hierher="/hier" />,
  );
}

describe('FolgeterminVorschlaege (Auftrag C1, ANN-477)', () => {
  beforeEach(() => {
    fetchUpcomingAppointments.mockReset();
    fetchUpcomingAppointments.mockResolvedValue([]);
    createAppointment.mockReset();
    createAppointment.mockResolvedValue('neu-1');
    findFreeSlots.mockReset();
    rateSlotTravel.mockReset();
    rateSlotTravel.mockImplementation((items: SlotApi.TravelItem[]) =>
      Promise.resolve(
        items.map((item) => ({
          item_index: item.index,
          status: item.index === 2 ? 'tight' : 'ok',
          shortfall_minutes: item.index === 2 ? 5 : 0,
        })),
      ),
    );
    const naechsteWoche = tagePlus(TAG, 7);
    findFreeSlots.mockImplementation((p: SlotApi.SearchParams) =>
      Promise.resolve(
        p.from === p.to
          ? [platz(naechsteWoche, '07:00'), platz(naechsteWoche, BEGINN)]
          : [
              platz(tagePlus(TAG, 1), '14:00', { territory_status: 'outside' }),
              platz(tagePlus(TAG, 1), '16:00'),
              platz(tagePlus(TAG, 3), '08:00'),
            ],
      ),
    );
  });

  it('schlägt zuerst nächste Woche zur gleichen Zeit vor, dann je Tag einen Platz', async () => {
    rendern();
    const gruppe = await screen.findByRole('group', { name: 'Folgetermin anlegen' });
    const chips = await vi.waitFor(() => {
      const alle = gruppe.querySelectorAll('button');
      if (alle.length !== 3) throw new Error('noch nicht alle');
      return [...alle];
    });
    expect(chips[0]).toHaveTextContent(`${BEGINN} · gleiche Zeit`);
    // Nur Abweichungen tragen ein Wort (UX-005g).
    await vi.waitFor(() => expect(chips[1]).toHaveTextContent('außerhalb Gebietstag'));
    await vi.waitFor(() => expect(chips[2]).toHaveTextContent('Weg knapp'));
    // Gesucht wird für dieselbe Person, Art und Dauer.
    expect(findFreeSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        staffMemberId: termin.staff_member_id,
        type: termin.appointment_type,
        duration: 60,
      }),
    );
  });

  it('legt mit einem Tipp an - über `create_appointment`, ohne Formular', async () => {
    const user = userEvent.setup();
    rendern();
    const gleich = await screen.findByRole('button', { name: /gleiche Zeit/ });
    await user.click(gleich);
    expect(createAppointment).toHaveBeenCalledTimes(1);
    expect(createAppointment).toHaveBeenCalledWith(termin.patient_id, {
      staff_member_id: termin.staff_member_id,
      appointment_type: termin.appointment_type,
      date: tagePlus(TAG, 7),
      start_time: BEGINN,
      end_time: expect.any(String) as string,
      location_id: termin.location_id ?? '',
    });
    expect(await screen.findByText(/Folgetermin angelegt: /)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Im Kalender' })).toHaveAttribute(
      'href',
      `/kalender?termin=neu-1&zurueck=${encodeURIComponent('/hier')}`,
    );
  });

  it('sagt, was der Server einwendet, und legt nichts still an', async () => {
    createAppointment.mockRejectedValue(
      new Error('In diesem Zeitraum hat die behandelnde Person bereits einen Termin.'),
    );
    const user = userEvent.setup();
    rendern();
    await user.click(await screen.findByRole('button', { name: /gleiche Zeit/ }));
    expect(
      await screen.findByText(
        'In diesem Zeitraum hat die behandelnde Person bereits einen Termin.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Folgetermin angelegt/)).toBeNull();
  });

  it('sucht im Funkloch mit „Erneut versuchen" noch einmal (Praxis-Review R2, P2)', async () => {
    findFreeSlots.mockRejectedValueOnce(new Error('Failed to fetch'));
    findFreeSlots.mockRejectedValueOnce(new Error('Failed to fetch'));
    const user = userEvent.setup();
    rendern();
    // Der Fehler steht wie auf jeder Seite (Design-Review R2, P2): Titel, der
    // eine Satz zur Verbindung und „Erneut versuchen" in einer Meldung.
    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Die freien Zeiten konnten nicht gesucht werden.');
    expect(meldung).toHaveTextContent(VERBINDUNG_PRUEFEN);
    const aufrufe = findFreeSlots.mock.calls.length;
    await user.click(within(meldung).getByRole('button', { name: 'Erneut versuchen' }));
    // Danach stehen die Vorschläge da - ohne die Seite neu zu laden.
    expect(await screen.findByRole('button', { name: /gleiche Zeit/ })).toBeInTheDocument();
    expect(findFreeSlots.mock.calls.length).toBeGreaterThan(aufrufe);
    expect(screen.queryByText('Die freien Zeiten konnten nicht gesucht werden.')).toBeNull();
  });

  it('erscheint nur für Rollen, die Termine verwalten', () => {
    const { container } = rendern(['patient']);
    expect(container).toBeEmptyDOMElement();
    expect(fetchUpcomingAppointments).not.toHaveBeenCalled();
  });
});
