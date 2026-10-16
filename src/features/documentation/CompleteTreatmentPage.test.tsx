import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager } from '@tanstack/react-query';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as LageApi from '@/features/appointments/abrechnungslage-api';
import type * as DokumentationApi from './api';
import type * as Bausteine from './textbausteine';
import type * as SlotApi from '@/features/slot-search/api';
import type * as BillingApi from '@/features/billing/api';
import type * as LeistungenApi from '@/features/appointments/leistungenAmTermin';
import type * as GrundlagenApi from '@/features/treatment-bases/api';
import type * as RouterModul from 'react-router-dom';
import type * as KiGateway from '@/lib/ki/gateway';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as KurzblickApi from '@/features/appointments/kurzblick-api';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';
import { KI_FEHLERTEXTE } from '@/lib/ki/gateway';
import {
  SperrsicherungKontext,
  type Sicherung,
} from '@/features/auth/sitzungssperre/sperrsicherung';
import { AUFNAHMEFEHLER, BEI_SPERRE_ANGEHALTEN, DIKTAT_OFFEN } from './diktat';
import { installiereAufnahme } from './testaufnahme';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const NOTE_ID = '88888888-8888-4888-8888-000000000001';

const termin = testAppointment({
  id: TERMIN_ID,
  location_id: null,
  appointment_type: 'home_visit',
  visit_street: 'Beispielstrasse',
  visit_house_number: '12',
  visit_postal_code: '72070',
  visit_city: 'Tuebingen',
  patient_given_name: 'Max',
  patient_family_name: 'Mustermann',
  location_name: null,
});

const entwurf: DokumentationApi.TreatmentNote = {
  id: NOTE_ID,
  appointment_id: TERMIN_ID,
  addendum_to_note_id: null,
  status: 'draft',
  content: 'Bereits geschriebener Entwurf',
  visit_without_treatment: false,
  created_at: '2027-05-12T08:00:00.000Z',
  updated_at: '2027-05-12T08:05:00.000000+00',
  finalized_at: null,
  finalisation_kind: null,
  version_count: 0,
  author_name: 'Anna Beispiel',
  last_editor_name: 'Anna Beispiel',
  finalized_by_name: null,
};

const fetchAppointment = vi.fn();
const fetchTreatmentDocumentation = vi.fn();
const completeTreatment = vi.fn();
const createTreatmentNote = vi.fn();
const updateTreatmentNote = vi.fn();
const navigate = vi.fn();
const fetchTextSnippets = vi.fn();
const fetchAbrechnungslage = vi.fn();
const fetchPatientTreatmentNotesPage = vi.fn();
const fetchBefundangaben = vi.fn();
const befundangabenSichern = vi.fn();
// Auftrag C1: „Danach" - Heilmittel, Folgetermin.
const fetchUpcomingAppointments = vi.fn();
const findFreeSlots = vi.fn();
const fetchLeistungenAmTermin = vi.fn();
const fetchVorschlag = vi.fn();
const recordLeistungen = vi.fn();
const releaseTreatmentBasisForBilling = vi.fn();
// K6: „Wie zuletzt" liest über den Kurzblick (ANN-502).
const fetchKurzblick = vi.fn();

vi.mock('@/features/treatment-bases/api', async (importOriginal) => ({
  ...(await importOriginal<typeof GrundlagenApi>()),
  releaseTreatmentBasisForBilling: (id: string) =>
    releaseTreatmentBasisForBilling(id) as Promise<void>,
}));

vi.mock('@/features/appointments/kurzblick-api', async (importOriginal) => ({
  ...(await importOriginal<typeof KurzblickApi>()),
  fetchKurzblick: (id: string) => fetchKurzblick(id) as Promise<unknown>,
}));

vi.mock('@/features/slot-search/api', async (importOriginal) => ({
  ...(await importOriginal<typeof SlotApi>()),
  findFreeSlots: (params: SlotApi.SearchParams) => findFreeSlots(params) as Promise<SlotApi.Slot[]>,
}));
vi.mock('@/features/billing/api', async (importOriginal) => ({
  ...(await importOriginal<typeof BillingApi>()),
  fetchVorschlag: (id: string) => fetchVorschlag(id) as Promise<BillingApi.Vorschlag[]>,
  recordLeistungen: (...args: unknown[]) => recordLeistungen(...args) as Promise<void>,
}));
vi.mock('@/features/appointments/leistungenAmTermin', async (importOriginal) => ({
  ...(await importOriginal<typeof LeistungenApi>()),
  fetchLeistungenAmTermin: (id: string) =>
    fetchLeistungenAmTermin(id) as Promise<LeistungenApi.LeistungenAmTermin | null>,
}));

vi.mock('@/features/appointments/abrechnungslage-api', async (importOriginal) => ({
  ...(await importOriginal<typeof LageApi>()),
  fetchAbrechnungslage: (id: string) =>
    fetchAbrechnungslage(id) as Promise<LageApi.Abrechnungslage | null>,
}));

vi.mock('./textbausteine', async (importOriginal) => {
  const actual = await importOriginal<typeof Bausteine>();
  return {
    ...actual,
    fetchTextSnippets: () => fetchTextSnippets() as Promise<Bausteine.TextSnippet[]>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
    fetchUpcomingAppointments: (id: string) =>
      fetchUpcomingAppointments(id) as Promise<AppointmentsApi.UpcomingAppointment[]>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchTreatmentDocumentation: (id: string) =>
      fetchTreatmentDocumentation(id) as Promise<DokumentationApi.TreatmentDocumentation>,
    completeTreatment: (...args: unknown[]) => completeTreatment(...args) as Promise<void>,
    createTreatmentNote: (...args: unknown[]) => createTreatmentNote(...args) as Promise<string>,
    updateTreatmentNote: (...args: unknown[]) => updateTreatmentNote(...args) as Promise<void>,
    fetchPatientTreatmentNotesPage: (...args: unknown[]) =>
      fetchPatientTreatmentNotesPage(...args) as Promise<
        DokumentationApi.PatientTreatmentNotesEntry[]
      >,
    fetchBefundangaben: (id: string) => fetchBefundangaben(id) as Promise<unknown>,
    befundangabenSichern: (...args: unknown[]) => befundangabenSichern(...args) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ appointmentId: TERMIN_ID }),
}));

// KI-EPIC-001: Der Gateway antwortet hier nicht über das Netz.
const diktatAufbereiten = vi.fn();
const diktatVerfuegbar = vi.fn<() => Promise<boolean>>();
vi.mock('@/lib/ki/gateway', async (importOriginal) => ({
  ...(await importOriginal<typeof KiGateway>()),
  diktatAufbereiten: (...args: unknown[]) =>
    diktatAufbereiten(...args) as Promise<KiGateway.Diktatergebnis>,
  diktatVerfuegbar: () => diktatVerfuegbar(),
}));

const { CompleteTreatmentPage } = await import('./CompleteTreatmentPage');

// B4 (BEF-154): Festschreiben hakt nicht ab - die Meldung sagt nur, was geschah.
const FESTGESCHRIEBEN = 'Eintrag als Version 1 festgeschrieben.';

/**
 * Nach dem Festschreiben bleibt die Seite stehen und zeigt „Danach"
 * (Auftrag C1); erst „Fertig" führt mit der Meldung weiter.
 */
async function fertigNachDanach(user: ReturnType<typeof userEvent.setup>) {
  expect(await screen.findByText(FESTGESCHRIEBEN)).toBeInTheDocument();
  expect(navigate).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Fertig' }));
}

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist'], suche = '') {
  return renderWithProviders(
    <CompleteTreatmentPage user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}/abschluss${suche}`,
  );
}

/**
 * Der Abschluss in einem Schritt ist der Regelfall am Ende eines Besuchs
 * (UX-007). Geprüft wird, dass er genau ein Schreibvorgang ist, dass er seine
 * Folge nennt, bevor er ausgelöst wird (ADR-016 Punkt 4), und dass der Weg
 * „nur speichern" daneben bestehen bleibt.
 */
describe('CompleteTreatmentPage', () => {
  beforeEach(() => {
    // Der Gateway bietet das Diktat an (die Fälle ohne stehen bei der Spracheingabe).
    diktatVerfuegbar.mockReset();
    diktatVerfuegbar.mockResolvedValue(true);
    fetchAppointment.mockReset();
    fetchTreatmentDocumentation.mockReset();
    completeTreatment.mockReset();
    createTreatmentNote.mockReset();
    updateTreatmentNote.mockReset();
    navigate.mockReset();
    fetchTextSnippets.mockReset();
    fetchAbrechnungslage.mockReset();
    fetchAbrechnungslage.mockResolvedValue(null);
    fetchPatientTreatmentNotesPage.mockReset();
    fetchPatientTreatmentNotesPage.mockResolvedValue([]);
    fetchBefundangaben.mockReset();
    fetchBefundangaben.mockResolvedValue(null);
    befundangabenSichern.mockReset();
    befundangabenSichern.mockResolvedValue(undefined);
    fetchTextSnippets.mockResolvedValue([
      {
        id: 'b1',
        title: 'Hausbesuch',
        body: 'Hausbesuch durchgefuehrt.',
        // B5: In der Leiste stehen nur eigene Bausteine.
        shared: false,
        editable: true,
      },
    ]);

    fetchAppointment.mockResolvedValue(termin);
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    completeTreatment.mockResolvedValue(undefined);
    createTreatmentNote.mockResolvedValue(NOTE_ID);
    updateTreatmentNote.mockResolvedValue(undefined);
    fetchUpcomingAppointments.mockReset();
    fetchUpcomingAppointments.mockResolvedValue([]);
    findFreeSlots.mockReset();
    findFreeSlots.mockResolvedValue([]);
    fetchLeistungenAmTermin.mockReset();
    fetchVorschlag.mockReset();
    recordLeistungen.mockReset();
    fetchKurzblick.mockReset();
  });

  it('ist eine Schreibfläche: Name im Kopf, Feld, Fußleiste mit Entwurf und Festschreiben (Handoff 6a)', async () => {
    rendern();
    expect(await screen.findByRole('heading', { level: 1, name: 'Max Mustermann' })).toBeVisible();
    expect(screen.getByText(/^Dokumentation · \S+ \d{2}\.\d{2}\. · /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entwurf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Festschreiben' })).toBeInTheDocument();
    // Keine Hinweise, keine Folgen-Kästen, kein „Abbrechen" neben dem Pfeil.
    expect(screen.queryByText(/geschieht zweierlei/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Abbrechen' })).toBeNull();
  });

  it('nennt „Termin n von m" im Kopf, wenn die Grundlage geladen ist', async () => {
    fetchAbrechnungslage.mockResolvedValue({
      appointment_id: TERMIN_ID,
      treatment_basis_id: null,
      treatment_basis_kind: null,
      treatment_basis_issued_on: null,
      basis_position: 2,
      basis_appointment_count: 6,
      billing_visible: false,
      recipient_kind: null,
    });
    rendern();
    expect(await screen.findByText(/Termin 2 von 6/)).toBeInTheDocument();
  });

  it('liest die bisherigen Einträge erst, wenn jemand den Verlauf öffnet (ANN-200)', async () => {
    const rahmen = {
      ends_at: '2027-05-12T09:00:00.000Z',
      appointment_type: 'home_visit',
      staff_given_name: 'Anna',
      staff_family_name: 'Beispiel',
      organization_time_zone: 'Europe/Berlin',
    };
    fetchPatientTreatmentNotesPage.mockResolvedValue([
      {
        ...rahmen,
        appointment_id: TERMIN_ID,
        starts_at: '2027-05-12T08:00:00.000Z',
        appointment_status: 'confirmed',
        notes: [entwurf],
      },
      {
        ...rahmen,
        appointment_id: 'vorher',
        starts_at: '2027-05-05T08:00:00.000Z',
        appointment_status: 'documented',
        notes: [
          {
            ...entwurf,
            id: 'n-vorher',
            appointment_id: 'vorher',
            status: 'final',
            version_count: 1,
            content: 'Letzte Woche: Gangschule.',
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    rendern();
    const verlauf = await screen.findByRole('button', { name: /^Verlauf/ });
    expect(verlauf).toHaveAttribute('aria-expanded', 'false');
    expect(fetchPatientTreatmentNotesPage).not.toHaveBeenCalled();

    await user.click(verlauf);
    expect(await screen.findByText('Letzte Woche: Gangschule.')).toBeInTheDocument();
    expect(screen.getByText('Lesen protokolliert')).toBeInTheDocument();
    expect(screen.getByText('Version 1')).toBeInTheDocument();
    // Der Eintrag dieses Termins steht im Feld, nicht noch einmal im Verlauf.
    expect(screen.queryByText('Bereits geschriebener Entwurf')).toBeNull();
    expect(screen.getByRole('button', { name: /^Verlauf \(1\)/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('link', { name: /Verlauf in der Akte/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/patienten\/.+\/doku\?zurueck=/),
    );

    await user.click(screen.getByRole('button', { name: 'Bisherige Einträge schließen' }));
    expect(screen.queryByText('Letzte Woche: Gangschule.')).toBeNull();
  });

  it('schreibt die Dokumentation mit einer einzigen Aktion fest - ohne abzuhaken (B4)', async () => {
    const user = userEvent.setup();
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
    await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

    await waitFor(() => expect(completeTreatment).toHaveBeenCalledTimes(1));
    expect(completeTreatment).toHaveBeenCalledWith(
      TERMIN_ID,
      'Heute geübt.',
      termin.updated_at,
      null,
      // Ohne den Weg aus dem geführten Ablauf kein Pflichtvermerk (CAL-018).
      false,
    );
    // Kein zweiter Schreibweg daneben.
    expect(createTreatmentNote).not.toHaveBeenCalled();
    expect(updateTreatmentNote).not.toHaveBeenCalled();
    // „Fertig" führt zurück zum Termin, der erfährt, was geschehen ist (DOK-15, ZST-17).
    await fertigNachDanach(user);
    expect(navigate).toHaveBeenCalledWith(`/kalender?termin=${TERMIN_ID}`, {
      state: { meldung: FESTGESCHRIEBEN },
    });
  });

  it('behält den Rückweg aus der Übersicht für den Pfeil und den Weg danach (DOK-01, ZST-17)', async () => {
    const user = userEvent.setup();
    rendern(['therapist'], '?zurueck=%2F');

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
    expect(screen.getByRole('link', { name: 'Zurück' })).toHaveAttribute('href', '/');

    await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
    await fertigNachDanach(user);
    expect(navigate).toHaveBeenCalledWith('/', { state: { meldung: FESTGESCHRIEBEN } });
  });

  describe('Auftrag C1: „Danach" nach dem Festschreiben', () => {
    const dokumentiert = { ...termin, status: 'documented' as const };
    const stand = (bestaetigt: boolean): LeistungenApi.LeistungenAmTermin => ({
      appointment_id: TERMIN_ID,
      can_record: true,
      services: bestaetigt
        ? [{ code: 'KG', label: 'Krankengymnastik', quantity: 1, status: 'billable' }]
        : [],
      recorded_at: null,
      recorded_by_name: null,
      basis_items: null,
      session_fee_cents: null,
    });

    /** Die Abrechnungslage am Termin: zweiter von zehn Terminen der Folgeverordnung. */
    const lage = (teil: Partial<LageApi.Abrechnungslage> = {}): LageApi.Abrechnungslage => ({
      appointment_id: TERMIN_ID,
      treatment_basis_id: 'b1',
      treatment_basis_kind: 'follow_up',
      treatment_basis_issued_on: '2027-05-01',
      basis_position: 2,
      basis_appointment_count: 10,
      billing_visible: false,
      recipient_kind: null,
      open_invoice_count: null,
      open_outstanding_cents: null,
      open_overdue: null,
      closing_talk_due: false,
      checked_at: null,
      basis_performed: 1,
      basis_open: 9,
      basis_complete: false,
      basis_ready: false,
      basis_released_at: null,
      basis_invoiced: false,
      basis_state: 'laeuft',
      can_release: false,
      ...teil,
    });
    const mitGrundlage = (): LeistungenApi.LeistungenAmTermin => ({
      ...stand(false),
      basis_items: [
        { remedy: 'KG', prescribed_quantity: 10, used_quantity: 1 },
        { remedy: 'MT', prescribed_quantity: 10, used_quantity: 1 },
      ],
    });

    // B7 (BEF-157): Nach dem Festschreiben steht die Leistung zur Kontrolle da -
    // bestätigt wird nichts mehr; mit dem Haken gilt sie als erbracht.
    it('zeigt die Leistung zur Kontrolle statt einer Bestätigung (B7)', async () => {
      const user = userEvent.setup();
      completeTreatment.mockImplementation(() => {
        fetchAppointment.mockResolvedValue(dokumentiert);
        return Promise.resolve();
      });
      fetchAbrechnungslage.mockResolvedValue(lage());
      fetchLeistungenAmTermin.mockResolvedValue(mitGrundlage());
      rendern(['therapist'], '?zurueck=%2F');

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      expect(await screen.findByText(FESTGESCHRIEBEN)).toBeInTheDocument();
      // Kein Feld mehr: Festgeschrieben ist festgeschrieben.
      expect(screen.queryByLabelText('Eintrag zur Behandlung')).toBeNull();

      expect(await screen.findByText('2. von 10 Terminen · KG, MT')).toBeInTheDocument();
      expect(screen.getByText('Haken fehlt')).toBeInTheDocument();
      // ANN-475 ist ersetzt: kein Häkchen je Heilmittel, kein Bestätigen.
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Heilmittel bestätigen' })).toBeNull();
      expect(fetchVorschlag).not.toHaveBeenCalled();
      expect(recordLeistungen).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Fertig' }));
      expect(navigate).toHaveBeenCalledWith('/', { state: { meldung: FESTGESCHRIEBEN } });
    });

    it('schlägt am letzten Termin „In die Abrechnung stellen“ vor - ein Tipp (B7)', async () => {
      const user = userEvent.setup();
      fetchAppointment.mockResolvedValue({
        ...dokumentiert,
        completed_at: '2027-05-12T09:00:00.000Z',
      });
      fetchTreatmentDocumentation.mockResolvedValue({
        primary: { ...entwurf, status: 'final', version_count: 1 },
        addenda: [],
      });
      fetchAbrechnungslage.mockResolvedValue(
        lage({
          basis_position: 10,
          checked_at: '2027-05-12T09:00:00.000Z',
          basis_performed: 10,
          basis_open: 0,
          basis_complete: true,
          basis_ready: true,
          basis_state: 'abrechnen',
          can_release: true,
        }),
      );
      fetchLeistungenAmTermin.mockResolvedValue({
        ...mitGrundlage(),
        services: [{ code: 'KG', label: 'KG', quantity: 1, status: 'billable' }],
      });
      releaseTreatmentBasisForBilling.mockResolvedValue(undefined);
      rendern(['therapist'], '?zurueck=%2F');

      // Den Stand nennt die Zeile; der Vorschlag ist nur der Knopf.
      expect(await screen.findByText(/^10\. von 10 Terminen/)).toBeVisible();
      expect(screen.getByText('Erbracht')).toBeInTheDocument();
      const stellen = screen.getByRole('button', { name: 'In die Abrechnung stellen' });
      // Sekundär: Der eine Hauptknopf bleibt „Fertig“.
      expect(stellen).not.toHaveClass('bg-accent');
      await user.click(stellen);

      expect(releaseTreatmentBasisForBilling).toHaveBeenCalledTimes(1);
      expect(releaseTreatmentBasisForBilling).toHaveBeenCalledWith('b1');
      expect(await screen.findByText(/In die Abrechnung gestellt/)).toBeInTheDocument();
    });

    it('zeigt keine Leistung, wo die Rolle am Termin nicht bestätigen darf', async () => {
      const user = userEvent.setup();
      completeTreatment.mockImplementation(() => {
        fetchAppointment.mockResolvedValue({ ...dokumentiert, staff_member_id: 'fremd' });
        return Promise.resolve();
      });
      fetchAbrechnungslage.mockResolvedValue(lage());
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      expect(await screen.findByText(FESTGESCHRIEBEN)).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Leistung' })).toBeNull();
      expect(fetchLeistungenAmTermin).not.toHaveBeenCalled();
    });

    it('nennt einen schon stehenden nächsten Termin als erledigt (L3)', async () => {
      const user = userEvent.setup();
      fetchUpcomingAppointments.mockResolvedValue([
        {
          id: 'n1',
          starts_at: '2027-05-19T08:00:00.000Z',
          ends_at: '2027-05-19T09:00:00.000Z',
          appointment_type: 'home_visit',
          status: 'confirmed',
          staff_given_name: 'Anna',
          staff_family_name: 'Beispiel',
          notification_channels: [],
          organization_time_zone: 'Europe/Berlin',
        },
      ]);
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      expect(
        await screen.findByText(/Nächster Termin: Mi 19\.05\., 10:00 Uhr/),
      ).toBeInTheDocument();
      expect(findFreeSlots).not.toHaveBeenCalled();
      expect(screen.getByRole('link', { name: /Andere Zeit suchen/ })).toHaveAttribute(
        'href',
        expect.stringMatching(/^\/patienten\/.+\/plaetze\?zurueck=/),
      );
    });

    it('führt mit „Plan mitgeben" gleich zu den Übungsplänen der Akte (Praxis-Review R2, P5)', async () => {
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      const link = await screen.findByRole('link', { name: 'Plan mitgeben' });
      // Die Sprungmarke steht hinter dem Rückweg - sonst wäre sie Teil von ihm.
      expect(link).toHaveAttribute(
        'href',
        expect.stringMatching(/^\/patienten\/[^/?#]+\/doku\?zurueck=[^#]+#uebungsplaene$/),
      );
    });

    it('zeigt am bereits festgeschriebenen Termin „Danach" unter „Bereits finalisiert"', async () => {
      fetchAppointment.mockResolvedValue(dokumentiert);
      fetchTreatmentDocumentation.mockResolvedValue({
        primary: { ...entwurf, status: 'final', version_count: 1 },
        addenda: [],
      });
      fetchAbrechnungslage.mockResolvedValue(lage());
      fetchLeistungenAmTermin.mockResolvedValue(mitGrundlage());
      rendern(['therapist'], '?zurueck=%2F');
      expect(await screen.findByText('Bereits finalisiert')).toBeInTheDocument();
      expect(await screen.findByRole('heading', { name: 'Leistung' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Heilmittel bestätigen' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Zurück zur Übersicht' })).toHaveAttribute(
        'href',
        '/',
      );
    });
  });

  it('verbindet die Folge mit dem Knopf, damit sie auch vorgelesen wird (DOK-20)', async () => {
    rendern();

    expect(
      await screen.findByRole('button', { name: 'Festschreiben' }),
    ).toHaveAccessibleDescription(/als Version 1 fest; abgehakt wird der Termin getrennt/);
  });

  it('uebergibt den Stand eines vorhandenen Entwurfs zur Konflikterkennung', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: entwurf, addenda: [] });
    const user = userEvent.setup();
    rendern();

    const feld = await screen.findByLabelText('Eintrag zur Behandlung');
    expect(feld).toHaveValue('Bereits geschriebener Entwurf');

    await user.clear(feld);
    await user.type(feld, 'Neuer Text');
    await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

    await waitFor(() =>
      expect(completeTreatment).toHaveBeenCalledWith(
        TERMIN_ID,
        'Neuer Text',
        termin.updated_at,
        entwurf.updated_at,
        false,
      ),
    );
  });

  it('laesst einen leeren Text nicht durch und schreibt nichts', async () => {
    const user = userEvent.setup();
    rendern();

    await user.click(await screen.findByRole('button', { name: 'Festschreiben' }));

    expect(
      await screen.findByText('Die Behandlungsdokumentation darf nicht leer sein.'),
    ).toBeInTheDocument();
    expect(completeTreatment).not.toHaveBeenCalled();
  });

  it('bietet daneben weiter den Weg "nur speichern"', async () => {
    const user = userEvent.setup();
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Nur ein Entwurf.');
    await user.click(screen.getByRole('button', { name: 'Entwurf' }));

    await waitFor(() => expect(createTreatmentNote).toHaveBeenCalledTimes(1));
    expect(completeTreatment).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/kalender?termin=${TERMIN_ID}`, {
        state: { meldung: 'Entwurf gespeichert – noch nicht finalisiert.' },
      }),
    );
  });

  it('schuetzt einen ungespeicherten Text beim Zurückgehen', async () => {
    const user = userEvent.setup();
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Ungespeichert');
    await user.click(screen.getByRole('link', { name: 'Zurück' }));

    // Seit FIX-011 stellt der Navigationsschutz die Rückfrage - für
    // „Abbrechen" wie für jeden anderen Weg aus dieser Seite heraus.
    expect(
      await screen.findByRole('group', { name: 'Ungespeicherte Dokumentation' }),
    ).toBeInTheDocument();

    // Als Zeile über der Fußleiste (Handoff 6a), mit denselben drei Wegen.
    expect(screen.getByText('Text noch nicht gespeichert.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Weiterschreiben' }));
    expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue('Ungespeichert');
  });

  /**
   * Der Kern der Zusicherung aus FIX-EPIC-003: „Speichern" aus der Rückfrage
   * heraus sichert den **Entwurf**. Ein Seitenwechsel schließt keinen Termin
   * ab und schreibt keine Dokumentation fest (ADR-016, ADR-018).
   */
  it('sichert aus der Rueckfrage nur den Entwurf und schliesst nichts ab', async () => {
    const user = userEvent.setup();
    createTreatmentNote.mockResolvedValue(NOTE_ID);
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Ungespeichert');
    await user.click(screen.getByRole('link', { name: 'Zurück' }));
    await user.click(screen.getByRole('button', { name: 'Speichern und weiter' }));

    await waitFor(() =>
      expect(createTreatmentNote).toHaveBeenCalledWith(TERMIN_ID, 'Ungespeichert'),
    );
    expect(completeTreatment).not.toHaveBeenCalled();
  });

  it('schreibt am bereits abgeschlossenen Termin („Doku offen") mit demselben Knopf fest', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'completed' });
    const user = userEvent.setup();
    rendern();
    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Nachgetragen.');
    await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
    await waitFor(() => expect(completeTreatment).toHaveBeenCalledTimes(1));
  });

  it('weist einen nicht angetroffenen Termin ohne Eintrag ruhig ab', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'no_show' });
    rendern();
    expect(await screen.findByText('Nicht angetroffen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Eintrag zur Behandlung')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('weist einen abgesagten Termin ab', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'cancelled' });
    rendern();
    expect(await screen.findByText('Termin abgesagt')).toBeInTheDocument();
    expect(screen.queryByLabelText('Eintrag zur Behandlung')).toBeNull();
    // Ein erwartbarer Zustand, kein Alarm (DOK-12).
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('weist eine bereits finalisierte Dokumentation ab und nennt die Wege (DOK-08, DOK-12)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: { ...entwurf, status: 'final', version_count: 1 },
      addenda: [],
    });
    rendern();
    // Derselbe Zustand heißt überall gleich (DOK-08).
    expect(await screen.findByText('Bereits finalisiert')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: 'Nachtrag hinzufügen' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${NOTE_ID}/nachtrag`,
    );
    expect(screen.getByRole('link', { name: 'Korrigieren' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${NOTE_ID}/korrektur`,
    );
  });

  describe('Nachladen (DOK-B01)', () => {
    afterEach(() => {
      focusManager.setFocused(undefined);
    });

    it('behält Feld und Text, wenn der Eintrag inzwischen finalisiert wurde', async () => {
      fetchTreatmentDocumentation.mockResolvedValue({ primary: entwurf, addenda: [] });
      const user = userEvent.setup();
      rendern();

      const feld = await screen.findByLabelText('Eintrag zur Behandlung');
      await waitFor(() => expect(feld).toHaveValue('Bereits geschriebener Entwurf'));
      await user.type(feld, ' Und mehr.');

      fetchTreatmentDocumentation.mockResolvedValue({
        primary: { ...entwurf, status: 'final', version_count: 1 },
        addenda: [],
      });
      act(() => focusManager.setFocused(true));

      expect(
        await screen.findByText(
          'Der Eintrag wurde inzwischen finalisiert – Ihr Text steht noch im Feld und ist nicht gespeichert.',
        ),
      ).toBeInTheDocument();
      expect(feld).toHaveValue('Bereits geschriebener Entwurf Und mehr.');
      expect(screen.queryByText('Bereits finalisiert')).toBeNull();
    });

    it('meldet den eigenen Abschluss nicht als Änderung von außen', async () => {
      const user = userEvent.setup();
      rendern();

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
      // Nach dem Abschluss liefert der Server den Eintrag finalisiert.
      completeTreatment.mockImplementation(() => {
        fetchTreatmentDocumentation.mockResolvedValue({
          primary: { ...entwurf, content: 'Heute geübt.', status: 'final', version_count: 1 },
          addenda: [],
        });
        return Promise.resolve();
      });
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

      await fertigNachDanach(user);
      expect(navigate).toHaveBeenCalled();
      expect(screen.queryByText(/inzwischen finalisiert/)).toBeNull();
    });
  });

  describe('K6: Wie zuletzt (ANN-502)', () => {
    const blick = {
      appointment_id: TERMIN_ID,
      patient_id: 'p1',
      home_visit_access_note: null,
      special_note: null,
      take_along_items: [],
      primary_therapist_name: null,
      treatment_basis_id: null,
      treatment_basis_kind: null,
      treatment_basis_issued_on: null,
      basis_appointment_count: null,
      basis_used: null,
      basis_planned: null,
      basis_items: null,
      last_note_id: 'n0',
      last_note_appointment_start: '2027-05-05T07:00:00.000Z',
      last_note_status: 'final' as const,
      last_note_content: 'MT LWS, Gangschule 10 min, Heimprogramm wiederholt.',
      last_note_visit_without_treatment: false,
      last_note_author_name: 'Anna Beispiel',
      organization_time_zone: 'Europe/Berlin',
    };

    it('liest erst auf den Tipp und schreibt mit zwei Tipps fest', async () => {
      const user = userEvent.setup();
      fetchKurzblick.mockResolvedValue(blick);
      rendern();

      const feld = await screen.findByLabelText('Eintrag zur Behandlung');
      // Kein Lesen klinischer Einträge ohne Handlung (ANN-200).
      expect(fetchKurzblick).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Wie zuletzt' }));
      expect(fetchKurzblick).toHaveBeenCalledWith(TERMIN_ID);
      await waitFor(() =>
        expect(feld).toHaveValue('MT LWS, Gangschule 10 min, Heimprogramm wiederholt.'),
      );
      expect(screen.getByText('„Eintrag vom 05.05.2027“ am Ende eingefügt.')).toBeInTheDocument();

      // Angepasst wird von Hand, festgeschrieben wird ausdrücklich.
      await user.type(feld, ' Heute Treppe.');
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      await waitFor(() =>
        expect(completeTreatment).toHaveBeenCalledWith(
          TERMIN_ID,
          'MT LWS, Gangschule 10 min, Heimprogramm wiederholt. Heute Treppe.',
          termin.updated_at,
          null,
          false,
        ),
      );
    });

    it('nimmt die Übernahme mit „Rückgängig" zurück', async () => {
      const user = userEvent.setup();
      fetchKurzblick.mockResolvedValue(blick);
      rendern();

      const feld = await screen.findByLabelText('Eintrag zur Behandlung');
      await user.type(feld, 'Eigener Satz.');
      await user.click(screen.getByRole('button', { name: 'Wie zuletzt' }));
      await waitFor(() =>
        expect(feld).toHaveValue(
          'Eigener Satz.\n\nMT LWS, Gangschule 10 min, Heimprogramm wiederholt.',
        ),
      );
      await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
      expect(feld).toHaveValue('Eigener Satz.');
    });

    it('sagt, wenn es nichts zu übernehmen gibt, und fügt nichts ein', async () => {
      const user = userEvent.setup();
      fetchKurzblick.mockResolvedValue({
        ...blick,
        last_note_content: 'Tür geöffnet, nicht behandelt.',
        last_note_visit_without_treatment: true,
      });
      rendern();

      const feld = await screen.findByLabelText('Eintrag zur Behandlung');
      await user.click(screen.getByRole('button', { name: 'Wie zuletzt' }));
      expect(
        await screen.findByText('Der letzte Eintrag ist ein Vermerk ohne Behandlung.'),
      ).toBeInTheDocument();
      expect(feld).toHaveValue('');

      fetchKurzblick.mockResolvedValue({
        ...blick,
        last_note_content: null,
        last_note_appointment_start: null,
      });
      await user.click(screen.getByRole('button', { name: 'Wie zuletzt' }));
      expect(await screen.findByText('Noch kein Eintrag vor diesem Termin.')).toBeInTheDocument();
      expect(feld).toHaveValue('');
    });

    it('steht nicht am Vermerk „ohne Behandlung"', async () => {
      rendern(['therapist'], '?ohne-behandlung=1');
      await screen.findByLabelText('Eintrag zur Behandlung');
      expect(screen.queryByRole('button', { name: 'Wie zuletzt' })).toBeNull();
    });
  });

  describe('Baustein einfügen (DOK-10)', () => {
    it('meldet das Einfügen und nimmt es auf Wunsch zurück', async () => {
      const user = userEvent.setup();
      rendern();

      const feld = await screen.findByLabelText('Eintrag zur Behandlung');
      await user.type(feld, 'Eigener Satz.');
      await user.click(await screen.findByRole('button', { name: 'Hausbesuch' }));

      expect(feld).toHaveValue('Eigener Satz.\n\nHausbesuch durchgefuehrt.');
      expect(screen.getByText('„Hausbesuch“ am Ende eingefügt.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
      expect(feld).toHaveValue('Eigener Satz.');
    });
  });

  it('ist fuer office gar nicht erst zu oeffnen und fragt nichts ab', async () => {
    rendern(['office']);
    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
  });

  describe('UX-008: Textbausteine', () => {
    it('fuegt einen Baustein mit einem Tap ein', async () => {
      const user = userEvent.setup();
      rendern();

      await user.click(await screen.findByRole('button', { name: 'Hausbesuch' }));
      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue(
        'Hausbesuch durchgefuehrt.',
      );
    });

    it('haengt an bereits Geschriebenes an, statt es zu ersetzen', async () => {
      const user = userEvent.setup();
      rendern();

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Eigener Satz.');
      await user.click(screen.getByRole('button', { name: 'Hausbesuch' }));

      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue(
        'Eigener Satz.\n\nHausbesuch durchgefuehrt.',
      );
    });

    // B5: „+ Befund“ steht vorn, gleich nach „Wie zuletzt“ - die eigenen
    // Bausteine sind beliebig viele und schoben ihn bei 375 px aus dem Bild.
    it('stellt „+ Befund“ zwischen „Wie zuletzt“ und die eigenen Bausteine (B5)', async () => {
      rendern();

      const bausteine = await screen.findByRole('group', { name: 'Textbausteine' });
      const zuletzt = screen.getByRole('button', { name: 'Wie zuletzt' });
      const befund = screen.getByRole('button', { name: /^\+ Befund/ });
      // Eine Zeile, in dieser Reihenfolge.
      expect(befund.parentElement).toBe(bausteine.parentElement);
      expect(zuletzt.compareDocumentPosition(befund)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(befund.compareDocumentPosition(bausteine)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('stellt ohne eigene Bausteine den Link hinter „+ Befund“ (B5)', async () => {
      fetchTextSnippets.mockResolvedValue([]);
      rendern();

      const link = await screen.findByRole('link', { name: 'Eigene Bausteine anlegen' });
      const befund = screen.getByRole('button', { name: /^\+ Befund/ });
      expect(
        screen.getByRole('button', { name: 'Wie zuletzt' }).compareDocumentPosition(befund),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(befund.compareDocumentPosition(link)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('blockiert die Dokumentation nicht, wenn die Bausteine nicht laden', async () => {
      fetchTextSnippets.mockRejectedValue(new Error('kaputt'));
      rendern();

      expect(await screen.findByLabelText('Eintrag zur Behandlung')).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Textbausteine' })).toBeNull();
      // Ohne Bausteine endet die Zeile mit „+ Befund“, nicht mit einem Trenner.
      const befund = screen.getByRole('button', { name: /^\+ Befund/ });
      await waitFor(() => expect(screen.queryByTestId('bausteine-platzhalter')).toBeNull());
      expect(befund.nextElementSibling).toHaveClass('last:hidden');
      expect(befund.nextElementSibling?.nextElementSibling).toBeNull();
    });
  });
  /**
   * Hausbesuch-Szenario 1 (CAL-018, ADR-018 Fassung 3 Punkt 9).
   *
   * Der Weg kommt aus dem gefuehrten Ablauf am Termin und traegt seine Wahl in
   * der Adresszeile. Geprueft wird, dass die Seite die Folge benennt und den
   * Pflichtvermerk genau dann uebergibt, wenn er gewaehlt wurde.
   */
  describe('CAL-018: Ohne Behandlung abschliessen', () => {
    it('nennt den Pflichtvermerk und seine Folge, bevor abgeschlossen wird', async () => {
      rendern(['therapist'], '?ohne-behandlung=1');

      expect(
        await screen.findByText(/Tür geöffnet, Behandlung auf Angabe der Patient:in nicht/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Kein\s+Ausfallhonorar/)).toBeInTheDocument();
      expect(screen.getByText(/^Ohne Behandlung · /)).toBeInTheDocument();
    });

    it('uebergibt den Vermerk an den Abschluss', async () => {
      const user = userEvent.setup();
      rendern(['therapist'], '?ohne-behandlung=1');

      await user.type(
        await screen.findByLabelText('Eintrag zur Behandlung'),
        'Tuer geoeffnet, Behandlung abgelehnt.',
      );
      await user.click(screen.getByRole('button', { name: 'Mit Vermerk festschreiben' }));

      await waitFor(() =>
        expect(completeTreatment).toHaveBeenCalledWith(
          TERMIN_ID,
          'Tuer geoeffnet, Behandlung abgelehnt.',
          termin.updated_at,
          null,
          true,
        ),
      );
    });

    it('schreibt den Vermerk ohne eigenen Eintrag fest (ANN-565)', async () => {
      const user = userEvent.setup();
      rendern(['therapist'], '?ohne-behandlung=1');

      await user.click(await screen.findByRole('button', { name: 'Mit Vermerk festschreiben' }));

      await waitFor(() =>
        expect(completeTreatment).toHaveBeenCalledWith(
          TERMIN_ID,
          'Tür geöffnet, Behandlung auf Angabe der Patient:in nicht durchgeführt.',
          termin.updated_at,
          null,
          true,
        ),
      );
      expect(screen.queryByText(/darf nicht leer sein/)).not.toBeInTheDocument();
    });

    it('verlangt ohne Vermerk weiter einen Eintrag', async () => {
      const user = userEvent.setup();
      rendern(['therapist']);

      await user.click(await screen.findByRole('button', { name: 'Festschreiben' }));

      expect(await screen.findByText(/darf nicht leer sein/)).toBeInTheDocument();
      expect(completeTreatment).not.toHaveBeenCalled();
    });

    it('nimmt den Vermerk an einem Praxistermin nicht an (ANN-055)', async () => {
      fetchAppointment.mockResolvedValue({
        ...termin,
        appointment_type: 'practice',
        location_id: '33333333-3333-4333-8333-000000000001',
        location_name: 'Hauptstandort Tuebingen',
        visit_street: null,
        visit_house_number: null,
        visit_postal_code: null,
        visit_city: null,
      });
      const user = userEvent.setup();
      rendern(['therapist'], '?ohne-behandlung=1');

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Behandelt.');
      // Ohne den Vermerk heisst die Schaltflaeche wieder wie sonst.
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

      await waitFor(() =>
        expect(completeTreatment).toHaveBeenCalledWith(
          TERMIN_ID,
          'Behandelt.',
          termin.updated_at,
          null,
          false,
        ),
      );
    });
  });

  /**
   * Befund aus Bausteinen (FRB-003b). Festgeschrieben wird nur, was im Feld
   * steht (ADR-016 Punkt 4); ein nicht übernommener Vorschlag hält den
   * Abschluss an. In einen Entwurf geht er nie mit - seine Angaben werden
   * daneben gesichert (ABN-015, BEF-103, §13).
   */
  describe('FRB-003b: Befund aus Bausteinen', () => {
    const VORSCHLAG = 'Knie rechts – Weiterführende Untersuchung\n❗ Lachman-Test: positiv';

    async function lachmannPositiv(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: /^\+ Befund/ }));
      await user.click(screen.getByRole('button', { name: 'Knie' }));
      const seite = screen.getByRole('group', { name: 'Seite Knie' });
      await user.click(within(seite).getByRole('button', { name: 'rechts' }));
      await user.click(screen.getByText('Weiterführende Untersuchung'));
      const lachmann = screen.getByRole('group', { name: 'Lachman-Test' });
      await user.click(within(lachmann).getByRole('button', { name: 'positiv' }));
    }

    it('übernimmt den Vorschlag in den Text und schließt genau diesen ab', async () => {
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Befund:');
      await lachmannPositiv(user);
      await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

      const erwartet = `Befund:\n\n${VORSCHLAG}`;
      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue(erwartet);
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      await waitFor(() =>
        expect(completeTreatment).toHaveBeenCalledWith(
          TERMIN_ID,
          erwartet,
          termin.updated_at,
          null,
          false,
        ),
      );
    });

    it('schließt nicht ab, solange ein Vorschlag nicht im Text steht', async () => {
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Befund:');
      await lachmannPositiv(user);
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /Vorschlag aus den Bausteinen steht noch nicht im Text/,
      );
      expect(completeTreatment).not.toHaveBeenCalled();
    });

    it('sichert bei „Entwurf“ den Text ohne den Vorschlag und die Angaben daneben (BEF-103)', async () => {
      // Ungesehener Text im Entwurf käme über die automatische Finalisierung
      // (ADR-016 Punkt 7) in die Akte (Zweitreview S1).
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Befund:');
      await lachmannPositiv(user);
      await user.click(screen.getByRole('button', { name: 'Entwurf' }));

      await waitFor(() => expect(createTreatmentNote).toHaveBeenCalledWith(TERMIN_ID, 'Befund:'));
      expect(befundangabenSichern).toHaveBeenCalledWith(
        TERMIN_ID,
        expect.objectContaining({ seitenwahl: { knie: 'rechts' } }),
      );
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith(`/kalender?termin=${TERMIN_ID}`, {
          state: {
            meldung:
              'Entwurf gespeichert – noch nicht finalisiert. Der Vorschlag aus den Bausteinen ist nicht übernommen; seine Angaben bleiben gesichert.',
          },
        }),
      );
    });

    it('sichert von selbst nur den getippten Text, nie den offenen Vorschlag (ANN-120, ANN-319)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        rendern();
        await lachmannPositiv(user);
        await user.type(screen.getByLabelText('Eintrag zur Behandlung'), 'Befund:');
        await act(() => vi.advanceTimersByTimeAsync(3100));

        await waitFor(() => expect(createTreatmentNote).toHaveBeenCalledWith(TERMIN_ID, 'Befund:'));
        expect(completeTreatment).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('fragt beim Verlassen nach und sichert nur die Angaben, nicht den Vorschlag als Text', async () => {
      const user = userEvent.setup();
      rendern();
      await lachmannPositiv(user);
      await user.click(screen.getByRole('link', { name: 'Zurück' }));

      expect(
        await screen.findByRole('group', { name: 'Ungespeicherte Dokumentation' }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Speichern und weiter' }));
      await waitFor(() => expect(befundangabenSichern).toHaveBeenCalled());
      expect(createTreatmentNote).not.toHaveBeenCalled();
      expect(completeTreatment).not.toHaveBeenCalled();
    });

    // Region, Seite, Block, Ergebnis und die Rückfrage vor dem Verwerfen: mehr
    // Schritte als der Vorgabewert von 5 s unter voller Last trägt.
    it('schließt nach „Verwerfen“ wieder ab, ohne den Vorschlag', { timeout: 20_000 }, async () => {
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Befund:');
      await lachmannPositiv(user);
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      await screen.findByRole('alert');
      // Verwerfen fragt seit UXR-009 nach (BEF-01).
      await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
      await user.click(screen.getByRole('button', { name: 'Ja, alle Angaben verwerfen' }));
      expect(screen.queryByRole('alert')).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      await waitFor(() =>
        expect(completeTreatment).toHaveBeenCalledWith(
          TERMIN_ID,
          'Befund:',
          termin.updated_at,
          null,
          false,
        ),
      );
    });

    it('sperrt Bausteine und Textbausteine, solange der Abschluss läuft (Zweitreview B1)', async () => {
      let fertig: () => void = () => undefined;
      completeTreatment.mockReturnValue(new Promise<void>((resolve) => (fertig = resolve)));
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Befund:');
      await user.click(screen.getByRole('button', { name: /^\+ Befund/ }));
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

      await waitFor(() => expect(completeTreatment).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('group', { name: 'Befund aus Bausteinen' })).toBeDisabled();
      // Ein Tap auf einen Textbaustein ändert das festgehaltene Feld nicht.
      await user.click(screen.getByRole('button', { name: 'Hausbesuch' }));
      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue('Befund:');
      fertig();
      await fertigNachDanach(user);
      expect(navigate).toHaveBeenCalledWith(`/kalender?termin=${TERMIN_ID}`, {
        state: { meldung: FESTGESCHRIEBEN },
      });
    });

    it('bietet ohne Behandlung keine Bausteine an', async () => {
      rendern(['therapist'], '?ohne-behandlung=1');
      await screen.findByLabelText('Eintrag zur Behandlung');
      expect(screen.queryByRole('button', { name: /^\+ Befund/ })).toBeNull();
      expect(screen.queryByRole('group', { name: 'Befund aus Bausteinen' })).toBeNull();
    });
  });

  describe('Sicherung von selbst (BEF-056, ANN-319)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('sichert den Text nach einer Pause als Entwurf und schließt nichts ab', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      rendern();

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Synthetisch.');
      await act(() => vi.advanceTimersByTimeAsync(3100));

      await waitFor(() =>
        expect(createTreatmentNote).toHaveBeenCalledWith(TERMIN_ID, 'Synthetisch.'),
      );
      expect(completeTreatment).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(await screen.findByText(/Als Entwurf gesichert um/)).toBeInTheDocument();
    });

    it('sichert am Vermerk „ohne Behandlung“ nicht von selbst - der Entwurf trüge den Vermerk nicht', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      rendern(['therapist'], '?ohne-behandlung=1');

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Synthetisch.');
      await act(() => vi.advanceTimersByTimeAsync(3100 * 2));

      expect(createTreatmentNote).not.toHaveBeenCalled();
    });
  });

  it('bietet die Übernahme an, wenn der Entwurf inzwischen finalisiert ist (BEF-056)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: entwurf, addenda: [] });
    updateTreatmentNote.mockImplementation(() => {
      fetchTreatmentDocumentation.mockResolvedValue({
        primary: { ...entwurf, status: 'final', finalisation_kind: 'automatic', version_count: 1 },
        addenda: [],
      });
      return Promise.reject(new Error('Diese Dokumentation ist finalisiert.'));
    });
    const user = userEvent.setup();
    rendern();

    const feld = await screen.findByLabelText('Eintrag zur Behandlung');
    await user.type(feld, ' Zusatz.');
    await user.click(screen.getByRole('button', { name: 'Entwurf' }));

    const gruppe = await screen.findByRole('group', { name: 'Text übernehmen' });
    expect(within(gruppe).getByRole('button', { name: 'Als Nachtrag übernehmen' })).toBeEnabled();
    expect(within(gruppe).getByRole('button', { name: 'In Korrektur übernehmen' })).toBeEnabled();
    expect(feld).toHaveValue(`${entwurf.content} Zusatz.`);
  });

  /**
   * Spracheingabe als bevorzugter Weg (BEF-153, KI-EPIC-001, 6.3): Sprechen
   * nur auf Tipp, Vorschlag über dem Feld, Übernahme erst auf ausdrücklichen
   * Tipp - und davor wird nichts gespeichert. Mikrofon und Recorder sind
   * nachgebildet (`testaufnahme.ts`), der Gateway ist es auch.
   */
  describe('Spracheingabe (BEF-153, KI-EPIC-001)', () => {
    const VORSCHLAG: KiGateway.Diktatvorschlag = {
      transkript:
        'Patientin berichtet, Schmerz drei von zehn. Keine Schwellung. Plan: vielleicht Treppe [unverständlich].',
      abschnitte: [
        { titel: 'Angaben der Patient:in', text: 'Patientin berichtet, Schmerz drei von zehn.' },
        { titel: 'Befund', text: 'Keine Schwellung.' },
        { titel: 'Plan', text: 'Plan: vielleicht Treppe [unverständlich].' },
      ],
      quelle: 'nachbildung',
    };
    const VORSCHLAGSTEXT =
      'Angaben der Patient:in\nPatientin berichtet, Schmerz drei von zehn.\n\n' +
      'Befund\nKeine Schwellung.\n\nPlan\nPlan: vielleicht Treppe [unverständlich].';

    let aufnahme: ReturnType<typeof installiereAufnahme>;

    beforeEach(() => {
      aufnahme = installiereAufnahme();
      diktatAufbereiten.mockReset();
      diktatAufbereiten.mockResolvedValue({ ok: true, vorschlag: VORSCHLAG });
    });

    afterEach(() => {
      aufnahme.entfernen();
    });

    async function diktieren(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: 'Sprechen' }));
      await user.click(await screen.findByRole('button', { name: 'Fertig' }));
      return screen.findByLabelText('Text des Vorschlags');
    }

    it('macht „Sprechen“ zum Hauptknopf, solange das Feld leer ist (ANN-521)', async () => {
      const user = userEvent.setup();
      rendern();
      const sprechen = await screen.findByRole('button', { name: 'Sprechen' });
      const festschreiben = screen.getByRole('button', { name: 'Festschreiben' });
      expect(sprechen).toHaveClass('bg-accent', 'h-12');
      expect(festschreiben).not.toHaveClass('bg-accent');
      // Gesprochen wird nur auf Tipp: Beim Öffnen fragt niemand das Mikrofon.
      expect(aufnahme.mikrofon.anfragen).toEqual([]);

      await user.type(screen.getByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
      expect(festschreiben).toHaveClass('bg-accent');
      expect(screen.getByRole('button', { name: 'Sprechen' })).not.toHaveClass('bg-accent');
      expect(screen.getByRole('button', { name: 'Sprechen' })).toHaveClass('border-line-strong');
    });

    describe('mit Uhr', () => {
      beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it('zeigt während der Aufnahme Zeichen, Wort und Uhr und hält Festschreiben an', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        rendern();
        await user.click(await screen.findByRole('button', { name: 'Sprechen' }));

        const uhr = await screen.findByText('0:00');
        // Status als Zeichen und Wort, vorgelesen ohne jede Sekunde.
        expect(uhr.closest('[role="status"]')).toHaveTextContent('Aufnahme 0:00');
        expect(uhr).toHaveAttribute('aria-live', 'off');
        await act(() => vi.advanceTimersByTimeAsync(2100));
        expect(screen.getByText('0:02')).toBeInTheDocument();

        expect(screen.getByRole('button', { name: 'Fertig' })).toHaveClass('bg-accent');
        expect(screen.getByRole('button', { name: 'Festschreiben' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Festschreiben' })).not.toHaveClass('bg-accent');
        // Verwerfen nur mit Rückfrage; „Fertig“ steht allein (Praxis-Review).
        expect(screen.getByRole('button', { name: 'Verwerfen' })).toBeEnabled();
        expect(screen.queryByRole('button', { name: 'Abbrechen' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Sprechen' })).toBeNull();
      });

      it('verwirft eine laufende Aufnahme erst nach der Rückfrage', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        rendern();
        await user.click(await screen.findByRole('button', { name: 'Sprechen' }));
        await screen.findByText('0:00');

        // Der Fehltipp: Die Rückfrage geht auf, die Aufnahme läuft weiter.
        await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
        const frage = await screen.findByRole('button', { name: 'Ja, verwerfen' });
        await act(() => vi.advanceTimersByTimeAsync(2100));
        expect(screen.getByText('0:02')).toBeInTheDocument();
        expect(aufnahme.mikrofon.spuren[0]!.beendet).toBe(false);

        await user.click(frage);
        expect(await screen.findByRole('button', { name: 'Sprechen' })).toBeInTheDocument();
        expect(aufnahme.mikrofon.spuren[0]!.beendet).toBe(true);
        expect(diktatAufbereiten).not.toHaveBeenCalled();
      });

      // Eigene Frist: Tippen mit vorgestellter Uhr dauert auf einem geteilten
      // Rechner länger als die üblichen fünf Sekunden.
      it(
        'speichert den Vorschlag nie - erst die Übernahme macht Text daraus, der wie getippter gesichert wird',
        {
          timeout: 15_000,
        },
        async () => {
          const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
          rendern();
          const vorschlag = await diktieren(user);

          // Auch nach mehreren Pausen geht vom Vorschlag nichts auf den Server.
          await act(() => vi.advanceTimersByTimeAsync(3100 * 3));
          expect(createTreatmentNote).not.toHaveBeenCalled();
          expect(updateTreatmentNote).not.toHaveBeenCalled();

          await user.clear(vorschlag);
          await user.type(vorschlag, 'Befund{Enter}Keine Schwellung, Beugung 110 Grad.');
          await user.click(screen.getByRole('button', { name: 'In die Doku übernehmen' }));

          const feld = screen.getByLabelText('Eintrag zur Behandlung');
          expect(feld).toHaveValue('Befund\nKeine Schwellung, Beugung 110 Grad.');
          expect(
            screen.getByText('„Vorschlag aus der Aufnahme“ am Ende eingefügt.'),
          ).toBeInTheDocument();
          expect(screen.queryByLabelText('Text des Vorschlags')).toBeNull();

          await act(() => vi.advanceTimersByTimeAsync(3100));
          await waitFor(() =>
            expect(createTreatmentNote).toHaveBeenCalledWith(
              TERMIN_ID,
              'Befund\nKeine Schwellung, Beugung 110 Grad.',
            ),
          );
          expect(completeTreatment).not.toHaveBeenCalled();
        },
      );
    });

    it('bereitet nach „Fertig“ auf und zeigt den Vorschlag lesbar, prüfbar und korrigierbar', async () => {
      const user = userEvent.setup();
      rendern();
      const vorschlag = await diktieren(user);

      expect(diktatAufbereiten).toHaveBeenCalledTimes(1);
      const [anfrage] = diktatAufbereiten.mock.calls[0] as [
        { terminId: string; audio: Blob; dauerS: number },
      ];
      // Die Aufnahme gehört zum Termin dieser Seite (6.3).
      expect(anfrage.terminId).toBe(TERMIN_ID);
      expect(anfrage.audio).toBeInstanceOf(Blob);
      expect(anfrage.dauerS).toBeGreaterThanOrEqual(0);
      // Nach dem Stopp ist das Mikrofon frei.
      expect(aufnahme.mikrofon.spuren.every((spur) => spur.beendet)).toBe(true);

      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Vorschlag aus der Aufnahme – bitte prüfen',
        }),
      ).toBeInTheDocument();
      expect(vorschlag).toHaveValue(VORSCHLAGSTEXT);
      expect(vorschlag).toBeEnabled();
      expect(screen.getByText('1 Stelle unverständlich')).toBeInTheDocument();
      expect(screen.getByText(/Nachbildung ohne Spracherkennung/)).toBeInTheDocument();
      expect(screen.getByText('Wörtlich gesprochen')).toBeInTheDocument();
      expect(screen.getByText(VORSCHLAG.transkript)).toBeInTheDocument();
      expect(
        screen.getByText(/nur für diesen Vorschlag verarbeitet und nicht gespeichert/),
      ).toBeInTheDocument();
      // Das Feld bleibt leer, bis jemand übernimmt.
      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'In die Doku übernehmen' })).toHaveClass(
        'bg-accent',
      );
      expect(screen.getByRole('button', { name: 'Festschreiben' })).not.toHaveClass('bg-accent');

      // Korrigiert man die Stelle, zählt die Zeile mit.
      await user.clear(vorschlag);
      await user.type(vorschlag, 'Plan{Enter}Treppe üben.');
      expect(screen.queryByText(/Stelle unverständlich/)).toBeNull();
    });

    it('hängt den Vorschlag ans Ende und holt ihn mit „Rückgängig“ zurück', async () => {
      const user = userEvent.setup();
      rendern();
      const feld = await screen.findByLabelText('Eintrag zur Behandlung');
      await user.type(feld, 'Heute geübt.');
      await diktieren(user);
      await user.click(screen.getByRole('button', { name: 'In die Doku übernehmen' }));
      expect(feld).toHaveValue(`Heute geübt.\n\n${VORSCHLAGSTEXT}`);

      await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
      expect(feld).toHaveValue('Heute geübt.');
      expect(screen.getByLabelText('Text des Vorschlags')).toHaveValue(VORSCHLAGSTEXT);
    });

    it('verwirft den Vorschlag erst nach Rückfrage', async () => {
      const user = userEvent.setup();
      rendern();
      await diktieren(user);
      await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
      const frage = screen.getByRole('group', { name: 'Vorschlag aus der Aufnahme verwerfen' });
      await user.click(within(frage).getByRole('button', { name: 'Ja, verwerfen' }));

      expect(screen.queryByLabelText('Text des Vorschlags')).toBeNull();
      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Sprechen' })).toBeEnabled();
      expect(createTreatmentNote).not.toHaveBeenCalled();
    });

    it('schreibt nicht fest und speichert keinen Entwurf, solange der Vorschlag offen ist', async () => {
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
      await diktieren(user);

      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      expect(screen.getByText(DIKTAT_OFFEN)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Entwurf' }));
      expect(completeTreatment).not.toHaveBeenCalled();
      expect(createTreatmentNote).not.toHaveBeenCalled();
    });

    it('sagt bei einer Abweisung, was los ist - Tippen bleibt', async () => {
      diktatAufbereiten.mockResolvedValue({
        ok: false,
        fehler: 'forbidden',
        meldung: KI_FEHLERTEXTE.forbidden,
        erneutMoeglich: false,
      });
      const user = userEvent.setup();
      rendern();
      await user.click(await screen.findByRole('button', { name: 'Sprechen' }));
      await user.click(await screen.findByRole('button', { name: 'Fertig' }));

      expect(await screen.findByText(KI_FEHLERTEXTE.forbidden)).toBeInTheDocument();
      expect(screen.queryByLabelText('Text des Vorschlags')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Erneut senden' })).toBeNull();
      await user.type(screen.getByLabelText('Eintrag zur Behandlung'), 'Getippt.');
      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue('Getippt.');
    });

    it('bietet nach einem Ausfall „Erneut senden“ mit derselben Aufnahme an', async () => {
      diktatAufbereiten.mockResolvedValueOnce({
        ok: false,
        fehler: 'unavailable',
        meldung: KI_FEHLERTEXTE.unavailable,
        erneutMoeglich: true,
      });
      const user = userEvent.setup();
      rendern();
      await user.click(await screen.findByRole('button', { name: 'Sprechen' }));
      await user.click(await screen.findByRole('button', { name: 'Fertig' }));

      expect(await screen.findByText(/Die Aufnahme ist noch da/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Festschreiben' })).not.toHaveClass('bg-accent');
      await user.click(screen.getByRole('button', { name: 'Erneut senden' }));

      expect(await screen.findByLabelText('Text des Vorschlags')).toHaveValue(VORSCHLAGSTEXT);
      const [erste, zweite] = diktatAufbereiten.mock.calls as [
        [{ audio: Blob }],
        [{ audio: Blob }],
      ];
      expect(zweite[0].audio).toBe(erste[0].audio);
    });

    it('behält beim Abbrechen der Aufbereitung die Aufnahme für „Erneut senden“', async () => {
      let antworten: (wert: unknown) => void = () => undefined;
      diktatAufbereiten.mockImplementationOnce(() => new Promise((fertig) => (antworten = fertig)));
      const user = userEvent.setup();
      rendern();
      await user.click(await screen.findByRole('button', { name: 'Sprechen' }));
      await user.click(await screen.findByRole('button', { name: 'Fertig' }));
      await screen.findByText('Wird aufbereitet …');

      await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
      expect(
        await screen.findByText('Aufbereitung angehalten. Die Aufnahme ist noch da.'),
      ).toBeInTheDocument();
      // Die verspätete Antwort gehört zu niemandem mehr.
      antworten({ ok: true, vorschlag: VORSCHLAG });
      expect(screen.queryByLabelText('Text des Vorschlags')).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Erneut senden' }));
      expect(await screen.findByLabelText('Text des Vorschlags')).toHaveValue(VORSCHLAGSTEXT);
      const [erste, zweite] = diktatAufbereiten.mock.calls as [
        [{ audio: Blob }],
        [{ audio: Blob }],
      ];
      expect(zweite[0].audio).toBe(erste[0].audio);
    });

    describe('vor der Sitzungssperre (ADR-025 Punkt 4)', () => {
      /** Die Seite unter einer nachgebildeten Sperre; zurück kommen ihre Sicherungen. */
      function rendernMitSperre(): Set<Sicherung> {
        const angemeldet = new Set<Sicherung>();
        renderWithProviders(
          <SperrsicherungKontext.Provider
            value={{
              meldeAn: (sicherung) => {
                angemeldet.add(sicherung);
                return () => angemeldet.delete(sicherung);
              },
            }}
          >
            <CompleteTreatmentPage user={testUser(['therapist'])} />
          </SperrsicherungKontext.Provider>,
          `/termine/${TERMIN_ID}/abschluss`,
        );
        return angemeldet;
      }

      async function sperren(angemeldet: Set<Sicherung>): Promise<boolean[]> {
        let ergebnisse: boolean[] = [];
        await act(async () => {
          ergebnisse = await Promise.all([...angemeldet].map((sicherung) => sicherung()));
        });
        return ergebnisse;
      }

      it('hält eine laufende Aufnahme an und sendet sie erst nach der Freigabe', async () => {
        const user = userEvent.setup();
        const angemeldet = rendernMitSperre();
        await user.click(await screen.findByRole('button', { name: 'Sprechen' }));
        await screen.findByRole('button', { name: 'Fertig' });

        const ergebnisse = await sperren(angemeldet);

        // Nicht gesendet: Mit dem Token an der Frist käme sie als Abweisung
        // zurück und wäre verloren.
        expect(diktatAufbereiten).not.toHaveBeenCalled();
        expect(
          await screen.findByText(`${BEI_SPERRE_ANGEHALTEN} Die Aufnahme ist noch da.`),
        ).toBeInTheDocument();
        // Das Mikrofon ist aus, und die Seite bleibt verborgen stehen (ANN-257).
        expect(aufnahme.mikrofon.spuren.every((spur) => spur.beendet)).toBe(true);
        expect(ergebnisse).toContain(false);

        // Nach der Freigabe: dieselbe Aufnahme, ein Aufruf.
        await user.click(screen.getByRole('button', { name: 'Erneut senden' }));
        expect(await screen.findByLabelText('Text des Vorschlags')).toHaveValue(VORSCHLAGSTEXT);
        expect(diktatAufbereiten).toHaveBeenCalledTimes(1);
        const [anfrage] = diktatAufbereiten.mock.calls[0] as [{ audio: Blob }];
        expect(anfrage.audio.size).toBe(64);
      });

      it('bricht ab, wenn das Mikrofon noch gar nicht offen ist', async () => {
        aufnahme.mikrofon.halteAn();
        const user = userEvent.setup();
        const angemeldet = rendernMitSperre();
        await user.click(await screen.findByRole('button', { name: 'Sprechen' }));
        expect(await screen.findByText('Mikrofon wird geöffnet …')).toBeInTheDocument();

        await sperren(angemeldet);
        await act(async () => {
          aufnahme.mikrofon.gibFrei();
          await Promise.resolve();
        });

        expect(await screen.findByRole('button', { name: 'Sprechen' })).toBeEnabled();
        expect(screen.queryByText(BEI_SPERRE_ANGEHALTEN, { exact: false })).toBeNull();
        expect(aufnahme.mikrofon.spuren.every((spur) => spur.beendet)).toBe(true);
        expect(diktatAufbereiten).not.toHaveBeenCalled();
      });
    });

    it('hält Aufnahme, Ausfall und Vorschlag barrierefrei (axe)', { timeout: 30_000 }, async () => {
      diktatAufbereiten.mockResolvedValueOnce({
        ok: false,
        fehler: 'timeout',
        meldung: KI_FEHLERTEXTE.timeout,
        erneutMoeglich: true,
      });
      const user = userEvent.setup();
      const { container } = rendern();
      await user.click(await screen.findByRole('button', { name: 'Sprechen' }));
      await screen.findByRole('button', { name: 'Fertig' });
      // Die Uhr läuft weiter, während axe prüft.
      await act(() => pruefeBarrierefreiheit(container));

      await user.click(screen.getByRole('button', { name: 'Fertig' }));
      await screen.findByRole('button', { name: 'Erneut senden' });
      await pruefeBarrierefreiheit(container);

      await user.click(screen.getByRole('button', { name: 'Erneut senden' }));
      await screen.findByLabelText('Text des Vorschlags');
      await user.click(screen.getByText('Wörtlich gesprochen'));
      await pruefeBarrierefreiheit(container);
    });

    it('meldet ein verweigertes Mikrofon klar', async () => {
      aufnahme.mikrofon.verweigere('NotAllowedError');
      const user = userEvent.setup();
      rendern();
      await user.click(await screen.findByRole('button', { name: 'Sprechen' }));
      expect(await screen.findByText(AUFNAHMEFEHLER.verweigert)).toBeInTheDocument();
      expect(diktatAufbereiten).not.toHaveBeenCalled();
      // Nochmals möglich, aber nicht mehr als Hauptknopf: Der führte gerade ins Leere.
      expect(screen.getByRole('button', { name: 'Sprechen' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Sprechen' })).not.toHaveClass('bg-accent');
      expect(screen.getByRole('button', { name: 'Festschreiben' })).toHaveClass('bg-accent');
    });

    it('ist ohne Netz aus und lässt Festschreiben Hauptknopf', async () => {
      const verbunden = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      try {
        rendern();
        const sprechen = await screen.findByRole('button', { name: 'Sprechen' });
        expect(sprechen).toBeDisabled();
        expect(screen.getByText('Ohne Netz nicht verfügbar.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Festschreiben' })).toHaveClass('bg-accent');
      } finally {
        delete (navigator as { onLine?: boolean }).onLine;
        if (verbunden) expect(navigator.onLine).toBe(true);
      }
    });

    it('bietet „Sprechen“ nicht an, solange der Gateway das Diktat nicht meldet', async () => {
      diktatVerfuegbar.mockResolvedValue(false);
      rendern();
      const festschreiben = await screen.findByRole('button', { name: 'Festschreiben' });
      await waitFor(() => expect(diktatVerfuegbar).toHaveBeenCalledTimes(1));
      // Kein Knopf, der ins Leere führt - und „Festschreiben“ bleibt Hauptknopf.
      expect(screen.queryByRole('button', { name: 'Sprechen' })).toBeNull();
      expect(festschreiben).toHaveClass('bg-accent');
      expect(aufnahme.mikrofon.anfragen).toEqual([]);
    });

    it('bietet „Sprechen“ nicht an, wo die Seite das Mikrofon nicht öffnen darf', async () => {
      // So die Test-Umgebung: Permissions-Policy `microphone=()` (ADR-017 Punkt 33).
      Object.defineProperty(document, 'featurePolicy', {
        configurable: true,
        value: { allowsFeature: (funktion: string) => funktion !== 'microphone' },
      });
      try {
        rendern();
        const festschreiben = await screen.findByRole('button', { name: 'Festschreiben' });
        expect(screen.queryByRole('button', { name: 'Sprechen' })).toBeNull();
        expect(festschreiben).toHaveClass('bg-accent');
        // Gefragt wird der Gateway dann gar nicht erst.
        expect(diktatVerfuegbar).not.toHaveBeenCalled();
      } finally {
        delete (document as { featurePolicy?: unknown }).featurePolicy;
      }
    });

    it('sagt ohne Aufnahme im Browser, dass es hier nicht geht', async () => {
      aufnahme.entfernen();
      rendern();
      expect(await screen.findByRole('button', { name: 'Sprechen' })).toBeDisabled();
      expect(
        screen.getByText('Auf diesem Gerät nicht verfügbar – bitte tippen.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Festschreiben' })).toHaveClass('bg-accent');
    });

    it('bietet am Vermerk „ohne Behandlung“ kein Sprechen an', async () => {
      rendern(['therapist'], '?ohne-behandlung=1');
      expect(
        await screen.findByRole('button', { name: 'Mit Vermerk festschreiben' }),
      ).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Sprechen' })).toBeNull();
    });

    it('fragt beim Verlassen mit offenem Vorschlag nach - ohne „Speichern“, denn er wird nie gespeichert', async () => {
      const user = userEvent.setup();
      rendern();
      await diktieren(user);
      await user.click(screen.getByRole('link', { name: 'Zurück' }));

      const frage = await screen.findByRole('group', { name: 'Ungespeicherte Dokumentation' });
      expect(
        within(frage).getByText('Der Vorschlag aus der Aufnahme ist nicht übernommen.'),
      ).toBeInTheDocument();
      expect(within(frage).queryByRole('button', { name: 'Speichern und weiter' })).toBeNull();
      await user.click(within(frage).getByRole('button', { name: 'Weiterschreiben' }));
      expect(screen.getByLabelText('Text des Vorschlags')).toHaveValue(VORSCHLAGSTEXT);
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
