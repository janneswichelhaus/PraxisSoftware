import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as RouterModul from 'react-router-dom';
import type * as DokumentationApi from '@/features/documentation/api';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

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
    recordNoShow: (id: string, erwartet: string) => recordNoShow(id, erwartet) as Promise<void>,
    fetchEventParticipants: (gruppe: string) =>
      fetchEventParticipants(gruppe) as Promise<AppointmentsApi.EventParticipant[]>,
    cancelAppointmentEvent: (
      gruppe: string,
      erwartet: string,
      grund: AppointmentsApi.CancellationReason,
    ) => cancelAppointmentEvent(gruppe, erwartet, grund) as Promise<number>,
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

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useParams: () => ({ appointmentId: TERMIN_ID }),
}));

const { AppointmentDetailPage } = await import('./AppointmentDetailPage');

function rendern(rollen: Parameters<typeof testUser>[0] = ['office']) {
  return renderWithProviders(
    <AppointmentDetailPage user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}`,
  );
}

/** Liest den Wert einer Datenzeile ueber ihre Beschriftung. */
function zeile(beschriftung: string): string {
  const dt = screen.getAllByText(beschriftung).find((el) => el.tagName === 'DT');
  if (!dt) throw new Error(`Datenzeile "${beschriftung}" nicht gefunden.`);
  return dt.nextElementSibling?.textContent?.trim() ?? '';
}

describe('AppointmentDetailPage', () => {
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
    fetchTreatmentDocumentation.mockReset();
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
  });

  it('zeigt Patient, behandelnde Person, Art und Status', async () => {
    rendern();
    expect(await screen.findByText('Anna Beispiel')).toBeInTheDocument();
    expect(screen.getAllByText('Berta Bestand').length).toBeGreaterThan(0);
    expect(zeile('Art')).toBe('Praxis');
    expect(zeile('Status')).toBe('Bestätigt');
  });

  it('zeigt Datum und Zeit in der Praxiszeitzone, nicht in UTC', async () => {
    rendern();
    // 07:00 UTC entspricht 09:00 Ortszeit in Europe/Berlin (Sommerzeit).
    expect(await screen.findByText('09:00–10:00 Uhr')).toBeInTheDocument();
    expect(zeile('Zeit')).toBe('09:00–10:00 Uhr');
    expect(zeile('Datum')).toMatch(/12\. Mai 2027/);
  });

  it('zeigt beim Praxistermin den Standort', async () => {
    rendern();
    await screen.findByText('Anna Beispiel');
    expect(zeile('Standort')).toBe('Hauptstandort Tuebingen');
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

    await screen.findByText('Anna Beispiel');
    expect(zeile('Anschrift')).toBe('Altstrasse 1, 72070 Tuebingen');
  });

  it('zeigt beim Videotermin keinen Ort und den Hinweis zum fehlenden Link', async () => {
    fetchAppointment.mockResolvedValue({
      ...praxistermin,
      appointment_type: 'video',
      location_id: null,
      location_name: null,
    });
    rendern();

    await screen.findByText('Anna Beispiel');
    expect(zeile('Ort')).toBe('Videotermin');
    expect(screen.getByText(/noch kein Videolink erzeugt/)).toBeInTheDocument();
  });

  it('kennzeichnet einen abgesagten Termin', async () => {
    fetchAppointment.mockResolvedValue({ ...praxistermin, status: 'cancelled' });
    rendern();

    expect(await screen.findByText(/Dieser Termin ist abgesagt\./)).toBeInTheDocument();
    expect(zeile('Status')).toBe('Abgesagt');
  });

  it('zeigt den Absagegrund als Wort, nicht als Schluessel (CAL-008b)', async () => {
    fetchAppointment.mockResolvedValue({
      ...praxistermin,
      status: 'cancelled',
      cancellation_reason: 'practice_request',
    });
    rendern();

    await screen.findByText(/Dieser Termin ist abgesagt\./);
    expect(zeile('Absagegrund')).toBe('Praxis hat abgesagt');
  });

  it('nennt eine Absage aus der Zeit vor dem Pflichtgrund "Nicht erfasst"', async () => {
    fetchAppointment.mockResolvedValue({
      ...praxistermin,
      status: 'cancelled',
      cancellation_reason: null,
    });
    rendern();

    await screen.findByText(/Dieser Termin ist abgesagt\./);
    expect(zeile('Absagegrund')).toBe('Nicht erfasst');
  });

  describe('Aktionen (CAL-003)', () => {
    it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
      'bietet %s Bearbeiten und Absagen an',
      async (rolle) => {
        rendern([rolle]);
        await screen.findByText('Anna Beispiel');

        // Ohne eigenen Rueckweg bleibt die Adresse schlicht: Die Bearbeitung
        // kehrt ohnehin zum Termin zurueck (UX-012).
        expect(screen.getByRole('link', { name: 'Bearbeiten' })).toHaveAttribute(
          'href',
          `/termine/${TERMIN_ID}/bearbeiten`,
        );
        expect(screen.getByRole('button', { name: 'Termin absagen' })).toBeInTheDocument();
      },
    );

    it('blendet beide Aktionen fuer ein Patientenkonto aus', async () => {
      rendern(['patient']);
      await screen.findByText('Anna Beispiel');

      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
    });

    it('bietet bei einem abgesagten Termin keine Aktionen mehr an', async () => {
      fetchAppointment.mockResolvedValue({ ...praxistermin, status: 'cancelled' });
      rendern();
      await screen.findByText(/Dieser Termin ist abgesagt\./);

      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
    });

    it('sagt nicht auf einen einzelnen Klick hin ab, sondern fragt zurueck', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');

      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));

      expect(cancelAppointment).not.toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: 'Ja, Termin absagen' })).toBeInTheDocument();
    });

    it('nennt in der Rueckfrage den betroffenen Termin und vermeidet Loeschsprache', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
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
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Ja, Termin absagen' })).toHaveFocus(),
      );
    });

    it('gibt den Fokus beim Abbrechen zurueck', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Termin absagen' })).toHaveFocus(),
      );
      expect(cancelAppointment).not.toHaveBeenCalled();
    });

    it('sagt nach Bestaetigung mit dem gelesenen Stand und dem Grund ab', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
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
    });

    it('sagt ohne ausgewaehlten Grund nicht ab (CAL-008b)', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
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
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin absagen' }));
      await user.selectOptions(screen.getByLabelText('Absagegrund'), 'moved');

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
      await screen.findByText('Anna Beispiel');
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
      await screen.findByText('Anna Beispiel');

      await user.click(screen.getByRole('button', { name: 'Nicht angetroffen' }));

      // Bis ADR-018 Fassung 1 stand hier eine Pflichtauswahl. Jannes hat das
      // am 2026-09-12 geaendert: Das Abhaken vor der Tuer verlangt keine
      // Entscheidung, fuer die es noch keine Regel gibt (E14).
      expect(screen.queryByLabelText('Ausfallhonorar berechnen?')).not.toBeInTheDocument();
      expect(screen.getByText(/Eine Gebühr entsteht daraus nicht/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Ja, niemand angetroffen' }));

      await waitFor(() =>
        expect(recordNoShow).toHaveBeenCalledWith(TERMIN_ID, praxistermin.updated_at),
      );
    });

    it('sagt im Vermerk, dass es keine Behandlung war', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');

      await user.click(screen.getByRole('button', { name: 'Nicht angetroffen' }));

      expect(
        screen.getByText(/keine durchgeführte Behandlung, keine Dokumentation/),
      ).toBeInTheDocument();
    });

    it('zeigt am vermerkten Termin Zustand und den Weg zurueck - ohne Gebuehrenzeile', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'no_show',
        no_show_recorded_at: '2027-05-12T08:05:00.000Z',
      });
      rendern();

      await screen.findByText(/Hier wurde niemand angetroffen/);
      expect(zeile('Status')).toBe('Nicht angetroffen');
      expect(screen.queryByText('Gebühr vorgemerkt')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Termin wieder öffnen' })).toBeInTheDocument();
    });

    it('bietet am vermerkten Termin kein zweites Vermerken und kein Absagen an', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'no_show',
        no_show_recorded_at: '2027-05-12T08:05:00.000Z',
      });
      rendern();

      await screen.findByText(/Hier wurde niemand angetroffen/);
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

      await screen.findByText(/Hier wurde niemand angetroffen/);
      expect(zeile('Gebühr vorgemerkt')).toMatch(/Nicht angetroffen/);
    });
  });

  describe('CAL-014c: Absage mit Eingang und Gebuehrenanlass', () => {
    it('sagt mit Grund ab und ueberlaesst den Eingang dem Server', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');

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
      await screen.findByText('Anna Beispiel');

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
      await screen.findByText('Anna Beispiel');

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
     * Ergebnis und nennt ausdruecklich keinen Betrag - der Leistungskatalog
     * (ABR-001) ist nicht gebaut, und eine Zahl hier waere erfunden.
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

      await screen.findByText(/Dieser Termin ist abgesagt/);
      expect(zeile('Status')).toBe('Abgesagt');
      expect(zeile('Absagegrund')).toBe('Patient:in hat abgesagt');
      expect(zeile('Gebühr vorgemerkt')).toMatch(/weniger als 24 Stunden/);
      expect(screen.getByText(/Höhe und Abrechnung stehen noch aus/)).toBeInTheDocument();
    });

    it('nennt bei einer Absage ohne Gebuehr keine Gebuehrenzeile', async () => {
      fetchAppointment.mockResolvedValue({
        ...praxistermin,
        status: 'cancelled',
        cancellation_reason: 'practice_request',
        cancellation_received_at: '2027-05-12T05:00:00.000Z',
      });
      rendern();

      await screen.findByText(/Dieser Termin ist abgesagt/);
      expect(screen.queryByText('Gebühr vorgemerkt')).not.toBeInTheDocument();
    });
  });

  describe('CAL-015b: Ereignis des Praxisbetriebs', () => {
    const GRUPPE = '88888888-8888-4888-8888-000000000001';

    const ereignis: AppointmentsApi.Appointment = {
      ...praxistermin,
      kind: 'event',
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
      expect(zeile('Ereignis')).toBe('Teambesprechung');
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
      expect(screen.getByRole('link', { name: 'Ereignis bearbeiten' })).toBeInTheDocument();
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
      expect(screen.queryByText(/Ausfallgebühr vor/)).not.toBeInTheDocument();
      expect(screen.getByText(/löst keine Ausfallgebühr aus/)).toBeInTheDocument();
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
      // Das Ereignis selbst bleibt stehen - genau das unterscheidet die
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
      expect(await screen.findByText(/Anna Beispiel, Tim Teamleitung/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ereignis absagen' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Nur diese Teilnahme absagen' }),
      ).toBeInTheDocument();
    });

    it('sagt das ganze Ereignis auf dem Stand der Gruppe ab', async () => {
      const user = userEvent.setup();
      fetchAppointment.mockResolvedValue(ereignis);
      fetchEventParticipants.mockResolvedValue(zweiBeteiligte);
      rendern();

      await screen.findByRole('button', { name: 'Ereignis absagen' });
      await user.click(screen.getByRole('button', { name: 'Ereignis absagen' }));
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
      expect(screen.queryByRole('button', { name: 'Ereignis absagen' })).not.toBeInTheDocument();
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
      await screen.findByText('Anna Beispiel');

      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      await waitFor(() =>
        expect(completeAppointment).toHaveBeenCalledWith(TERMIN_ID, praxistermin.updated_at),
      );
    });

    it('fragt beim Abschliessen nicht nach einer Behandlungsdokumentation', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');
      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      await waitFor(() => expect(completeAppointment).toHaveBeenCalled());
      // Kein Zwischenschritt, keine Rueckfrage nach Inhalten.
      expect(screen.queryByText(/dokumentation/i)).not.toBeInTheDocument();
    });

    it('markiert einen abgeschlossenen Termin nicht als unvollstaendig', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      rendern();
      await screen.findByText('Anna Beispiel');

      expect(zeile('Status')).toBe('Abgeschlossen');
      expect(screen.queryByText(/fehlt|unvollständig|ausstehend/i)).not.toBeInTheDocument();
    });

    it('zeigt den Abschlusszeitpunkt in der Praxiszeitzone', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      rendern();
      await screen.findByText('Anna Beispiel');

      // 08:05 UTC entspricht 10:05 Ortszeit in Europe/Berlin (Sommerzeit).
      expect(zeile('Abgeschlossen am')).toMatch(/12\. Mai 2027, 10:05 Uhr/);
    });

    it('bietet am abgeschlossenen Termin weder Bearbeiten noch Absagen an', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      rendern();
      await screen.findByText('Anna Beispiel');

      expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Termin abschließen' })).not.toBeInTheDocument();
    });

    it('oeffnet einen abgeschlossenen Termin wieder', async () => {
      fetchAppointment.mockResolvedValue(abgeschlossen);
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');

      await user.click(screen.getByRole('button', { name: 'Termin wieder öffnen' }));

      await waitFor(() =>
        expect(reopenAppointment).toHaveBeenCalledWith(TERMIN_ID, abgeschlossen.updated_at),
      );
    });

    it('bietet am abgesagten Termin kein Abschliessen an', async () => {
      fetchAppointment.mockResolvedValue({ ...praxistermin, status: 'cancelled' });
      rendern();
      await screen.findByText('Anna Beispiel');

      expect(screen.queryByRole('button', { name: 'Termin abschließen' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Termin wieder öffnen' }),
      ).not.toBeInTheDocument();
    });

    it('bietet einem Patientenkonto keine Statusaktion an', async () => {
      rendern(['patient']);
      await screen.findByText('Anna Beispiel');

      expect(screen.queryByRole('button', { name: 'Termin abschließen' })).not.toBeInTheDocument();
    });

    it('zeigt die Meldung, wenn der Abschluss abgewiesen wird', async () => {
      completeAppointment.mockRejectedValue(
        new Error('Der Termin konnte nicht abgeschlossen werden.'),
      );
      const user = userEvent.setup();
      rendern();
      await screen.findByText('Anna Beispiel');

      await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

      expect(
        await screen.findByText('Der Termin konnte nicht abgeschlossen werden.'),
      ).toBeInTheDocument();
    });
  });

  // UX-012: Der Name im Kopf ist der Weg in die Akte - und er nimmt den Weg
  // zurueck zu diesem Termin mit.
  it('verlinkt den Namen im Kopf in die Patientenakte, mit Rueckweg zum Termin', async () => {
    rendern();
    const link = await screen.findByRole('link', { name: 'Berta Bestand' });
    expect(link).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}?zurueck=${encodeURIComponent(`/termine/${TERMIN_ID}`)}`,
    );
  });

  it('fuehrt den Namen nur einmal als Link - die Zeile darunter bleibt Text', async () => {
    rendern();
    await screen.findByText('Anna Beispiel');

    expect(screen.getAllByRole('link', { name: 'Berta Bestand' })).toHaveLength(1);
  });

  it('zeigt keine klinischen Angaben', async () => {
    rendern();
    await screen.findByText('Anna Beispiel');

    for (const begriff of [/diagnose/i, /befund/i, /therapie/i, /anamnese/i]) {
      expect(screen.queryByText(begriff)).not.toBeInTheDocument();
    }
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

      expect(await screen.findByText('Behandlungsdokumentation')).toBeInTheDocument();
      expect(await screen.findByRole('link', { name: 'Dokumentation anlegen' })).toHaveAttribute(
        'href',
        `/termine/${TERMIN_ID}/dokumentation`,
      );
    });

    it('zeigt office den Abschnitt gar nicht und fragt ihn nicht ab (4.3)', async () => {
      rendern(['office']);
      await screen.findByText('Anna Beispiel');

      expect(screen.queryByText('Behandlungsdokumentation')).toBeNull();
      expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
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
      const oeffnen = vi.spyOn(window, 'open').mockReturnValue(null);
      fetchAppointment.mockResolvedValue(hausbesuch);
      const { container } = rendern();

      const knopf = await screen.findByRole('button', { name: 'Navigation starten' });
      expect(container.innerHTML).not.toContain('google.com');

      await userEvent.click(knopf);
      expect(String(oeffnen.mock.calls[0]![0])).toContain('travelmode=bicycling');
      oeffnen.mockRestore();
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
          `/termine/${TERMIN_ID}`,
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
      await screen.findByText(/Dieser Termin ist abgesagt\./);
      expect(screen.queryByRole('link', { name: 'Folgetermin anlegen' })).toBeNull();
    });

    it('bietet einem Patientenkonto keinen Folgetermin an', async () => {
      fetchAppointment.mockResolvedValue(hausbesuch);
      rendern(['patient']);
      await screen.findByText('Beispielstrasse 12, 72070 Tuebingen');
      expect(screen.queryByRole('link', { name: 'Folgetermin anlegen' })).toBeNull();
    });
  });
});
