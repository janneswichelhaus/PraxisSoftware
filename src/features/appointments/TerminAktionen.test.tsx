import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import type * as AppointmentsApi from './api';
import type * as DokumentationApi from '@/features/documentation/api';
import type * as TagesApi from '@/features/today/api';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

/** Praxistermin am 12.05.2027, 09:00-10:00 Ortszeit Europe/Berlin (CEST, +02:00). */
const praxistermin = testAppointment({
  id: TERMIN_ID,
  patient_id: PATIENT_ID,
});

const fetchAppointment = vi.fn();
const cancelAppointment = vi.fn();
const completeAppointment = vi.fn();
const reopenAppointment = vi.fn();
const recordNoShow = vi.fn();
const fetchEventParticipants = vi.fn();
const cancelAppointmentEvent = vi.fn();
const fetchEventSeries = vi.fn();
const cancelEventSeries = vi.fn();
const waiveAppointmentFee = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
    cancelAppointment: (
      id: string,
      erwartet: string,
      grund: AppointmentsApi.CancellationReason,
      datum: string | null,
      uhrzeit: string | null,
    ) => cancelAppointment(id, erwartet, grund, datum, uhrzeit) as Promise<void>,
    completeAppointment: (id: string, erwartet: string) =>
      completeAppointment(id, erwartet) as Promise<void>,
    reopenAppointment: (id: string, erwartet: string) =>
      reopenAppointment(id, erwartet) as Promise<void>,
    waiveAppointmentFee: (id: string, erwartet: string) =>
      waiveAppointmentFee(id, erwartet) as Promise<void>,
    recordNoShow: (id: string, erwartet: string, protokoll: boolean) =>
      recordNoShow(id, erwartet, protokoll) as Promise<void>,
    fetchEventParticipants: (gruppe: string) =>
      fetchEventParticipants(gruppe) as Promise<AppointmentsApi.EventParticipant[]>,
    cancelAppointmentEvent: (
      gruppe: string,
      erwartet: string,
      grund: AppointmentsApi.CancellationReason,
    ) => cancelAppointmentEvent(gruppe, erwartet, grund) as Promise<number>,
    fetchEventSeries: (serie: string) =>
      fetchEventSeries(serie) as Promise<AppointmentsApi.EventSeriesOccurrence[]>,
    cancelEventSeries: (
      serie: string,
      erwartet: string,
      grund: AppointmentsApi.CancellationReason,
    ) => cancelEventSeries(serie, erwartet, grund) as Promise<number>,
  };
});

// Die Behandlungsdokumentation haengt als eigener Abschnitt an dieser Seite
// (DOK-001). Ihr Lesepfad wird hier gestubbt; geprueft wird er in den Tests
// der Dokumentation selbst.
const fetchTreatmentDocumentation = vi.fn();

vi.mock('@/features/documentation/api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchTreatmentDocumentation: (id: string) =>
      fetchTreatmentDocumentation(id) as Promise<DokumentationApi.TreatmentDocumentation>,
  };
});

// Die Rufnummer im Ablauf „Niemand öffnet?" kommt aus der Tagesliste
// (UX-005b); ihr Lesepfad wird hier gestubbt.
const fetchDayPlan = vi.fn();

vi.mock('@/features/today/api', async (importOriginal) => {
  const actual = await importOriginal<typeof TagesApi>();
  return {
    ...actual,
    fetchDayPlan: (datum: string, staff: string) =>
      fetchDayPlan(datum, staff) as Promise<TagesApi.DayPlanEntry[]>,
  };
});

const { TerminAktionenDialog } = await import('./TerminAktionen');

/** Der Kalenderstand, aus dem das Fenster geöffnet wird. */
const KALENDER = '/kalender?ansicht=tag&datum=2027-05-12';

/**
 * Wer die Seite ansieht - mit dem Namen aus dem Seed, damit die Kennung zur
 * Rolle passt: Anna ist die behandelnde Person dieses Termins, Olivia sitzt
 * im Büro, Jannes ist owner, Tim leitet. Seit UX-005a hängt daran, ob die
 * Seite die behandelnde Person nennt (ANN-193).
 */
const NAMEN: Record<string, string> = {
  therapist: 'Anna Beispiel',
  office: 'Olivia Office',
  owner: 'Jannes Test',
  team_lead: 'Tim Teamleitung',
  patient: 'Max Mustermann',
};

function rendern(rollen: Parameters<typeof testUser>[0] = ['office']) {
  return renderWithProviders(
    <TerminAktionenDialog
      appointmentId={TERMIN_ID}
      user={testUser(rollen, NAMEN[rollen[0] ?? 'office'])}
      eingehend={KALENDER}
      zumTermin={`${KALENDER}&termin=${TERMIN_ID}`}
      onSchliessen={vi.fn()}
    />,
    KALENDER,
  );
}

/** Liest den Wert einer Datenzeile ueber ihre Beschriftung. */
function zeile(beschriftung: string): string {
  const dt = screen.getAllByText(beschriftung).find((el) => el.tagName === 'DT');
  if (!dt) throw new Error(`Datenzeile "${beschriftung}" nicht gefunden.`);
  const dd = dt.nextElementSibling;
  if (!dd) return '';
  // Die Zeichen der Abzeichen (✓ ! ×) sind für Vorlesesoftware ausgeblendet
  // und zählen hier ebenso wenig zum Wert.
  const klon = dd.cloneNode(true) as HTMLElement;
  klon.querySelectorAll('[aria-hidden="true"]').forEach((element) => element.remove());
  return klon.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('TerminAktionenDialog', () => {
  beforeEach(() => {
    fetchAppointment.mockReset();
    cancelAppointment.mockReset();
    completeAppointment.mockReset();
    reopenAppointment.mockReset();
    fetchAppointment.mockResolvedValue(praxistermin);
    cancelAppointment.mockResolvedValue(undefined);
    completeAppointment.mockResolvedValue(undefined);
    reopenAppointment.mockResolvedValue(undefined);
    recordNoShow.mockReset();
    recordNoShow.mockResolvedValue(undefined);
    fetchEventParticipants.mockReset();
    fetchEventParticipants.mockResolvedValue([]);
    cancelAppointmentEvent.mockReset();
    cancelAppointmentEvent.mockResolvedValue(2);
    fetchEventSeries.mockReset();
    fetchEventSeries.mockResolvedValue([]);
    cancelEventSeries.mockReset();
    cancelEventSeries.mockResolvedValue(3);
    fetchTreatmentDocumentation.mockReset();
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    fetchDayPlan.mockReset();
    fetchDayPlan.mockResolvedValue([]);
  });

  // UX-005a: Der Name steht im Titel und nirgends noch einmal; die
  // behandelnde Person steht für das Büro da, der Zustand „Bestätigt" nur für
  // Vorlesesoftware, und der Praxistermin trägt sein Kennzeichen - der
  // Hausbesuch als Regelfall keins (ANN-192).
  it('zeigt dem Büro die behandelnde Person und das Kennzeichen des Praxistermins', async () => {
    rendern();
    expect(await screen.findByText('Anna Beispiel')).toBeInTheDocument();
    expect(zeile('Behandelnde Person')).toBe('Anna Beispiel');
    expect(screen.getAllByText('Berta Bestand')).toHaveLength(1);
    expect(screen.queryByText('Patient:in')).not.toBeInTheDocument();
    expect(screen.queryByText('Art')).not.toBeInTheDocument();
    expect(screen.getByText('Praxistermin')).toBeInTheDocument();
    expect(zeile('Status')).toBe('Bestätigt');
    // Sichtbar steht der Regelfall nicht da (sr-only), erst ein anderer Zustand.
    expect(screen.getByText('Bestätigt')).toHaveClass('sr-only');
  });

  it('nennt der behandelnden Person an ihrem eigenen Termin nicht sich selbst (ANN-193)', async () => {
    rendern(['therapist']);
    expect(await screen.findByText('Berta Bestand')).toBeInTheDocument();
    expect(screen.queryByText('Behandelnde Person')).not.toBeInTheDocument();
    expect(screen.queryByText('Anna Beispiel')).not.toBeInTheDocument();
  });

  it('zeigt am Hausbesuch kein Wort für die Terminart und keine Zustandszeile', async () => {
    fetchAppointment.mockResolvedValue({
      ...praxistermin,
      appointment_type: 'home_visit',
      location_id: null,
      location_name: null,
      visit_street: 'Altstrasse',
      visit_house_number: '1',
      visit_postal_code: '72070',
      visit_city: 'Tuebingen',
    });
    rendern(['therapist']);
    await screen.findByText('Altstrasse 1');
    expect(screen.queryByText('Hausbesuch')).not.toBeInTheDocument();
    expect(screen.queryByText('Praxistermin')).not.toBeInTheDocument();
    expect(screen.queryByText(/Zeiten gelten in der Zeitzone/)).not.toBeInTheDocument();
  });

  it('zeigt Datum und Zeit in der Praxiszeitzone, nicht in UTC', async () => {
    rendern();
    // 07:00 UTC entspricht 09:00 Ortszeit in Europe/Berlin (Sommerzeit).
    expect(await screen.findByText('09:00–10:00 Uhr')).toBeInTheDocument();
    expect(zeile('Zeit')).toBe('09:00–10:00 Uhr');
    // Kurz in der Metazeile (Design-Handoff 2026-10-01, Abschnitt 6, Zyklus 3).
    expect(zeile('Datum')).toBe('Mi 12.05.2027');
  });

  it('zeigt beim Praxistermin den Standort', async () => {
    rendern();
    await screen.findByText('Berta Bestand');
    expect(zeile('Standort')).toContain('Hauptstandort Tuebingen');
    expect(zeile('Standort')).toContain('Praxistermin');
  });

  it('zeigt beim Hausbesuch die festgehaltene Anschrift', async () => {
    fetchAppointment.mockResolvedValue({
      ...praxistermin,
      appointment_type: 'home_visit',
      location_id: null,
      location_name: null,
      visit_street: 'Altstrasse',
      visit_house_number: '1',
      visit_postal_code: '72070',
      visit_city: 'Tuebingen',
    });
    rendern();

    await screen.findByText('Berta Bestand');
    expect(zeile('Anschrift')).toMatch(/^Altstrasse 1/);
    expect(zeile('Anschrift')).toContain('72070 Tuebingen');
  });

  it('zeigt beim Videotermin keinen Ort und den Hinweis zum fehlenden Link', async () => {
    fetchAppointment.mockResolvedValue({
      ...praxistermin,
      appointment_type: 'video',
      location_id: null,
      location_name: null,
    });
    rendern();

    await screen.findByText('Berta Bestand');
    expect(zeile('Ort')).toMatch(/^Videotermin/);
    expect(screen.getByText(/noch kein Videolink erzeugt/)).toBeInTheDocument();
  });

  it('kennzeichnet einen abgesagten Termin', async () => {
    fetchAppointment.mockResolvedValue({ ...praxistermin, status: 'cancelled' });
    rendern();

    expect(await screen.findByText(/Eine Absage wird nicht zurückgenommen/)).toBeInTheDocument();
    expect(zeile('Status')).toBe('Abgesagt');
  });

  it('zeigt den Absagegrund als Wort, nicht als Schluessel (CAL-008b)', async () => {
    fetchAppointment.mockResolvedValue({
      ...praxistermin,
      status: 'cancelled',
      cancellation_reason: 'practice_request',
    });
    rendern();

    await screen.findByText(/Eine Absage wird nicht zurückgenommen/);
    expect(zeile('Absagegrund')).toBe('Praxis hat abgesagt');
  });

  it('nennt eine Absage aus der Zeit vor dem Pflichtgrund "Nicht erfasst"', async () => {
    fetchAppointment.mockResolvedValue({
      ...praxistermin,
      status: 'cancelled',
      cancellation_reason: null,
    });
    rendern();

    await screen.findByText(/Eine Absage wird nicht zurückgenommen/);
    expect(zeile('Absagegrund')).toBe('Nicht erfasst');
  });

  // CAL-022: Ungedeckt heisst sichtbar - an der Grundlage, in der Liste und
  // hier. Der Termin gilt trotzdem; er erzeugt nur keine Leistung gegen diese
  // Grundlage (Paragraf 19, ADR-009).
  it('nennt einen ungedeckten Termin an seinem Termin', async () => {
    fetchAppointment.mockResolvedValue({ ...praxistermin, treatment_basis_covered: false });
    rendern();

    await screen.findByText('Berta Bestand');
    expect(screen.getByText('Ohne Deckung')).toBeInTheDocument();
    // In der Metazeile bei der Grundlage, die ihn nicht trägt (Zyklus 3).
    expect(zeile('Grundlage')).toMatch(/Ohne Deckung/);
  });

  it('schweigt an einem gedeckten Termin', async () => {
    fetchAppointment.mockResolvedValue({ ...praxistermin, treatment_basis_covered: true });
    rendern();

    await screen.findByText('Berta Bestand');
    expect(screen.queryByText('Ohne Deckung')).not.toBeInTheDocument();
  });

  describe('Aktionen (CAL-003)', () => {
    it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
      'bietet %s Bearbeiten und Absagen an',
      async (rolle) => {
        rendern([rolle]);
        await screen.findByText('Berta Bestand');

        // Die Bearbeitung kehrt in den Kalender zurück, aus dem das Fenster
        // geöffnet wurde (UX-012).
        expect(screen.getByRole('link', { name: 'Bearbeiten' })).toHaveAttribute(
          'href',
          `/termine/${TERMIN_ID}/bearbeiten?zurueck=${encodeURIComponent(KALENDER)}`,
        );
        expect(screen.getByRole('button', { name: 'Termin absagen' })).toBeInTheDocument();
      },
    );

    it('blendet beide Aktionen fuer ein Patientenkonto aus', async () => {
      rendern(['patient']);
      await screen.findByText('Berta Bestand');

      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
    });

    it('bietet bei einem abgesagten Termin keine Aktionen mehr an', async () => {
      fetchAppointment.mockResolvedValue({ ...praxistermin, status: 'cancelled' });
      rendern();
      await screen.findByText(/Eine Absage wird nicht zurückgenommen/);

      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
    });

    it('sagt nicht auf einen einzelnen Klick hin ab, sondern fragt zurueck', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));

      expect(cancelAppointment).not.toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: 'Ja, Termin absagen' })).toBeInTheDocument();
    });

    it('nennt in der Rueckfrage den betroffenen Termin und vermeidet Loeschsprache', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));

      const rueckfrage = await screen.findByRole('group', { name: 'Termin absagen' });
      expect(rueckfrage).toHaveTextContent('Berta Bestand');
      expect(rueckfrage).toHaveTextContent('12. Mai 2027');
      expect(rueckfrage).toHaveTextContent('09:00');
      expect(rueckfrage).toHaveTextContent(/bleibt vollständig erhalten/);
      expect(rueckfrage.textContent ?? '').not.toMatch(/l\u00f6sch/i);
    });

    it('setzt den Fokus auf die Bestaetigung', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Ja, Termin absagen' })).toHaveFocus(),
      );
    });

    it('gibt den Fokus beim Abbrechen zurueck', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Termin absagen' })).toHaveFocus(),
      );
      expect(cancelAppointment).not.toHaveBeenCalled();
    });

    it('sagt nach Bestaetigung mit dem gelesenen Stand und dem Grund ab', async () => {
      const user = userEvent.setup();
      const neuLaden = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
      rendern();
      await screen.findByText('Berta Bestand');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.selectOptions(screen.getByLabelText('Absagegrund'), 'patient_request');
      await user.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));

      await waitFor(() =>
        expect(cancelAppointment).toHaveBeenCalledWith(
          TERMIN_ID,
          praxistermin.updated_at,
          'patient_request',
          // Ohne Angabe stempelt der Server den Eingang (CAL-014c).
          null,
          null,
        ),
      );
      // UBK-011: Der Fahrweg zum abgesagten Termin fällt ohne Neuladen weg.
      await waitFor(() => expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['day-route'] }));
      expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['travel-buffers'] });
      neuLaden.mockRestore();
    });

    it('sagt ohne ausgewaehlten Grund nicht ab (CAL-008b)', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));

      expect(await screen.findByText('Bitte einen Absagegrund auswählen.')).toBeInTheDocument();
      expect(cancelAppointment).not.toHaveBeenCalled();
      // Die Rueckfrage bleibt offen: die Auswahl steht weiter zur Verfuegung.
      expect(screen.getByLabelText('Absagegrund')).toBeInTheDocument();
    });

    it('loest bei doppeltem Klick nur einen Schreibvorgang aus', async () => {
      let aufloesen: (() => void) | undefined;
      cancelAppointment.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            aufloesen = resolve;
          }),
      );

      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.selectOptions(screen.getByLabelText('Absagegrund'), 'patient_moved');

      const knopf = screen.getByRole('button', { name: 'Ja, Termin absagen' });
      await user.click(knopf);
      await user.click(knopf);

      expect(cancelAppointment).toHaveBeenCalledTimes(1);
      aufloesen?.();
    });

    it('zeigt einen Konflikt verstaendlich an, ohne fremde Daten zu nennen', async () => {
      cancelAppointment.mockRejectedValue(
        new Error(
          'Der Termin wurde zwischenzeitlich von einer anderen Person geändert. Bitte die Ansicht neu laden und die Änderung erneut vornehmen.',
        ),
      );
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.selectOptions(screen.getByLabelText('Absagegrund'), 'other');
      await user.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));

      expect(
        await screen.findByText(/zwischenzeitlich von einer anderen Person/),
      ).toBeInTheDocument();
    });
  });

  describe('CAL-014c: Nicht angetroffen ohne Gebuehrenentscheidung', () => {
    it('vermerkt nach einer Rueckfrage - und fragt dabei nach keiner Gebuehr', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Nicht angetroffen' }));

      // Bis ADR-018 Fassung 1 stand hier eine Pflichtauswahl. Jannes hat das
      // am 2026-09-12 geaendert: Das Abhaken vor der Tuer verlangt keine
      // Entscheidung, fuer die es noch keine Regel gibt (E14).
      expect(screen.queryByLabelText('Ausfallhonorar berechnen?')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Ja, niemand angetroffen' }));

      // Ohne Protokoll: Am Praxistermin gilt es nicht (CAL-018, ANN-055).
      await waitFor(() =>
        expect(recordNoShow).toHaveBeenCalledWith(TERMIN_ID, praxistermin.updated_at, false),
      );
    });

    // Der Satz „Das ist ein organisatorischer Vermerk …" ist gestrichen
    // (Design-Handoff 2026-10-01, Abschnitt 1, Entscheidung Jannes); die
    // Rückfrage nennt weiter, was geschieht und wie es zurückgeht.
    it('sagt im Vermerk, was geschieht - ohne den gestrichenen Erklärsatz', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Nicht angetroffen' }));

      const kasten = screen.getByRole('group', { name: 'Nicht angetroffen' });
      expect(kasten).toHaveTextContent('wird als „nicht angetroffen“ geführt');
      expect(kasten).toHaveTextContent('Termin wieder öffnen');
      expect(within(kasten).queryByText(/organisatorischer Vermerk/)).toBeNull();
    });

    it('zeigt am vermerkten Termin Zustand und den Weg zurueck - ohne Gebuehrenzeile', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'no_show',
        no_show_recorded_at: '2027-05-12T08:05:00.000Z',
      });
      rendern();

      await waitFor(() => expect(zeile('Status')).toBe('Nicht angetroffen'));
      expect(zeile('Status')).toBe('Nicht angetroffen');
      expect(screen.queryByText('Ausfallhonorar vorgemerkt')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Termin wieder öffnen' })).toBeInTheDocument();
    });

    it('bietet am vermerkten Termin kein zweites Vermerken und kein Absagen an', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'no_show',
        no_show_recorded_at: '2027-05-12T08:05:00.000Z',
      });
      rendern();

      await waitFor(() => expect(zeile('Status')).toBe('Nicht angetroffen'));
      expect(screen.queryByRole('button', { name: 'Nicht angetroffen' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
    });

    /**
     * Ein Kennzeichen aus der Zeit vor ADR-018 Fassung 2 bleibt sichtbar -
     * historische Vorgaenge werden nicht umgedeutet, aber auch nicht
     * versteckt.
     */
    it('zeigt ein Kennzeichen aus frueherer Fassung weiter an', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'no_show',
        no_show_recorded_at: '2027-05-12T08:05:00.000Z',
        fee_basis: 'no_show',
      });
      rendern();

      await waitFor(() => expect(zeile('Status')).toBe('Nicht angetroffen'));
      expect(zeile('Ausfallhonorar vorgemerkt')).toMatch(/Nicht angetroffen/);
      // Ohne bestaetigtes Protokoll steht auch keines da (CAL-018).
      expect(screen.queryByText('Protokoll')).not.toBeInTheDocument();
    });
  });

  /**
   * Der gefuehrte Ablauf am Hausbesuch (CAL-018, ADR-018 Fassung 3 Punkt 9).
   *
   * Hier steht die teuerste Verwechslung der Anwendung: „nicht angetroffen"
   * statt „Tuer geoeffnet" kostet eine Patientin Geld. Deshalb pruefen diese
   * Tests nicht nur, dass die Wege existieren, sondern dass die Folge jeweils
   * danebensteht - und dass ohne das Protokoll nichts geschrieben wird.
   */
  describe('CAL-018 / UX-005b: „Niemand öffnet?" am Hausbesuch', () => {
    const hausbesuch = testAppointment({
      id: TERMIN_ID,
      patient_id: PATIENT_ID,
      appointment_type: 'home_visit',
      location_id: null,
      location_name: null,
      visit_street: 'Testweg',
      visit_house_number: '7',
      visit_postal_code: '72072',
      visit_city: 'Tuebingen',
    });

    /** Der Termin, wie ihn die Tagesliste liefert - mit Rufnummer. */
    function tagesEintrag(teil: Partial<TagesApi.DayPlanEntry> = {}): TagesApi.DayPlanEntry {
      return {
        id: TERMIN_ID,
        patient_id: PATIENT_ID,
        staff_member_id: hausbesuch.staff_member_id,
        appointment_type: 'home_visit',
        kind: 'therapy',
        title: null,
        status: 'confirmed',
        starts_at: hausbesuch.starts_at,
        ends_at: hausbesuch.ends_at,
        patient_given_name: 'Berta',
        patient_family_name: 'Bestand',
        location_name: null,
        visit_street: 'Testweg',
        visit_house_number: '7',
        visit_postal_code: '72072',
        visit_city: 'Tuebingen',
        patient_phone: null,
        patient_phone_mobile: '+49 160 0000005',
        home_visit_access_note: null,
        special_note: null,
        documentation_status: 'none',
        organization_time_zone: 'Europe/Berlin',
        ...teil,
      };
    }

    async function ablaufOeffnen(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: 'Niemand öffnet?' }));
    }

    it('zeigt den Regelfall als Hauptknopf und den Ablauf zugeklappt', async () => {
      fetchAppointment.mockResolvedValue(hausbesuch);
      rendern(['therapist']);

      const knopf = await screen.findByRole('button', { name: 'Niemand öffnet?' });
      expect(knopf).toHaveAttribute('aria-expanded', 'false');
      // Ein Hauptknopf (BEF-055): „Doku“, daneben „Niemand öffnet?“ und
      // „Ohne Behandlung“; der Abschluss ohne Dokumentation liegt eingeklappt
      // darunter und heißt „Nur Termin abschließen“.
      const abschluss = screen.getByRole('group', { name: 'Abschluss' });
      expect(within(abschluss).getAllByRole('link', { name: 'Doku schreiben' })).toHaveLength(1);
      const nur = within(abschluss).getByRole('button', { name: 'Nur Termin abschließen' });
      expect(nur.closest('details')).not.toHaveAttribute('open');
      expect(screen.queryByRole('button', { name: 'Termin abschließen' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Ohne Behandlung' })).toHaveAttribute(
        'href',
        expect.stringContaining(`/termine/${TERMIN_ID}/abschluss?ohne-behandlung=1`),
      );
      // Der Kasten mit vier Fällen von vorher steht nicht mehr offen da.
      expect(screen.queryByText('Was ist passiert?')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('An der Tür geklingelt')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nicht angetroffen' })).not.toBeInTheDocument();
      // Der Abschluss ohne Dokumentation ist der Haken (ANN-005, Abschnitt 6a).
      expect(screen.queryByRole('button', { name: 'Ohne Dokumentation abschließen' })).toBeNull();
    });

    it('fuehrt nach dem Oeffnen durch die drei Schritte und nennt zu jedem Fall die Folge', async () => {
      fetchAppointment.mockResolvedValue(hausbesuch);
      const user = userEvent.setup();
      rendern(['therapist']);

      await ablaufOeffnen(user);
      expect(screen.getByRole('button', { name: 'Niemand öffnet?' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      const ablauf = screen.getByRole('region', { name: 'Niemand öffnet?' });
      // In der Reihenfolge, in der es vor der Tür passiert.
      expect(
        within(ablauf)
          .getAllByRole('checkbox')
          .map((kasten) => kasten.closest('label')?.textContent?.trim()),
      ).toEqual(['An der Tür geklingelt', '15 Minuten vor Ort gewartet', 'Telefonisch angerufen']);

      // Dasselbe Wort wie auf Rechnung, Katalog und Blatt für Patient:innen
      // (TER-10), derselbe Zustand wie am Knopf (WRT-B01).
      expect(within(ablauf).getByText(/löst ein Ausfallhonorar aus/)).toBeInTheDocument();
      // Alle drei Szenarien bleiben genannt (ADR-018 Punkt 9); der Weg ohne
      // Behandlung steht seit Zyklus 3 in der Leiste darüber.
      expect(within(ablauf).getByText(/ohne Ausfallhonorar/)).toBeInTheDocument();
      expect(within(ablauf).getByText(/Vorher abgesagt\?/)).toBeInTheDocument();
      expect(screen.queryByText(/Ausfallgebühr/)).not.toBeInTheDocument();
      expect(screen.queryByText(/nicht wahrgenommen/)).not.toBeInTheDocument();
      // Keine Technikwörter im Hinweis (WRT-03, TER-22).
      expect(screen.queryByText(/serverseitig/)).not.toBeInTheDocument();
    });

    it('bietet beim dritten Schritt die Rufnummer als Waehlziel - erst nach dem Oeffnen', async () => {
      fetchAppointment.mockResolvedValue(hausbesuch);
      fetchDayPlan.mockResolvedValue([tagesEintrag()]);
      const user = userEvent.setup();
      rendern(['therapist']);

      await screen.findByRole('button', { name: 'Niemand öffnet?' });
      expect(fetchDayPlan).not.toHaveBeenCalled();

      await ablaufOeffnen(user);
      const anruf = await screen.findByRole('link', { name: /Mobil\s*\+49 160 0000005/ });
      expect(anruf).toHaveAttribute('href', 'tel:+491600000005');
      // Gelesen wird der Tag des Termins bei seiner behandelnden Person.
      expect(fetchDayPlan).toHaveBeenCalledWith('2027-05-12', hausbesuch.staff_member_id);
    });

    it('sagt, wenn keine Rufnummer hinterlegt ist, und fuehrt in die Stammdaten', async () => {
      fetchAppointment.mockResolvedValue(hausbesuch);
      fetchDayPlan.mockResolvedValue([tagesEintrag({ patient_phone_mobile: null })]);
      const user = userEvent.setup();
      rendern(['therapist']);

      await ablaufOeffnen(user);
      expect(await screen.findByText(/Keine Rufnummer hinterlegt/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Zu den Stammdaten' })).toHaveAttribute(
        'href',
        `/patienten/${PATIENT_ID}/stammdaten`,
      );
    });

    it('vermerkt das Nichtantreffen erst mit allen drei Protokollschritten', async () => {
      fetchAppointment.mockResolvedValue(hausbesuch);
      const user = userEvent.setup();
      rendern(['therapist']);

      await ablaufOeffnen(user);
      await user.click(screen.getByLabelText('An der Tür geklingelt'));
      await user.click(screen.getByLabelText('15 Minuten vor Ort gewartet'));
      await user.click(screen.getByLabelText('Telefonisch angerufen'));
      await user.click(screen.getByRole('button', { name: 'Als „nicht angetroffen“ vermerken' }));

      await waitFor(() =>
        expect(recordNoShow).toHaveBeenCalledWith(TERMIN_ID, hausbesuch.updated_at, true),
      );
    });

    it('schreibt nichts, solange ein Protokollschritt fehlt', async () => {
      fetchAppointment.mockResolvedValue(hausbesuch);
      const user = userEvent.setup();
      rendern(['therapist']);

      await ablaufOeffnen(user);
      await user.click(screen.getByLabelText('An der Tür geklingelt'));
      await user.click(screen.getByLabelText('15 Minuten vor Ort gewartet'));
      await user.click(screen.getByRole('button', { name: 'Als „nicht angetroffen“ vermerken' }));

      expect(
        await screen.findByText('Bitte alle drei Schritte des Protokolls bestätigen.'),
      ).toBeInTheDocument();
      expect(recordNoShow).not.toHaveBeenCalled();
      // Der Ablauf bleibt offen: Wer die fehlende Angabe nachtragen will,
      // findet sie noch vor.
      expect(screen.getByLabelText('Telefonisch angerufen')).toBeInTheDocument();
    });

    it('zeigt am vermerkten Hausbesuch Protokoll und Gebuehrenanlass', async () => {
      fetchAppointment.mockResolvedValue({
        ...hausbesuch,
        status: 'no_show',
        no_show_recorded_at: '2027-05-12T08:05:00.000Z',
        no_show_protocol_confirmed: true,
        fee_basis: 'no_show',
      });
      rendern(['therapist']);

      await waitFor(() => expect(zeile('Status')).toBe('Nicht angetroffen'));
      expect(zeile('Protokoll')).toMatch(/15 Minuten vor Ort gewartet/);
      expect(zeile('Ausfallhonorar vorgemerkt')).toMatch(/Nicht angetroffen/);
      // Kein Betrag und seit dem Design-Handoff vom 2026-10-01 auch kein Satz
      // dazu, wo abgerechnet wird - gestrichen (Abschnitt 1).
      expect(zeile('Ausfallhonorar vorgemerkt')).not.toMatch(/Leistungen erfasst/);
      expect(screen.queryByText(/Leistungskatalog ist noch nicht/)).not.toBeInTheDocument();
    });

    it('zeigt den Ablauf nur am bestaetigten Hausbesuch', async () => {
      fetchAppointment.mockResolvedValue({ ...hausbesuch, status: 'completed' });
      rendern(['therapist']);

      await waitFor(() => expect(zeile('Status')).toBe('Abgeschlossen'));
      expect(screen.queryByRole('button', { name: 'Niemand öffnet?' })).not.toBeInTheDocument();
    });

    it('zeigt ihn am Praxistermin nicht', async () => {
      rendern(['therapist']);

      await screen.findByText('Berta Bestand');
      expect(screen.queryByRole('button', { name: 'Niemand öffnet?' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nicht angetroffen' })).toBeInTheDocument();
    });

    /**
     * Der geführte Ablauf ist Oberfläche mit Formularfeldern in einem
     * aufgeklappten Bereich — genau die Stelle, an der Beschriftungen und
     * ARIA-Bezüge gern verloren gehen (UI-000). Die Prüfung steht hier und
     * nicht in `barrierefreiheit.test.tsx`, weil die Seite dort ihre
     * Attrappen nicht hat; dasselbe Muster wie in `TagUmplanenPage.test.tsx`.
     */
    it('haelt den Ablauf samt Protokoll barrierefrei', async () => {
      fetchAppointment.mockResolvedValue(hausbesuch);
      fetchDayPlan.mockResolvedValue([tagesEintrag()]);
      const user = userEvent.setup();
      const { container } = rendern(['therapist']);

      await ablaufOeffnen(user);
      await screen.findByRole('link', { name: /Mobil/ });

      await pruefeBarrierefreiheit(container);
    });
  });

  describe('CAL-014c: Absage mit Eingang und Gebuehrenanlass', () => {
    it('sagt mit Grund ab und ueberlaesst den Eingang dem Server', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.selectOptions(screen.getByLabelText('Absagegrund'), 'patient_request');
      await user.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));

      // Ohne Angabe stempelt der Server: null, null.
      await waitFor(() =>
        expect(cancelAppointment).toHaveBeenCalledWith(
          TERMIN_ID,
          praxistermin.updated_at,
          'patient_request',
          null,
          null,
        ),
      );
    });

    it('reicht einen nachgetragenen Eingang in Ortszeit durch', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.selectOptions(screen.getByLabelText('Absagegrund'), 'patient_request');
      await user.selectOptions(
        screen.getByLabelText('Wann ist die Absage eingegangen?'),
        'frueher',
      );
      await user.type(screen.getByLabelText('Datum des Eingangs'), '2027-05-11');
      await user.type(screen.getByLabelText('Uhrzeit'), '19:30');
      await user.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));

      await waitFor(() =>
        expect(cancelAppointment).toHaveBeenCalledWith(
          TERMIN_ID,
          praxistermin.updated_at,
          'patient_request',
          '2027-05-11',
          '19:30',
        ),
      );
    });

    it('verlangt bei nachgetragenem Eingang Datum UND Uhrzeit', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.selectOptions(screen.getByLabelText('Absagegrund'), 'patient_request');
      await user.selectOptions(
        screen.getByLabelText('Wann ist die Absage eingegangen?'),
        'frueher',
      );
      await user.type(screen.getByLabelText('Datum des Eingangs'), '2027-05-11');
      await user.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));

      expect(
        await screen.findByText('Bitte Datum und Uhrzeit des Eingangs angeben.'),
      ).toBeInTheDocument();
      expect(cancelAppointment).not.toHaveBeenCalled();
    });

    /**
     * Die Frist rechnet ausschliesslich der Server. Die Oberflaeche zeigt das
     * Ergebnis und nennt ausdruecklich keinen Betrag - die Hoehe steht im
     * Katalog, abgerechnet wird ueber die Leistungen (TER-10).
     */
    it('zeigt den vorgemerkten Gebuehrenanlass ohne Betrag', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'cancelled',
        cancellation_reason: 'patient_request',
        cancellation_received_at: '2027-05-12T05:00:00.000Z',
        fee_basis: 'late_cancellation',
      });
      rendern();

      await screen.findByText(/Eine Absage wird nicht zurückgenommen/);
      expect(zeile('Status')).toBe('Abgesagt');
      expect(zeile('Absagegrund')).toBe('Patient:in hat abgesagt');
      expect(zeile('Ausfallhonorar vorgemerkt')).toMatch(/weniger als 24 Stunden/);
      expect(screen.queryByText(/Leistungen erfasst/)).toBeNull();
    });

    /**
     * ABN-006 (BEF-094): Verzicht als eigener Vermerk. Der Anlass bleibt
     * sichtbar; der Knopf steht nur bei owner und office und nur, solange
     * nicht verzichtet ist.
     */
    it('bietet office den Verzicht an und ruft ihn mit dem Stand auf', async () => {
      waiveAppointmentFee.mockResolvedValue(undefined);
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'cancelled',
        cancellation_reason: 'patient_moved',
        cancellation_received_at: '2027-05-12T05:00:00.000Z',
        fee_basis: 'late_cancellation',
      });
      const user = userEvent.setup();
      rendern(['office']);

      await screen.findByText(/Eine Absage wird nicht zurückgenommen/);
      expect(zeile('Absagegrund')).toBe('Patient:in hat verlegt');
      await user.click(screen.getByRole('button', { name: 'Auf die Gebühr verzichten' }));
      expect(screen.getByText(/lässt sich nicht zurücknehmen/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ja, verzichten' }));

      expect(waiveAppointmentFee).toHaveBeenCalledWith(praxistermin.id, praxistermin.updated_at);
    });

    it('zeigt den Verzicht neben dem Anlass und bietet ihn nicht erneut an', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'cancelled',
        cancellation_reason: 'patient_request',
        cancellation_received_at: '2027-05-12T05:00:00.000Z',
        fee_basis: 'late_cancellation',
        fee_waived_at: '2027-05-13T08:00:00.000Z',
      });
      rendern(['office']);

      await screen.findByText(/Eine Absage wird nicht zurückgenommen/);
      expect(zeile('Ausfallhonorar')).toMatch(
        /weniger als 24 Stunden vorher · verzichtet am Donnerstag, 13\. Mai 2027/,
      );
      expect(screen.queryByRole('button', { name: 'Auf die Gebühr verzichten' })).toBeNull();
    });

    it('bietet der Therapeut:in keinen Verzicht an', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'cancelled',
        cancellation_reason: 'patient_request',
        cancellation_received_at: '2027-05-12T05:00:00.000Z',
        fee_basis: 'late_cancellation',
      });
      rendern(['therapist']);

      await screen.findByText(/Eine Absage wird nicht zurückgenommen/);
      expect(screen.queryByRole('button', { name: 'Auf die Gebühr verzichten' })).toBeNull();
    });

    it('nennt bei einer Absage ohne Gebuehr keine Gebuehrenzeile', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'cancelled',
        cancellation_reason: 'practice_request',
        cancellation_received_at: '2027-05-12T05:00:00.000Z',
      });
      rendern();

      await screen.findByText(/Eine Absage wird nicht zurückgenommen/);
      expect(screen.queryByText('Ausfallhonorar vorgemerkt')).not.toBeInTheDocument();
    });

    it('nennt die Frist ohne Technikwörter (WRT-03, TER-22)', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));

      expect(
        screen.getByText(/Die Frist wird automatisch berechnet; genau 24 Stunden vorher gilt/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Server/)).not.toBeInTheDocument();
      // Die leere Auswahl heißt wie in jedem anderen Formular (WRT-14).
      expect(
        within(screen.getByLabelText('Absagegrund')).getByRole('option', {
          name: 'Bitte wählen …',
        }),
      ).toBeInTheDocument();
    });
  });

  describe('CAL-015b: Ereignis des Praxisbetriebs', () => {
    const GRUPPE = '88888888-8888-4888-8888-000000000001';

    const ereignis: AppointmentsApi.Appointment = {
      ...praxistermin,
      kind: 'internal',
      title: 'Teambesprechung',
      event_group_id: GRUPPE,
      patient_id: null,
      patient_given_name: null,
      patient_family_name: null,
    };

    /** Zwei Beteiligte - der Regelfall einer Besprechung (CAL-017). */
    const zweiBeteiligte: AppointmentsApi.EventParticipant[] = [
      {
        appointment_id: TERMIN_ID,
        staff_member_id: '55555555-5555-4555-8555-000000000002',
        display_name: 'Anna Beispiel',
        status: 'confirmed',
        group_updated_at: praxistermin.updated_at,
      },
      {
        appointment_id: '77777777-7777-4777-8777-000000000002',
        staff_member_id: '55555555-5555-4555-8555-000000000004',
        display_name: 'Tim Teamleitung',
        status: 'confirmed',
        group_updated_at: praxistermin.updated_at,
      },
    ];

    it('zeigt die Bezeichnung statt eines Namens und keinen Weg in eine Akte', async () => {
      fetchAppointment.mockResolvedValue(ereignis);
      rendern();

      expect(await screen.findByRole('heading', { name: /Teambesprechung/ })).toBeInTheDocument();
      expect(screen.queryByText('Patient:in')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Mustermann/ })).not.toBeInTheDocument();
    });

    /**
     * Der Kern der Abgrenzung: Ein Ereignis kommt nie in einen Zustand, aus
     * dem eine abrechenbare Leistung entstehen könnte (§19). Die Oberfläche
     * bietet die Wege gar nicht erst an; der Server weist sie zusätzlich ab.
     */
    it('bietet weder Abschluss noch Dokumentation noch "nicht angetroffen" an', async () => {
      fetchAppointment.mockResolvedValue(ereignis);
      rendern();

      await screen.findByRole('heading', { name: /Teambesprechung/ });
      expect(screen.queryByRole('button', { name: /abschließen/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Dokumentieren/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nicht angetroffen' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Folgetermin anlegen' })).not.toBeInTheDocument();
    });

    it('laesst sich absagen und bearbeiten - und trennt Ereignis von Teilnahme', async () => {
      fetchAppointment.mockResolvedValue(ereignis);
      rendern();

      await screen.findByRole('heading', { name: /Teambesprechung/ });
      expect(
        screen.getByRole('button', { name: 'Nur diese Teilnahme absagen' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Fehlzeit bearbeiten' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Teilnahme ändern' })).toBeInTheDocument();
    });

    /**
     * Die Absage eines Ereignisses ist eine Absage ohne Frist (CAL-016).
     *
     * Es gibt keine Patient:in, die absagen könnte, und keinen
     * Behandlungsbeginn, auf den sich eine Frist bezöge; der Server setzt dort
     * keinen Gebührenanlass. Die Rückfrage darf deshalb weder den Grund
     * „Patient:in hat abgesagt" anbieten noch nach dem Eingang fragen noch
     * eine Gebühr in Aussicht stellen.
     */
    it('fragt beim Absagen weder nach der Patient:in noch nach dem Eingang', async () => {
      const user = userEvent.setup();
      fetchAppointment.mockResolvedValue(ereignis);
      rendern();

      await screen.findByRole('heading', { name: /Teambesprechung/ });
      await user.click(screen.getByRole('button', { name: 'Nur diese Teilnahme absagen' }));

      const auswahl = await screen.findByLabelText('Absagegrund');
      expect(
        within(auswahl).queryByRole('option', { name: 'Patient:in hat abgesagt' }),
      ).not.toBeInTheDocument();
      expect(
        within(auswahl).getByRole('option', { name: 'Praxis hat abgesagt' }),
      ).toBeInTheDocument();

      expect(screen.queryByLabelText('Wann ist die Absage eingegangen?')).not.toBeInTheDocument();
      expect(screen.queryByText(/Ausfallhonorar vor/)).not.toBeInTheDocument();
      expect(screen.getByText(/löst kein Ausfallhonorar aus/)).toBeInTheDocument();
    });

    it('nennt in der Rueckfrage die Bezeichnung und keinen leeren Namen', async () => {
      const user = userEvent.setup();
      fetchAppointment.mockResolvedValue(ereignis);
      rendern();

      await screen.findByRole('heading', { name: /Teambesprechung/ });
      await user.click(screen.getByRole('button', { name: 'Nur diese Teilnahme absagen' }));

      const satz = await screen.findByText(/Die Teilnahme von/);
      expect(satz).toHaveTextContent('Teambesprechung');
      expect(satz).toHaveTextContent('Anna Beispiel');
      // Die Fehlzeit selbst bleibt stehen - genau das unterscheidet die
      // Teilnahme vom Ereignis (CAL-017).
      expect(satz).toHaveTextContent('bleibt für die übrigen Beteiligten bestehen');
      // „… Uhr für  wird als abgesagt geführt" - die Lücke, wo am
      // Behandlungstermin der Name steht.
      expect(satz.textContent).not.toContain('Uhr für');
    });

    /**
     * Die Klammer sichtbar machen: Wer hier steht, hat denselben Zeitraum
     * belegt, und eine Änderung trifft alle zugleich (CAL-017).
     */
    it('nennt die Beteiligten und bietet die Absage fuer alle an', async () => {
      fetchAppointment.mockResolvedValue(ereignis);
      fetchEventParticipants.mockResolvedValue(zweiBeteiligte);
      rendern();

      await screen.findByRole('heading', { name: /Teambesprechung/ });
      await waitFor(() => expect(zeile('Beteiligte')).toMatch(/^Anna Beispiel, Tim Teamleitung/));
      expect(screen.getByRole('button', { name: 'Fehlzeit absagen' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Nur diese Teilnahme absagen' }),
      ).toBeInTheDocument();
    });

    it('nennt jede Teilnahme beim Namen, ohne Weg auf eine Terminseite (TER-15)', async () => {
      fetchAppointment.mockResolvedValue(ereignis);
      fetchEventParticipants.mockResolvedValue(zweiBeteiligte);
      rendern();

      // Die andere Teilnahme steht im Kalender daneben; eine eigene Seite hat
      // sie nicht mehr (Akte entschlacken, 2026-10-03).
      expect(await screen.findByText(/Tim Teamleitung/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Tim Teamleitung' })).toBeNull();
    });

    it('nennt an der Fehlzeit die Fehlzeit, nicht den Termin (TER-22)', async () => {
      fetchAppointment.mockResolvedValue(ereignis);
      rendern();

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Teambesprechung' }),
      ).toBeInTheDocument();
      // Keine Fußnote mehr, die sagt, was jeder hier weiß (UX-005a).
      expect(screen.queryByText(/enthält ausschließlich organisatorische/)).not.toBeInTheDocument();
      expect(screen.queryByText('Patient:in')).not.toBeInTheDocument();
    });

    it('sagt das ganze Ereignis auf dem Stand der Gruppe ab', async () => {
      const user = userEvent.setup();
      fetchAppointment.mockResolvedValue(ereignis);
      fetchEventParticipants.mockResolvedValue(zweiBeteiligte);
      rendern();

      await screen.findByRole('button', { name: 'Fehlzeit absagen' });
      await user.click(screen.getByRole('button', { name: 'Fehlzeit absagen' }));
      await user.selectOptions(await screen.findByLabelText('Absagegrund'), 'practice_request');
      await user.click(screen.getByRole('button', { name: 'Ja, für alle absagen' }));

      await waitFor(() =>
        expect(cancelAppointmentEvent).toHaveBeenCalledWith(
          GRUPPE,
          praxistermin.updated_at,
          'practice_request',
        ),
      );
    });

    it('bietet bei nur einer offenen Teilnahme keine Absage fuer alle an', async () => {
      fetchAppointment.mockResolvedValue(ereignis);
      fetchEventParticipants.mockResolvedValue([zweiBeteiligte[0]!]);
      rendern();

      await screen.findByRole('heading', { name: /Teambesprechung/ });
      await screen.findByRole('button', { name: 'Nur diese Teilnahme absagen' });
      expect(screen.queryByRole('button', { name: 'Fehlzeit absagen' })).not.toBeInTheDocument();
    });

    it('sagt ohne Eingangsangabe ab', async () => {
      const user = userEvent.setup();
      fetchAppointment.mockResolvedValue(ereignis);
      rendern();

      await screen.findByRole('heading', { name: /Teambesprechung/ });
      await user.click(screen.getByRole('button', { name: 'Nur diese Teilnahme absagen' }));
      await user.selectOptions(await screen.findByLabelText('Absagegrund'), 'practice_request');
      await user.click(screen.getByRole('button', { name: 'Ja, Teilnahme absagen' }));

      await waitFor(() =>
        expect(cancelAppointment).toHaveBeenCalledWith(
          TERMIN_ID,
          ereignis.updated_at,
          'practice_request',
          null,
          null,
        ),
      );
    });
  });

  describe('CAL-004: Abschliessen und Wiederoeffnen', () => {
    /** Derselbe Termin, aber bereits abgeschlossen. */
    const abgeschlossen: AppointmentsApi.Appointment = {
      ...praxistermin,
      status: 'completed',
      updated_at: '2027-05-12T08:05:00.000000+00',
      completed_at: '2027-05-12T08:05:00.000Z',
    };

    it('schliesst einen geplanten Termin auf dem gelesenen Stand ab', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      await waitFor(() =>
        expect(completeAppointment).toHaveBeenCalledWith(TERMIN_ID, praxistermin.updated_at),
      );
    });

    it('gibt dem Büro „Termin abschließen“ als Hauptknopf mit seiner Folge (BEF-055)', async () => {
      rendern(['office']);
      const abschluss = await screen.findByRole('group', { name: 'Abschluss' });
      const knopf = within(abschluss).getByRole('button', { name: 'Termin abschließen' });
      expect(knopf).toHaveClass('bg-accent');
      expect(within(abschluss).getByText('Der Termin gilt damit als durchgeführt.')).toBeVisible();
      expect(within(abschluss).queryByRole('link', { name: 'Doku schreiben' })).toBeNull();
    });

    it('stellt für Behandelnde „Doku“ als einzigen Hauptknopf vor die Zeilen; „Nur Termin abschließen“ schließt ab (BEF-055)', async () => {
      const user = userEvent.setup();
      rendern(['therapist']);
      const abschluss = await screen.findByRole('group', { name: 'Abschluss' });
      const doku = within(abschluss).getByRole('link', { name: 'Doku schreiben' });
      expect(doku).toHaveClass('bg-accent');
      // Ein Hauptknopf je Ansicht.
      const dialog = abschluss.closest('[role="dialog"]') ?? document.body;
      expect(
        Array.from(dialog.querySelectorAll('a.bg-accent, button.bg-accent')).filter(
          (el) => !el.closest('details:not([open])'),
        ),
      ).toEqual([doku]);
      // Der Abschluss steht vor den Detailzeilen.
      const zeilen = screen.getByText('Verordnung', { selector: 'dt, span, p, h3' });
      expect(
        abschluss.compareDocumentPosition(zeilen) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      await user.click(
        within(abschluss).getByText('Nur Termin abschließen', { selector: 'summary' }),
      );
      await user.click(within(abschluss).getByRole('button', { name: 'Nur Termin abschließen' }));
      await waitFor(() =>
        expect(completeAppointment).toHaveBeenCalledWith(TERMIN_ID, praxistermin.updated_at),
      );
      expect(await screen.findByText('Termin abgeschlossen. Doku offen.')).toBeInTheDocument();
    });

    it('fragt beim Abschliessen nicht nach einer Behandlungsdokumentation', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');
      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      await waitFor(() => expect(completeAppointment).toHaveBeenCalled());
      // Kein Zwischenschritt, keine Rueckfrage nach Inhalten. Am offenen
      // Termin ohne Eintrag steht fuer office seit UX-005g auch kein leerer
      // Abschnitt "Behandlungsdokumentation" mehr - nirgends ein Wort davon.
      expect(screen.queryByRole('heading', { name: 'Dokumentation' })).toBeNull();
      expect(screen.queryAllByText(/dokumentation/i)).toEqual([]);
    });

    it('zeigt die Meldung, wenn der Abschluss abgewiesen wird', async () => {
      completeAppointment.mockRejectedValue(
        new Error('Der Termin konnte nicht abgeschlossen werden.'),
      );
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      expect(
        await screen.findByText('Der Termin konnte nicht abgeschlossen werden.'),
      ).toBeInTheDocument();
    });

    it('markiert einen abgeschlossenen Termin nicht als unvollstaendig', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      rendern();
      await screen.findByText('Berta Bestand');

      expect(zeile('Status')).toBe('Abgeschlossen');
      expect(screen.queryByText(/fehlt|unvollständig|ausstehend/i)).not.toBeInTheDocument();
    });

    it('zeigt den Abschlusszeitpunkt in der Praxiszeitzone', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      rendern();
      await screen.findByText('Berta Bestand');

      // 08:05 UTC entspricht 10:05 Ortszeit in Europe/Berlin (Sommerzeit).
      expect(zeile('Abgeschlossen am')).toMatch(/12\. Mai 2027, 10:05 Uhr/);
    });

    it('bietet am abgeschlossenen Termin weder Bearbeiten noch Absagen an', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      rendern();
      await screen.findByText('Berta Bestand');

      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin abschließen' })).not.toBeInTheDocument();
    });

    it('oeffnet einen abgeschlossenen Termin wieder', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin wieder öffnen' }));

      await waitFor(() =>
        expect(reopenAppointment).toHaveBeenCalledWith(TERMIN_ID, abgeschlossen.updated_at),
      );
    });

    it('bietet am abgesagten Termin kein Abschliessen an', async () => {
      fetchAppointment.mockResolvedValue({ ...praxistermin, status: 'cancelled' });
      rendern();
      await screen.findByText('Berta Bestand');

      expect(screen.queryByRole('button', { name: 'Termin abschließen' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Termin wieder öffnen' }),
      ).not.toBeInTheDocument();
    });

    it('bietet einem Patientenkonto keine Statusaktion an', async () => {
      rendern(['patient']);
      await screen.findByText('Berta Bestand');

      expect(screen.queryByRole('button', { name: 'Termin abschließen' })).not.toBeInTheDocument();
    });
  });

  // Der Name ist der Titel des Fensters; der Weg in die Akte steht im
  // Terminpanel (Akte entschlacken, 2026-10-03).
  it('trägt den Namen als Titel des Fensters', async () => {
    rendern();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Berta Bestand' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Berta Bestand' })).toBeInTheDocument();
  });

  it('zeigt keine klinischen Angaben', async () => {
    rendern();
    await screen.findByText('Berta Bestand');

    for (const begriff of [/diagnose/i, /befund/i, /therapie/i, /anamnese/i]) {
      expect(screen.queryByText(begriff)).not.toBeInTheDocument();
    }
  });

  // PRX-011: Verordnung ohne Papier - das Foto am Termin.
  it('bietet am Behandlungstermin das Foto der Verordnung an', async () => {
    rendern(['therapist']);
    await screen.findByText('Berta Bestand');
    expect(screen.getByRole('heading', { name: 'Verordnung' })).toBeInTheDocument();
    expect(screen.getByText(/das Büro erfasst die Grundlage daraus/)).toBeInTheDocument();
  });

  it('bietet das Foto nicht am abgesagten Termin an', async () => {
    fetchAppointment.mockResolvedValue({ ...praxistermin, status: 'cancelled' });
    rendern(['therapist']);
    await screen.findByText('Berta Bestand');
    expect(screen.queryByText(/das Büro erfasst die Grundlage daraus/)).not.toBeInTheDocument();
  });

  it('meldet einen nicht freigegebenen Termin ohne Details', async () => {
    fetchAppointment.mockResolvedValue(null);
    rendern();

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.queryByText('Anna Beispiel')).not.toBeInTheDocument();
  });

  describe('Behandlungsdokumentation (DOK-001)', () => {
    it('bietet therapeutischen Rollen den Weg zur Dokumentation an', async () => {
      rendern(['therapist']);

      // Am offenen Termin steht „Doku" neben dem Haken; ein zweites im
      // Abschnitt gibt es nicht (DOK-14).
      expect(await screen.findByRole('link', { name: 'Doku schreiben' })).toHaveAttribute(
        'href',
        expect.stringContaining(`/termine/${TERMIN_ID}/abschluss`),
      );
      expect(screen.getAllByRole('link', { name: 'Doku schreiben' })).toHaveLength(1);
    });

    it('liest office den Eintrag, ohne Weg zum Dokumentieren (E15)', async () => {
      rendern(['office']);
      await screen.findByText('Berta Bestand');

      // Gelesen wird (E15); ohne Eintrag steht am offenen Termin aber kein
      // leerer Abschnitt (UX-005g), und einen Weg zum Anlegen gibt es nicht.
      await waitFor(() => expect(fetchTreatmentDocumentation).toHaveBeenCalledWith(TERMIN_ID));
      expect(screen.queryByRole('heading', { name: 'Behandlungsdokumentation' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Dokumentation anlegen' })).toBeNull();
    });
  });

  describe('UX-002/UX-003: Anfahrt und Folgetermin', () => {
    const hausbesuch: AppointmentsApi.Appointment = {
      ...praxistermin,
      appointment_type: 'home_visit',
      location_id: null,
      location_name: null,
      visit_street: 'Beispielstrasse',
      visit_house_number: '12',
      visit_postal_code: '72070',
      visit_city: 'Tuebingen',
    };

    it('bietet am Hausbesuch die Navigation an - erst auf Aktion', async () => {
      // Seit BEF-030 entsteht ein Verweis im Klickhandler statt eines
      // `window.open`; geprueft wird deshalb sein Ziel.
      const ziele: string[] = [];
      const klick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        ziele.push(this.href);
      });
      fetchAppointment.mockResolvedValue(hausbesuch);
      const { container } = rendern();

      const knopf = await screen.findByRole('button', { name: 'Navigation starten' });
      expect(container.innerHTML).not.toContain('google.com');

      await userEvent.click(knopf);
      expect(ziele[0]).toContain('travelmode=bicycling');
      klick.mockRestore();
    });

    it('bietet am Praxistermin keine Navigation an', async () => {
      rendern();
      await screen.findByText('Hauptstandort Tuebingen');
      expect(screen.queryByRole('button', { name: 'Navigation starten' })).toBeNull();
    });

    it('fuehrt vom Termin mit einer Woche Versatz in ein vorbelegtes Formular', async () => {
      fetchAppointment.mockResolvedValue(hausbesuch);
      rendern();

      const link = await screen.findByRole('link', { name: 'Folgetermin anlegen' });
      expect(link).toHaveAttribute(
        'href',
        `/patienten/${PATIENT_ID}/termine/neu?datum=2027-05-19&beginn=09%3A00&ende=10%3A00&art=home_visit&person=55555555-5555-4555-8555-000000000002&zurueck=${encodeURIComponent(
          `${KALENDER}&termin=${TERMIN_ID}`,
        )}`,
      );
    });

    it('bietet den Folgetermin auch am abgeschlossenen Termin an', async () => {
      fetchAppointment.mockResolvedValue({
        ...hausbesuch,
        status: 'completed',
        completed_at: '2027-05-12T08:05:00.000Z',
      });
      rendern();
      expect(await screen.findByRole('link', { name: 'Folgetermin anlegen' })).toBeInTheDocument();
    });

    it('bietet den Folgetermin am abgesagten Termin nicht an', async () => {
      fetchAppointment.mockResolvedValue({ ...hausbesuch, status: 'cancelled' });
      rendern();
      await screen.findByText(/Eine Absage wird nicht zurückgenommen/);
      expect(screen.queryByRole('link', { name: 'Folgetermin anlegen' })).toBeNull();
    });

    it('bietet einem Patientenkonto keinen Folgetermin an', async () => {
      fetchAppointment.mockResolvedValue(hausbesuch);
      rendern(['patient']);
      await screen.findByText('Beispielstrasse 12');
      expect(screen.queryByRole('link', { name: 'Folgetermin anlegen' })).toBeNull();
    });
  });
  /**
   * Dauerfehlzeit (CAL-021).
   *
   * Die dritte Absage neben „Nur diese Teilnahme" und „Fehlzeit absagen" -
   * und die Zeile, die überhaupt erst erklärt, warum sie da ist.
   */
  describe('CAL-021: Vorkommen einer Dauerfehlzeit', () => {
    const GRUPPE = '88888888-8888-4888-8888-000000000001';
    const SERIE = '99999999-9999-4999-8999-000000000001';

    const fehlzeit: AppointmentsApi.Appointment = {
      ...praxistermin,
      kind: 'internal',
      title: 'Teammeeting',
      event_group_id: GRUPPE,
      event_series_id: SERIE,
      patient_id: null,
      patient_given_name: null,
      patient_family_name: null,
    };

    const vorkommen: AppointmentsApi.EventSeriesOccurrence[] = [
      {
        event_group_id: GRUPPE,
        title: 'Teammeeting',
        starts_at: praxistermin.starts_at,
        ends_at: praxistermin.ends_at,
        open_count: 1,
        cancelled_count: 0,
        series_updated_at: praxistermin.updated_at,
      },
      {
        event_group_id: '88888888-8888-4888-8888-000000000002',
        title: 'Teammeeting',
        starts_at: '2027-05-19T07:00:00.000Z',
        ends_at: '2027-05-19T08:00:00.000Z',
        open_count: 1,
        cancelled_count: 0,
        series_updated_at: praxistermin.updated_at,
      },
    ];

    it('sagt, dass dieses Vorkommen eines von mehreren ist', async () => {
      fetchAppointment.mockResolvedValue(fehlzeit);
      fetchEventSeries.mockResolvedValue(vorkommen);
      rendern();

      await screen.findByRole('heading', { name: /Teammeeting/ });
      expect(await screen.findByText('Dauerfehlzeit')).toBeInTheDocument();
      expect(zeile('Dauerfehlzeit')).toContain('Vorkommen 1 von 2');
    });

    it('sagt die ganze Serie auf dem Stand der SERIE ab', async () => {
      const user = userEvent.setup();
      fetchAppointment.mockResolvedValue(fehlzeit);
      fetchEventSeries.mockResolvedValue(vorkommen);
      rendern();

      await user.click(await screen.findByRole('button', { name: 'Ganze Serie absagen' }));
      await user.selectOptions(await screen.findByLabelText('Absagegrund'), 'practice_request');
      await user.click(screen.getByRole('button', { name: 'Ja, ganze Serie absagen' }));

      await waitFor(() =>
        expect(cancelEventSeries).toHaveBeenCalledWith(
          SERIE,
          praxistermin.updated_at,
          'practice_request',
        ),
      );
      // Die Absage dieses einen Vorkommens bleibt davon unberührt.
      expect(cancelAppointmentEvent).not.toHaveBeenCalled();
    });

    it('bietet die Serienabsage ohne Serie nicht an', async () => {
      fetchAppointment.mockResolvedValue({ ...fehlzeit, event_series_id: null });
      rendern();

      await screen.findByRole('heading', { name: /Teammeeting/ });
      await screen.findByRole('button', { name: 'Nur diese Teilnahme absagen' });
      expect(screen.queryByRole('button', { name: 'Ganze Serie absagen' })).not.toBeInTheDocument();
      expect(screen.queryByText('Dauerfehlzeit')).not.toBeInTheDocument();
    });

    it('bietet die Serienabsage nicht an, wenn nichts mehr kommt', async () => {
      fetchAppointment.mockResolvedValue(fehlzeit);
      fetchEventSeries.mockResolvedValue(
        vorkommen.map((v) => ({ ...v, open_count: 0, cancelled_count: 1 })),
      );
      rendern();

      await screen.findByRole('heading', { name: /Teammeeting/ });
      await screen.findByText('Dauerfehlzeit');
      expect(screen.queryByRole('button', { name: 'Ganze Serie absagen' })).not.toBeInTheDocument();
    });
  });

  /**
   * UXR-005: Nach einem Vorgang sagt die Seite, dass er geklappt hat - oben,
   * wo man danach hinsieht, und mit dem Fokus dort (ZST-16, TER-17). Der
   * Knopf, der den Fokus hatte, ist nach dem Vorgang meist fort.
   */
  describe('Bestätigung nach Vorgängen (ZST-16, TER-17)', () => {
    /** Die fokussierbare Zeile um eine Bestätigung. */
    function zeileUm(text: HTMLElement): HTMLElement | null {
      return text.closest('[tabindex="-1"]');
    }

    it('bestätigt eine Absage oben und nimmt den Fokus dorthin', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.selectOptions(screen.getByLabelText('Absagegrund'), 'practice_request');
      await user.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));

      const meldung = await screen.findByText('Termin abgesagt.');
      expect(meldung).toHaveAttribute('role', 'status');
      expect(zeileUm(meldung)).toHaveFocus();
    });

    it('bestätigt den Abschluss und nimmt den Fokus dorthin', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      expect(zeileUm(await screen.findByText('Termin abgeschlossen.'))).toHaveFocus();
    });

    /**
     * ZST-B01: Die Bestätigung folgt dem Server, nicht dem Nachladen. Hängt
     * das Nachladen im Funkloch, stand bisher sekundenlang „Wird abgeschlossen …"
     * da, obwohl der Vorgang längst gespeichert war.
     */
    it('wartet mit der Bestätigung nicht auf das Nachladen', async () => {
      fetchAppointment.mockResolvedValueOnce(praxistermin);
      fetchAppointment.mockImplementation(() => new Promise(() => undefined));
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');

      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      expect(await screen.findByText(/^Termin abgeschlossen\./)).toBeInTheDocument();
    });

    it('nennt nach einer kurzfristigen Absage das vorgemerkte Ausfallhonorar (BEF-079)', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Berta Bestand');
      // Nach der Absage liefert der Server den Termin mit Honoraranlass.
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'cancelled',
        fee_basis: 'late_cancellation',
      });

      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.selectOptions(screen.getByLabelText('Absagegrund'), 'patient_request');
      await user.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));

      expect(
        await screen.findByText(
          'Termin abgesagt · Ausfallhonorar vorgemerkt: Absage weniger als 24 Stunden vorher.',
        ),
      ).toBeInTheDocument();
    });

    it('bestätigt das Nichtantreffen am Hausbesuch samt Honorar', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        appointment_type: 'home_visit',
        location_id: null,
        location_name: null,
        visit_street: 'Testweg',
        visit_house_number: '7',
        visit_postal_code: '72072',
        visit_city: 'Tuebingen',
      });
      const user = userEvent.setup();
      rendern(['therapist']);

      await user.click(await screen.findByRole('button', { name: 'Niemand öffnet?' }));
      for (const schritt of [
        'An der Tür geklingelt',
        '15 Minuten vor Ort gewartet',
        'Telefonisch angerufen',
      ]) {
        await user.click(screen.getByLabelText(schritt));
      }
      await user.click(screen.getByRole('button', { name: 'Als „nicht angetroffen“ vermerken' }));

      expect(
        await screen.findByText(
          'Als „nicht angetroffen“ vermerkt – das Ausfallhonorar ist vorgemerkt.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Rückweg, Zustände und Wege (TER-03, TER-15, TER-16, UIK-16)', () => {
    it('meldet einen Ladefehler mit Titel und neuem Versuch', async () => {
      fetchAppointment.mockRejectedValueOnce(new Error('Netz weg'));
      const user = userEvent.setup();
      rendern();

      expect(
        await screen.findByText('Der Termin konnte nicht geladen werden.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Termin' })).toBeInTheDocument();
      expect(screen.getByText('Bitte die Verbindung prüfen und erneut versuchen.')).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
      expect(await screen.findByText('Berta Bestand')).toBeInTheDocument();
    });

    it('bietet am ungedeckten Termin den Weg zum Übertragen an', async () => {
      fetchAppointment.mockResolvedValue({ ...praxistermin, treatment_basis_covered: false });
      rendern();

      expect(
        await screen.findByRole('link', { name: 'Auf andere Grundlage übertragen' }),
      ).toHaveAttribute(
        'href',
        `/patienten/${PATIENT_ID}/termine-uebertragen?zurueck=${encodeURIComponent(`${KALENDER}&termin=${TERMIN_ID}`)}`,
      );
    });

    it('setzt „Bearbeiten" als kompakten Sekundärknopf des Systems', async () => {
      rendern();

      const bearbeiten = await screen.findByRole('link', { name: 'Bearbeiten' });
      // Hauptfarbe, 700 - wie jeder andere Sekundärknopf (TER-16, UIK-14).
      expect(bearbeiten).toHaveClass('text-accent', 'font-bold', 'min-h-11');
      expect(bearbeiten).not.toHaveClass('text-ink', 'font-medium');
    });

    // UX-005a: Die Fußnote ist fort - keine Zeitzone, keine Kennzeichnung.
    // Was die Navigation übergibt, steht an ihrer Schaltfläche (ADR-019
    // Punkt 23), und die Zeitzone erscheint nirgends als technische Kennung.
    it('kommt ohne Fußnote und ohne technische Zeitzonenkennung aus', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        appointment_type: 'home_visit',
        location_id: null,
        location_name: null,
        visit_street: 'Beispielstrasse',
        visit_house_number: '12',
        visit_postal_code: '72070',
        visit_city: 'Tuebingen',
      });
      rendern();
      await screen.findByText('Beispielstrasse 12');

      expect(screen.queryByText(/Zeiten gelten in der Zeitzone/)).not.toBeInTheDocument();
      expect(screen.queryByText(/ausschließlich organisatorische Angaben/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Europe\/Berlin/)).not.toBeInTheDocument();
      // Der Satz zur Übergabe steht am Fuß der Kachel, unter „Navigation
      // starten" - nicht mehr im Wert (Design-Handoff 2026-10-01).
      const kachel = screen.getAllByText('Anschrift').find((el) => el.tagName === 'DT')!;
      expect(kachel.parentElement?.textContent).toMatch(/übergibt nur die Anschrift ohne Namen/);
    });
  });

  // UI-Redesign Schritt 4 (Design-Handoff 2026-10-01, Abschnitt 6): Maße und
  // Anordnung neu, der Ablauf aus UX-EPIC-005 bleibt.
  describe('Anordnung nach dem Design-Handoff (Abschnitt 6)', () => {
    it('trägt den Namen als Titel, ohne Zeile darüber (Zyklus 3)', async () => {
      fetchAppointment.mockResolvedValue(praxistermin);
      rendern();

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Berta Bestand' }),
      ).toBeInTheDocument();
      // Kicker und Kacheln sind der Metazeile gewichen.
      expect(screen.queryByText('Termin', { selector: 'p' })).toBeNull();
    });

    it('stellt die Handlungen in die Auswahl und die Absage ans Ende', async () => {
      fetchAppointment.mockResolvedValue(praxistermin);
      rendern(['owner']);

      const auswahl = await screen.findByRole('group', { name: 'Aktionen' });
      // Der Abschluss steht seit BEF-055 als eigene Gruppe vor den Zeilen.
      expect(
        within(screen.getByRole('group', { name: 'Abschluss' })).getByRole('button', {
          name: 'Nicht angetroffen',
        }),
      ).toBeInTheDocument();
      expect(within(auswahl).getByRole('link', { name: 'Bearbeiten' })).toBeInTheDocument();
      // Die Absage steht nicht in der Auswahl, sondern als letzter Knopf vor
      // „Schließen".
      expect(within(auswahl).queryByRole('button', { name: 'Termin absagen' })).toBeNull();
      const knoepfe = screen.getAllByRole('button');
      expect(knoepfe.at(-1)).toHaveTextContent('Schließen');
      expect(knoepfe.at(-2)).toHaveTextContent('Termin absagen');
    });

    it('stellt den Vermerk als Zeilen und „Termin wieder öffnen" darunter', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'no_show',
        no_show_recorded_at: '2027-05-12T08:05:00.000Z',
        fee_basis: 'no_show',
      });
      rendern();

      expect(await screen.findByText('Ausfallhonorar vorgemerkt')).toBeInTheDocument();
      expect(zeile('Vermerkt am')).toMatch(/2027/);
      expect(screen.getByRole('button', { name: 'Termin wieder öffnen' })).toBeVisible();
      expect(screen.queryByRole('group', { name: 'Nach dem Termin' })).toBeNull();
    });

    it('trägt an einer Fehlzeit ihre Bezeichnung als Titel', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        kind: 'internal',
        patient_id: null,
        title: 'Teambesprechung',
      });
      fetchEventParticipants.mockResolvedValue([]);
      rendern();

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Teambesprechung' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nicht angetroffen' })).toBeNull();
    });
  });
});
