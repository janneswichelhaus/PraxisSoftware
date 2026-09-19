import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as TreatmentBasesApi from '@/features/treatment-bases/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const VERORDNUNG = '88888888-8888-4888-8888-000000000002';

const fetchPatientAppointments = vi.fn();
const fetchPatientTreatmentBasisSlots = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchPatientAppointments: (patientId: string, query: AppointmentsApi.PatientAppointmentQuery) =>
      fetchPatientAppointments(patientId, query) as Promise<AppointmentsApi.PatientAppointment[]>,
  };
});

vi.mock('@/features/treatment-bases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof TreatmentBasesApi>();
  return {
    ...actual,
    fetchPatientTreatmentBasisSlots: (id: string) =>
      fetchPatientTreatmentBasisSlots(id) as Promise<TreatmentBasesApi.TreatmentBasisKontingent[]>,
  };
});

const { Terminbereich } = await import('./PatientAppointmentsPage');

const patient = testPatient({ id: PATIENT_ID });

function termin(
  rest: Partial<AppointmentsApi.PatientAppointment> = {},
): AppointmentsApi.PatientAppointment {
  return {
    id: 't1',
    starts_at: '2027-05-19T07:00:00.000Z',
    ends_at: '2027-05-19T08:00:00.000Z',
    appointment_type: 'home_visit',
    status: 'confirmed',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    notification_channels: [],
    treatment_basis_id: null,
    treatment_basis_kind: null,
    treatment_basis_issued_on: null,
    treatment_basis_covered: null,
    organization_time_zone: 'Europe/Berlin',
    ...rest,
  };
}

/** Was die Liste in welche Richtung anfragt - `kuenftig` trennt die Aufrufe. */
function antwortet(kuenftige: unknown[], vergangene: unknown[]) {
  fetchPatientAppointments.mockImplementation(
    (_id: string, query: AppointmentsApi.PatientAppointmentQuery) =>
      Promise.resolve(query.kuenftig ? kuenftige : vergangene),
  );
}

describe('Terminbereich der Akte (AKTE-003)', () => {
  beforeEach(() => {
    fetchPatientAppointments.mockReset();
    fetchPatientTreatmentBasisSlots.mockReset();
    fetchPatientTreatmentBasisSlots.mockResolvedValue([]);
    antwortet([], []);
  });

  it('zeigt kommende und vergangene Termine getrennt', async () => {
    antwortet(
      [termin({ id: 'kuenftig' })],
      [termin({ id: 'vergangen', starts_at: '2026-09-08T07:00:00.000Z' })],
    );
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByRole('heading', { name: 'Kommende Termine' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vergangene Termine' })).toBeInTheDocument();
    // Der Rueckweg fuehrt in den Terminbereich der Akte zurueck (UX-012).
    const zurueck = encodeURIComponent(`/patienten/${PATIENT_ID}/termine`);
    expect(await screen.findByRole('link', { name: /19\. Mai 2027/ })).toHaveAttribute(
      'href',
      `/termine/kuenftig?zurueck=${zurueck}`,
    );
    expect(screen.getByRole('link', { name: /8\. September 2026/ })).toHaveAttribute(
      'href',
      `/termine/vergangen?zurueck=${zurueck}`,
    );
  });

  it('zeigt abgesagte Termine mit ihrem Zustand', async () => {
    antwortet([], [termin({ id: 'abgesagt', status: 'cancelled' })]);
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByText('Abgesagt')).toBeInTheDocument();
  });

  // CAL-022: Eine stille Ueberplanung waere der Abrechnungsfehler, den
  // PROJECT_PRINCIPLES.md 13 ausschliesst - deshalb steht das Zeichen auch
  // hier und nicht nur an der Grundlage.
  it('kennzeichnet einen ungedeckten Termin', async () => {
    antwortet([termin({ id: 'ungedeckt', treatment_basis_covered: false })], []);
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByText('Ohne Deckung')).toBeInTheDocument();
  });

  it('kennzeichnet einen gedeckten Termin nicht', async () => {
    antwortet([termin({ id: 'gedeckt', treatment_basis_covered: true })], []);
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    await screen.findByRole('link', { name: /Mai 2027/ });
    expect(screen.queryByText('Ohne Deckung')).not.toBeInTheDocument();
  });

  it('sagt es als Text, wenn es nichts gibt', async () => {
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByText('Kein weiterer Termin vereinbart.')).toBeInTheDocument();
    expect(
      screen.getByText('Für diese Person gibt es noch keinen vergangenen Termin.'),
    ).toBeInTheDocument();
  });

  // Der Mitteilungsvermerk (CAL-012) wird hinter der Anmeldung geprueft, und
  // die dortige Zusicherung greift die Zeile ueber den Link des Termins. Bis
  // UI-002a war die ganze Zeile der Link (Uebersicht der Akte); hier steht das
  // Zeichen NEBEN ihm. Genau daran ist die Spezifikation gescheitert - dieser
  // Test haelt die Struktur fest, damit das nicht erst in CI auffaellt.
  it('stellt das Mitteilungszeichen neben den Link, in dieselbe Zeile', async () => {
    antwortet([termin({ id: 'kuenftig', notification_channels: ['phone'] })], []);
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    const link = await screen.findByRole('link', { name: /Mai 2027/ });
    expect(link).not.toHaveTextContent('Telefon');

    const zeile = link.closest('li');
    expect(zeile).not.toBeNull();
    expect(zeile).toHaveTextContent('Telefon');
  });

  // ---------------------------------------------------------------------------
  // AKTE-006: Termine stehen unter der Ueberschrift ihrer Grundlage.
  // ---------------------------------------------------------------------------
  describe('Gruppierung nach Behandlungsgrundlage', () => {
    const ZWEITE = '88888888-8888-4888-8888-000000000004';

    function kontingent(
      id: string,
      rest: Partial<TreatmentBasesApi.TreatmentBasisKontingent> = {},
    ): TreatmentBasesApi.TreatmentBasisKontingent {
      return {
        treatment_basis_id: id,
        prescribed: 6,
        used: 0,
        planned: 1,
        upcoming: 1,
        remaining: 5,
        covered: 1,
        uncovered: 0,
        ...rest,
      };
    }

    it('macht aus zwei Grundlagen zwei Abschnitte, Termine ohne Grundlage in einen dritten', async () => {
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent(ZWEITE),
        kontingent(VERORDNUNG),
      ]);
      antwortet(
        [
          termin({
            id: 'alt',
            treatment_basis_id: VERORDNUNG,
            treatment_basis_kind: 'follow_up',
            treatment_basis_issued_on: '2026-06-18',
          }),
          termin({
            id: 'neu',
            starts_at: '2027-05-26T07:00:00.000Z',
            ends_at: '2027-05-26T08:00:00.000Z',
            treatment_basis_id: ZWEITE,
            treatment_basis_kind: 'self_pay',
            treatment_basis_issued_on: '2026-09-03',
          }),
          termin({ id: 'ohne', starts_at: '2027-06-02T07:00:00.000Z' }),
        ],
        [],
      );
      renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByText('Selbstzahler seit 03.09.2026')).toBeInTheDocument();
      expect(screen.getByText('Folgeverordnung vom 18.06.2026')).toBeInTheDocument();
      // Kein Termin faellt heraus, nur weil er zu keiner Grundlage gehoert.
      expect(screen.getByText('Ohne Behandlungsgrundlage')).toBeInTheDocument();

      // Die Reihenfolge der Abschnitte ist die der Grundlagen; ohne Grundlage
      // steht zuletzt.
      const ueberschriften = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
      expect(ueberschriften).toEqual([
        'Selbstzahler seit 03.09.2026',
        'Folgeverordnung vom 18.06.2026',
        'Ohne Behandlungsgrundlage',
      ]);
    });

    it('nennt die Deckung an der Ueberschrift, nicht an jeder Zeile', async () => {
      fetchPatientTreatmentBasisSlots.mockResolvedValue([
        kontingent(VERORDNUNG, { prescribed: 6, planned: 10, covered: 6, uncovered: 4 }),
      ]);
      antwortet(
        [
          termin({
            id: 'ungedeckt',
            treatment_basis_id: VERORDNUNG,
            treatment_basis_kind: 'follow_up',
            treatment_basis_issued_on: '2026-06-18',
            treatment_basis_covered: false,
          }),
        ],
        [],
      );
      renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

      expect(
        await screen.findByText('6 von 10 zugeordneten Terminen gedeckt · 4 ohne Deckung'),
      ).toBeInTheDocument();
    });

    it('zeigt die Gruppe auch ohne geladene Zahlen, nur ohne Deckungssatz', async () => {
      fetchPatientTreatmentBasisSlots.mockRejectedValue(new Error('kaputt'));
      antwortet(
        [
          termin({
            id: 'alt',
            treatment_basis_id: VERORDNUNG,
            treatment_basis_kind: 'follow_up',
            treatment_basis_issued_on: '2026-06-18',
          }),
        ],
        [],
      );
      renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByText('Folgeverordnung vom 18.06.2026')).toBeInTheDocument();
      expect(screen.queryByText(/gedeckt/)).not.toBeInTheDocument();
    });

    it('fragt die Zahlen nicht ab, wo die Rolle keine Grundlage lesen darf', async () => {
      antwortet([termin({ id: 'ohne' })], []);
      renderWithProviders(<Terminbereich patient={patient} user={testUser(['patient'])} />);

      await screen.findByText('Ohne Behandlungsgrundlage');
      expect(fetchPatientTreatmentBasisSlots).not.toHaveBeenCalled();
    });
  });

  describe('Verordnung und Termine finden einander', () => {
    it('nennt an jedem Termin seine Verordnung', async () => {
      antwortet(
        [
          termin({
            id: 'ausSerie',
            treatment_basis_id: VERORDNUNG,
            treatment_basis_kind: 'follow_up',
            treatment_basis_issued_on: '2026-06-18',
          }),
        ],
        [],
      );
      renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

      expect(
        await screen.findByRole('link', { name: 'Folgeverordnung vom 18.06.2026' }),
      ).toHaveAttribute('href', `/patienten/${PATIENT_ID}/verordnungen#verordnung-${VERORDNUNG}`);
    });

    it('filtert auf eine Verordnung und sagt das', async () => {
      antwortet([termin({ id: 'ausSerie', treatment_basis_id: VERORDNUNG })], []);
      renderWithProviders(
        <Terminbereich patient={patient} user={testUser(['office'])} />,
        `/patienten/${PATIENT_ID}/termine?verordnung=${VERORDNUNG}`,
      );

      expect(
        await screen.findByText('Nur die Termine einer Behandlungsgrundlage.'),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(fetchPatientAppointments).toHaveBeenCalledWith(
          PATIENT_ID,
          expect.objectContaining({ verordnung: VERORDNUNG }),
        ),
      );
    });

    it('nimmt den Filter wieder heraus', async () => {
      const user = userEvent.setup();
      antwortet([termin({ treatment_basis_id: VERORDNUNG })], []);
      renderWithProviders(
        <Terminbereich patient={patient} user={testUser(['office'])} />,
        `/patienten/${PATIENT_ID}/termine?verordnung=${VERORDNUNG}`,
      );

      await user.click(await screen.findByRole('button', { name: 'Alle Termine zeigen' }));

      await waitFor(() =>
        expect(
          screen.queryByText('Nur die Termine einer Behandlungsgrundlage.'),
        ).not.toBeInTheDocument(),
      );
      expect(fetchPatientAppointments).toHaveBeenCalledWith(
        PATIENT_ID,
        expect.objectContaining({ verordnung: null }),
      );
    });

    it('ignoriert eine verstellte Verordnungskennung still', async () => {
      renderWithProviders(
        <Terminbereich patient={patient} user={testUser(['office'])} />,
        `/patienten/${PATIENT_ID}/termine?verordnung=kein-uuid`,
      );

      await waitFor(() => expect(fetchPatientAppointments).toHaveBeenCalled());
      expect(fetchPatientAppointments).toHaveBeenCalledWith(
        PATIENT_ID,
        expect.objectContaining({ verordnung: null }),
      );
      expect(
        screen.queryByText('Nur die Termine einer Behandlungsgrundlage.'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Uebergabe an den Kalender', () => {
    it('nimmt den Patientenfilter und den Tag des naechsten Termins mit', async () => {
      antwortet([termin({ starts_at: '2027-05-19T07:00:00.000Z' })], []);
      renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

      const link = await screen.findByRole('link', { name: 'Im Kalender zeigen' });
      await waitFor(() =>
        expect(link).toHaveAttribute(
          'href',
          `/kalender?ansicht=tag&datum=2027-05-19&patient=${PATIENT_ID}`,
        ),
      );
    });

    it('faellt ohne kommenden Termin auf den heutigen Tag zurueck', async () => {
      renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

      const link = await screen.findByRole('link', { name: 'Im Kalender zeigen' });
      expect(link.getAttribute('href')).toMatch(
        new RegExp(`^/kalender\\?ansicht=tag&datum=\\d{4}-\\d{2}-\\d{2}&patient=${PATIENT_ID}$`),
      );
    });
  });

  it('fuehrt den Weg zum Mitteilen der Termine', async () => {
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByRole('link', { name: 'Termine mitteilen' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/terminzettel`,
    );
  });

  it('meldet einen Ladefehler ohne interne Details', async () => {
    fetchPatientAppointments.mockRejectedValue(new Error('interne Ursache'));
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(
      (await screen.findAllByText('Die Termine konnten nicht geladen werden.')).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/interne Ursache/)).not.toBeInTheDocument();
  });
});
