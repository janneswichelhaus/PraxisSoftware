import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as SlotApi from '@/features/slot-search/api';
import type * as TagesrouteModul from '@/features/tours/tagesroute';
import type * as WegModul from './wegpruefung';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { tagePlus } from './calendar';
import { zeitpunktIn } from './api';
import { luftStufe, type Seite, type Wegpruefung } from './wegpruefung';
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
vi.mock('@/features/slot-search/api', async (importOriginal) => ({
  ...(await importOriginal<typeof SlotApi>()),
  findFreeSlots: (params: SlotApi.SearchParams) => findFreeSlots(params) as Promise<SlotApi.Slot[]>,
}));
const fetchDayRoute = vi.fn();
vi.mock('@/features/tours/tagesroute', async (importOriginal) => ({
  ...(await importOriginal<typeof TagesrouteModul>()),
  fetchDayRoute: (datum: string, person: string) =>
    fetchDayRoute(datum, person) as Promise<TagesrouteModul.Tagesstopp[]>,
}));

/**
 * „Passt es?“ je Kandidat (`useWegpruefung`) hat eigene Tests
 * (`wegpruefung.test.tsx`). Hier antwortet ein kleiner Speicher je Tag und
 * Beginn; ändert ein Test eine Antwort, rendert die Zeile neu - wie nach
 * einer Abfrage.
 */
const wege = vi.hoisted(() => {
  let stand = new Map<string, unknown>();
  const hoerer = new Set<() => void>();
  const gefragt = new Set<string>();
  return {
    gefragt,
    lies: () => stand,
    abonniere: (hoeren: () => void) => {
      hoerer.add(hoeren);
      return () => void hoerer.delete(hoeren);
    },
    setze: (schluessel: string, wert: unknown) => {
      stand = new Map(stand).set(schluessel, wert);
      for (const hoeren of hoerer) hoeren();
    },
    leere: () => {
      stand = new Map();
      gefragt.clear();
    },
  };
});
vi.mock('./wegpruefung', async (importOriginal) => {
  const echt = await importOriginal<typeof WegModul>();
  const { useSyncExternalStore } = await import('react');
  return {
    ...echt,
    useWegpruefung: (frage: WegModul.Wegfrage | null): WegModul.Wegpruefung => {
      const alle = useSyncExternalStore(wege.abonniere, wege.lies);
      if (!frage) return { stand: 'aus' };
      const stunde = String(Math.floor(frage.beginnMinute / 60)).padStart(2, '0');
      const minute = String(frage.beginnMinute % 60).padStart(2, '0');
      const schluessel = `${frage.datum} ${stunde}:${minute}`;
      wege.gefragt.add(schluessel);
      return (alle.get(schluessel) as WegModul.Wegpruefung | undefined) ?? PASST;
    },
  };
});

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
const NAECHSTE_WOCHE = tagePlus(TAG, 7);

function geprueft(luft: number, nachbar: 'termin' | 'tagesrand' = 'termin'): Seite {
  return {
    stand: 'geprueft',
    luft,
    stufe: luftStufe(luft),
    fruehester: `${TAG}T07:00:00.000Z`,
    fahrtMinuten: 12,
    nachbar,
    nachbarZeit: `${TAG}T06:00:00.000Z`,
  };
}
const PASST: Wegpruefung = { stand: 'bereit', an: geprueft(20), weiter: geprueft(32) };
const ZU_KNAPP: Wegpruefung = { stand: 'bereit', an: geprueft(-15), weiter: geprueft(40) };

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

function stopp(datum: string, von: string, bis: string): TagesrouteModul.Tagesstopp {
  const minute = (z: string) => Number(z.slice(0, 2)) * 60 + Number(z.slice(3));
  return {
    id: `${datum}-${von}`,
    kind: 'therapy',
    appointment_type: 'home_visit',
    status: 'confirmed',
    starts_at: zeitpunktIn(datum, minute(von), ZONE),
    ends_at: zeitpunktIn(datum, minute(bis), ZONE),
    lat: 48.53,
    lon: 9.06,
    geocode_precision: 'address',
    position_source: 'visit',
  };
}

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(
    <FolgeterminVorschlaege appointment={termin} user={testUser(rollen)} hierher="/hier" />,
  );
}

/**
 * Die Zeilen der Vorschläge, sobald so viele dastehen. Bis dahin laufen
 * Suche, Tagesrouten und Prüfungen nacheinander - deshalb mehr Geduld als
 * die üblichen 1000 ms.
 */
async function zeilen(anzahl: number): Promise<HTMLElement[]> {
  return vi.waitFor(
    () => {
      const alle = vorschlaege();
      if (alle.length !== anzahl) throw new Error(`${alle.length} statt ${anzahl} Zeilen`);
      return alle;
    },
    { timeout: 4000 },
  );
}

/** Die Zeilen, die gerade dastehen (ohne Namensberechnung - die ist in jsdom langsam). */
function vorschlaege(): HTMLElement[] {
  return screen
    .queryAllByRole('button')
    .filter((knopf) => knopf.textContent?.startsWith('Folgetermin anlegen:'));
}

describe('FolgeterminVorschlaege (Auftrag C1, ANN-477, Befund B8)', () => {
  beforeEach(() => {
    wege.leere();
    fetchUpcomingAppointments.mockReset();
    fetchUpcomingAppointments.mockResolvedValue([]);
    createAppointment.mockReset();
    createAppointment.mockResolvedValue('neu-1');
    fetchDayRoute.mockReset();
    fetchDayRoute.mockResolvedValue([]);
    findFreeSlots.mockReset();
    findFreeSlots.mockImplementation((p: SlotApi.SearchParams) =>
      Promise.resolve(
        p.from === p.to
          ? [platz(NAECHSTE_WOCHE, '07:00'), platz(NAECHSTE_WOCHE, BEGINN)]
          : [
              platz(tagePlus(TAG, 1), '14:00', { territory_status: 'outside' }),
              platz(tagePlus(TAG, 1), '16:00'),
              platz(tagePlus(TAG, 3), '08:00'),
              platz(tagePlus(TAG, 4), '08:00'),
              platz(tagePlus(TAG, 5), '08:00'),
              platz(tagePlus(TAG, 6), '08:00'),
              platz(tagePlus(TAG, 8), '08:00'),
              platz(tagePlus(TAG, 9), '08:00'),
            ],
      ),
    );
  });

  it('schlägt zuerst nächste Woche zur gleichen Zeit vor, dann je Tag einen Platz', async () => {
    rendern();
    const [erste, zweite, dritte] = await zeilen(3);
    expect(erste).toHaveTextContent(`${BEGINN}–`);
    expect(erste).toHaveTextContent('gleiche Zeit');
    // Nur Abweichungen tragen ein Wort (UX-005g).
    expect(zweite).toHaveTextContent('14:00–15:00');
    expect(zweite).toHaveTextContent('außerhalb Gebietstag');
    expect(dritte).toHaveTextContent('08:00–09:00');
    // Gesucht wird für dieselbe Person, Art und Dauer.
    expect(findFreeSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        staffMemberId: termin.staff_member_id,
        type: termin.appointment_type,
        duration: 60,
      }),
    );
  });

  it('zeigt Therapeut:in, die Termine davor und danach und die mögliche Dauer', async () => {
    fetchDayRoute.mockImplementation((datum: string) =>
      Promise.resolve(
        datum === NAECHSTE_WOCHE
          ? [stopp(datum, '06:30', '07:15'), stopp(datum, '12:30', '13:30')]
          : [],
      ),
    );
    rendern();
    const [erste, zweite] = await zeilen(3);
    expect(erste).toHaveTextContent('Anna Beispiel · gleiche Zeit');
    await vi.waitFor(() => expect(erste).toHaveTextContent('davor 06:30–07:15 · danach 12:30'));
    // 32 Minuten Luft zur Weiterfahrt, auf das Raster abgerundet: 60 + 30.
    expect(erste).toHaveTextContent('Wege passen · bis 90 Min. möglich');
    expect(within(erste!).getByText('Wege passen')).toHaveTextContent('✓');
    // Nur Zeiten, kein Name eines anderen Termins.
    expect(zweite).toHaveTextContent('kein Termin davor oder danach');
    expect(fetchDayRoute).toHaveBeenCalledWith(NAECHSTE_WOCHE, termin.staff_member_id);
  });

  it('lässt zu knappe Vorschläge weg, der nächste Platz rückt nach (ANN-535)', async () => {
    wege.setze(`${tagePlus(TAG, 1)} 14:00`, ZU_KNAPP);
    rendern();
    const [erste, zweite, dritte] = await zeilen(3);
    expect(erste).toHaveTextContent('gleiche Zeit');
    // Am selben Tag rückt der nächste Platz nach.
    expect(zweite).toHaveTextContent('16:00–17:00');
    expect(dritte).toHaveTextContent('08:00–09:00');
    expect(screen.queryByText(/14:00–15:00/)).toBeNull();
  });

  it('behält ungeprüfte Vorschläge mit Kennzeichen und nennt Knappes', async () => {
    wege.setze(`${NAECHSTE_WOCHE} ${BEGINN}`, {
      stand: 'bereit',
      an: { stand: 'nicht_geprueft' },
      weiter: geprueft(12),
    });
    wege.setze(`${tagePlus(TAG, 1)} 14:00`, {
      stand: 'bereit',
      an: geprueft(2),
      weiter: geprueft(20),
    });
    rendern();
    const [erste, zweite] = await zeilen(3);
    expect(erste).toHaveTextContent('Weg ungeprüft · bis 70 Min. möglich');
    expect(within(zweite!).getByText('Weg knapp')).toHaveTextContent('!');
  });

  it('zeigt hinter einer laufenden Prüfung nichts, damit keine Zeile verrutscht', async () => {
    wege.setze(`${NAECHSTE_WOCHE} ${BEGINN}`, { stand: 'laedt' });
    rendern();
    expect(await screen.findByText('Freie Zeiten werden geprüft …')).toBeInTheDocument();
    expect(vorschlaege()).toHaveLength(0);

    act(() => wege.setze(`${NAECHSTE_WOCHE} ${BEGINN}`, PASST));
    await zeilen(3);
    expect(screen.queryByText(/werden geprüft/)).toBeNull();
  });

  it('prüft höchstens sechs Kandidaten und sagt, wenn keiner passt', async () => {
    wege.setze(`${NAECHSTE_WOCHE} ${BEGINN}`, ZU_KNAPP);
    for (const [tag, zeit] of [
      [1, '14:00'],
      [1, '16:00'],
      [3, '08:00'],
      [4, '08:00'],
      [5, '08:00'],
      [6, '08:00'],
      [8, '08:00'],
      [9, '08:00'],
    ] as const) {
      wege.setze(`${tagePlus(TAG, tag)} ${zeit}`, ZU_KNAPP);
    }
    rendern();
    expect(
      await screen.findByText('Die nächsten freien Plätze passen nicht zu den Wegen.'),
    ).toBeInTheDocument();
    expect(wege.gefragt.size).toBe(6);
    expect(screen.getByRole('link', { name: /Andere Zeit suchen/ })).toBeInTheDocument();
  });

  it('legt mit einem Tipp auf die Zeile an - über `create_appointment`, ohne Formular', async () => {
    const user = userEvent.setup();
    rendern();
    const [erste] = await zeilen(3);
    await user.click(erste!);
    expect(createAppointment).toHaveBeenCalledTimes(1);
    expect(createAppointment).toHaveBeenCalledWith(termin.patient_id, {
      staff_member_id: termin.staff_member_id,
      appointment_type: termin.appointment_type,
      date: NAECHSTE_WOCHE,
      start_time: BEGINN,
      end_time: expect.any(String) as string,
      location_id: termin.location_id ?? '',
    });
    expect(await screen.findByText(/Folgetermin angelegt:/)).toHaveTextContent(
      `${BEGINN} Uhr bei Anna Beispiel`,
    );
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
    const [erste] = await zeilen(3);
    await user.click(erste!);
    expect(
      await screen.findByText(
        'In diesem Zeitraum hat die behandelnde Person bereits einen Termin.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Folgetermin angelegt/)).toBeNull();
  });

  it('nennt einen schon geplanten nächsten Termin mit Therapeut:in', async () => {
    fetchUpcomingAppointments.mockResolvedValue([
      {
        id: 'spaeter',
        starts_at: `${NAECHSTE_WOCHE}T08:00:00.000Z`,
        ends_at: `${NAECHSTE_WOCHE}T09:00:00.000Z`,
        appointment_type: 'home_visit',
        status: 'confirmed',
        staff_given_name: 'Anna',
        staff_family_name: 'Beispiel',
        notification_channels: [],
        organization_time_zone: ZONE,
      },
    ]);
    rendern();
    expect(await screen.findByText(/Nächster Termin:/)).toHaveTextContent(
      `${BEGINN} Uhr bei Anna Beispiel`,
    );
    expect(findFreeSlots).not.toHaveBeenCalled();
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
    await zeilen(3);
    expect(findFreeSlots.mock.calls.length).toBeGreaterThan(aufrufe);
    expect(screen.queryByText('Die freien Zeiten konnten nicht gesucht werden.')).toBeNull();
  });

  it('erscheint nur für Rollen, die Termine verwalten', () => {
    const { container } = rendern(['patient']);
    expect(container).toBeEmptyDOMElement();
    expect(fetchUpcomingAppointments).not.toHaveBeenCalled();
  });
});
