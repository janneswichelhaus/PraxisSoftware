import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from '@/features/patients/api';
import type * as PrescriptionsApi from '@/features/prescriptions/api';
import type * as FilesApi from '@/features/files/api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as Bausteine from '@/features/documentation/textbausteine';
import type * as KontoApi from '@/features/staff/konto-api';
import type * as AccountApi from '@/features/account/api';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from './barrierefreiheit';

/**
 * Automatische Barrierefreiheitsprüfung auf den Kernseiten (UI-000).
 *
 * Bewusst nicht auf allen Seiten: geprüft werden die Bausteine und die
 * Bildschirme, auf denen im Hausbesuch tatsächlich gearbeitet wird. Eine
 * Prüfung auf jeder Seite wäre langsamer und würde dasselbe mehrfach finden.
 *
 * Die Prüfung ersetzt die Oberflächen-Checkliste nicht — sie erwischt den
 * mechanisch prüfbaren Teil, damit die Checkliste sich auf das konzentrieren
 * kann, was nur ein Mensch beurteilt.
 */

/**
 * Der Patient ist je Fall verschieden: die meisten Pruefungen brauchen keinen,
 * die Terminserie und der Terminzettel schon. Deshalb eine Attrappe mit
 * Standardantwort statt einer festen.
 */
const fetchPatient = vi.fn<() => Promise<PatientsApi.Patient | null>>(() => Promise.resolve(null));

vi.mock('@/features/patients/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PatientsApi>()),
  fetchPatients: () => Promise.resolve([]),
  fetchPatient: () => fetchPatient(),
  logPatientRecordView: () => Promise.resolve(),
}));

vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesApi>()),
  fetchPatientFiles: () =>
    Promise.resolve([
      {
        id: 'd1',
        prescription_id: null,
        document_type: 'befund',
        is_clinical: true,
        display_name: 'Befund Schulter.pdf',
        mime_type: 'application/pdf',
        byte_size: 204_800,
        uploaded_at: '2026-09-13T08:00:00.000Z',
        uploaded_by_name: 'Anna Beispiel',
        object_missing: false,
      },
    ]),
}));

vi.mock('@/features/prescriptions/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PrescriptionsApi>()),
  fetchPrescribers: () => Promise.resolve([]),
  fetchPatientPrescriptions: () => Promise.resolve([]),
  fetchPatientPrescriptionsClinical: () => Promise.resolve([]),
}));

vi.mock('@/features/appointments/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  fetchAssignableTherapists: () =>
    Promise.resolve([{ staff_member_id: 'st-1', display_name: 'Anna Beispiel' }]),
  fetchLocations: () => Promise.resolve([{ id: 'ort-1', name: 'Hauptstandort' }]),
  fetchPrescriptionSlots: () =>
    Promise.resolve({
      patient_id: 'pat-1',
      frequency_note: '2x pro Woche',
      prescribed: 10,
      used: 0,
      planned: 0,
      remaining: 10,
    }),
  checkAppointmentSlots: (_staff: string, slots: { datum: string }[]) =>
    Promise.resolve(slots.map(() => null)),
  fetchAppointmentSlip: () =>
    Promise.resolve([
      {
        id: 'ter-1',
        starts_at: '2027-05-12T07:00:00.000Z',
        ends_at: '2027-05-12T08:00:00.000Z',
        appointment_type: 'home_visit' as const,
        location_name: null,
        staff_given_name: 'Anna',
        staff_family_name: 'Beispiel',
        organization_time_zone: 'Europe/Berlin',
      },
    ]),
}));

vi.mock('@/features/documentation/textbausteine', async (importOriginal) => ({
  ...(await importOriginal<typeof Bausteine>()),
  fetchTextSnippets: () =>
    Promise.resolve([
      {
        id: 'b1',
        title: 'Hausbesuch',
        body: 'Hausbesuch durchgefuehrt.',
        shared: true,
        editable: false,
      },
    ]),
}));

vi.mock('@/features/staff/konto-api', async (importOriginal) => ({
  ...(await importOriginal<typeof KontoApi>()),
  fetchStaffAccount: () =>
    Promise.resolve({
      staff_member_id: 's1',
      user_id: null,
      account_active: null,
      role_keys: null,
    }),
  fetchStaffInvitations: () => Promise.resolve([]),
}));

vi.mock('@/features/account/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AccountApi>()),
  ladeMfaFaktoren: () => Promise.resolve([]),
}));

const { PatientMasterDataFields } = await import('@/features/patients/PatientMasterDataFields');
const { PrescriptionFormFields } = await import('@/features/prescriptions/PrescriptionFormFields');
const { Verordnungsbereich } = await import('@/features/prescriptions/PatientPrescriptionsPage');
const { Dateienbereich } = await import('@/features/files/PatientFilesPage');
const { Rueckfrage } = await import('@/components/ui/Rueckfrage');
const { Section } = await import('@/components/ui/Section');
const { DetailList, DetailRow } = await import('@/components/ui/DetailList');
const { SearchField } = await import('@/components/ui/SearchField');
const { Verbindungsanzeige } = await import('@/app/Verbindungsanzeige');
const { SearchCombobox } = await import('@/components/ui/SearchCombobox');
const { Tageskarte } = await import('@/features/today/Tagesliste');
const { NavigationZumTermin } = await import('@/features/appointments/NavigationStarten');
const { TextbausteinLeiste } = await import('@/features/documentation/TextbausteinLeiste');
const { AppointmentSeriesPage } = await import('@/features/appointments/AppointmentSeriesPage');
const { AppointmentSlipPage } = await import('@/features/appointments/AppointmentSlipPage');
const { MitteilungVermerken } = await import('@/features/appointments/MitteilungVermerken');

/** Ein Hausbesuch mit allem, was die Tageskarte zeigen kann. */
const tagesEintrag = {
  id: 't1',
  patient_id: 'p1',
  staff_member_id: 's1',
  appointment_type: 'home_visit' as const,
  kind: 'treatment' as const,
  title: null,
  status: 'confirmed' as const,
  starts_at: '2027-05-12T07:00:00.000Z',
  ends_at: '2027-05-12T08:00:00.000Z',
  patient_given_name: 'Max',
  patient_family_name: 'Mustermann',
  location_name: null,
  visit_street: 'Beispielstrasse',
  visit_house_number: '12',
  visit_postal_code: '72070',
  visit_city: 'Tuebingen',
  patient_phone: '+49 7071 0000005',
  patient_phone_mobile: '+49 160 0000005',
  home_visit_access_note: '2. OG links, Klingel „Mustermann".',
  special_note: 'Hund im Flur.',
  documentation_status: 'none' as const,
  organization_time_zone: 'Europe/Berlin',
};

const leereStammdaten = {
  given_name: '',
  family_name: '',
  date_of_birth: '',
  email: '',
  phone: '',
  phone_work: '',
  phone_mobile: '',
  fax: '',
  institution: '',
  street: '',
  house_number: '',
  postal_code: '',
  city: '',
  primary_therapist_staff_member_id: '',
  home_visit_access_note: '',
  special_note: '',
  remark: '',
};

describe('Barrierefreiheit der Bausteine', () => {
  it('haelt Abschnitt, Angabenliste und Suchfeld sauber', async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Max Mustermann</h1>
        <Section titel="Kontakt">
          <DetailList>
            <DetailRow label="Mobil">+49 160 0000005</DetailRow>
          </DetailList>
        </Section>
        <SearchField placeholder="Name, Ort" value="" onChange={() => {}} />
      </main>,
    );
    await pruefeBarrierefreiheit(container);
  });

  it('haelt die Rueckfrage sauber - geschlossen und offen', async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Akte</h1>
        <Rueckfrage
          ausloeser="Als inaktiv markieren"
          bestaetigen="Als inaktiv markieren"
          fehler="Der Versorgungsstatus konnte nicht geändert werden."
          onBestaetigen={() => {}}
        >
          Diese Person wird als nicht in laufender Versorgung geführt.
        </Rueckfrage>
      </main>,
    );
    await pruefeBarrierefreiheit(container);
  });

  it('haelt die Verbindungsanzeige sauber', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { container } = renderWithProviders(<Verbindungsanzeige />);
    await pruefeBarrierefreiheit(container);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});

describe('Barrierefreiheit der Kernformulare', () => {
  it('haelt die Patientenstammdaten sauber, auch mit Feldfehlern', async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Stammdaten bearbeiten</h1>
        <form>
          <PatientMasterDataFields
            werte={leereStammdaten}
            fehler={{ family_name: 'Nachname ist erforderlich.' }}
            onChange={() => {}}
            therapeutinnen={[{ staff_member_id: 's1', display_name: 'Anna Beispiel' }]}
          />
        </form>
      </main>,
    );
    await pruefeBarrierefreiheit(container);
  });

  it('haelt das Verordnungsformular sauber', async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Verordnung erfassen</h1>
        <form>
          <PrescriptionFormFields
            werte={{
              prescriber_id: '',
              prescription_kind: 'first',
              issued_on: '',
              frequency_note: '',
              note: '',
              diagnosis: '',
              therapy_goal: '',
              prescriber_note: '',
              follow_up_recommendation: '',
            }}
            fehler={{ issued_on: 'Ausstellungsdatum ist erforderlich.' }}
            onChange={() => {}}
            positionen={[
              { id: null, remedy: '', prescribed_quantity: '', used_quantity: '0' },
              { id: null, remedy: '', prescribed_quantity: '', used_quantity: '0' },
            ]}
            positionsFehler={[{}, { remedy: 'Heilmittel ist erforderlich.' }]}
            onPositionChange={() => {}}
            onPositionHinzufuegen={() => {}}
            onPositionEntfernen={() => {}}
            verordnerinnen={[]}
            verordnerAnlegenZiel="/verordner/neu"
            onVerordnerAnlegenKlick={() => {}}
          />
        </form>
      </main>,
    );
    await pruefeBarrierefreiheit(container);
  });

  it('haelt die Verordnungen in der Akte sauber', async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Max Mustermann</h1>
        <Verordnungsbereich patient={testPatient()} user={testUser(['therapist'])} />
      </main>,
    );
    await pruefeBarrierefreiheit(container);
  });

  // Neu mit DAT-001: Dateifeld, Auswahl der Dokumentart und die Rueckfrage vor
  // dem Loeschen stehen dicht beieinander - genau die Mischung, bei der eine
  // fehlende Verknuepfung von Label und Fehlertext untergeht.
  it('haelt die Dateien der Akte sauber - Liste, Uploadfeld und Rueckfrage', async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Max Mustermann</h1>
        <Dateienbereich patientId="pat-1" user={testUser(['therapist'])} />
      </main>,
    );

    expect(await screen.findByText('Befund Schulter.pdf')).toBeInTheDocument();
    await pruefeBarrierefreiheit(container);

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await pruefeBarrierefreiheit(container);
  });
});

describe('Die Pruefung findet ueberhaupt etwas', () => {
  it('meldet ein Eingabefeld ohne Beschriftung', async () => {
    // Gegenprobe: ohne sie waeren alle Tests oben moeglicherweise gruen, weil
    // die Pruefung gar nicht laeuft.
    const { container } = renderWithProviders(
      <main>
        <input type="text" />
      </main>,
    );
    await expect(pruefeBarrierefreiheit(container)).rejects.toThrow(/label/i);
  });
});

describe('Barrierefreiheit der Hausbesuchsansichten (UX-EPIC-001)', () => {
  it('haelt die Tageskarte sauber - mit Anschrift, Waehlzielen und Aktionen', async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Guten Morgen, Anna</h1>
        <ul>
          <li>
            <Tageskarte
              termin={tagesEintrag}
              aktionen={<NavigationZumTermin termin={tagesEintrag} />}
            />
          </li>
        </ul>
      </main>,
    );
    await pruefeBarrierefreiheit(container);
  });

  it('haelt das Suchfeld mit Trefferliste sauber - offen und mit Zustandstext', async () => {
    const treffer = [
      { id: 'p1', bezeichnung: 'Max Mustermann', zusatz: 'geboren 30.04.1957' },
      { id: 'p2', bezeichnung: 'Erika Beispiel' },
    ];
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <main>
        <h1>Kalender</h1>
        <SearchCombobox
          label="Patient:in suchen"
          placeholder="Name suchen …"
          wert="mus"
          onChange={() => {}}
          treffer={treffer}
          onAuswahl={() => {}}
        />
      </main>,
    );

    // Erst mit dem Fokus oeffnet sich die Liste - genau der Zustand, der
    // geprueft werden soll.
    await user.click(screen.getByRole('combobox', { name: 'Patient:in suchen' }));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await pruefeBarrierefreiheit(container);
  });

  it('haelt die Bausteinleiste ueber dem Freitext sauber', async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Behandlung abschließen</h1>
        <TextbausteinLeiste onEinfuegen={() => {}} />
      </main>,
    );
    await screen.findByText('Textbausteine:');
    await pruefeBarrierefreiheit(container);
  });
});

// ---------------------------------------------------------------------------
// Zugaenge und eigenes Konto (STAFF-EPIC-002)
//
// Beide Seiten bestehen fast nur aus Formularen mit Kontrollkaestchen - genau
// das, was axe zuverlaessig prueft. Die Kontrollkaestchen sind dazu der einzige
// neue Baustein dieses Epics.
// ---------------------------------------------------------------------------
const { StaffAccountSection } = await import('@/features/staff/StaffAccountSection');
const { MeinKontoPage } = await import('@/features/account/MeinKontoPage');

describe('Barrierefreiheit der Zugangsverwaltung (STAFF-EPIC-002)', () => {
  it('haelt das Einladungsformular mit Rollenwahl sauber', async () => {
    const { container } = renderWithProviders(
      <StaffAccountSection
        staff={{
          id: 's1',
          person_id: 'p1',
          given_name: 'Nina',
          family_name: 'Neu',
          employment_status: 'active',
          work_email: 'nina.neu@praxis.invalid',
          work_phone: null,
          primary_location_id: null,
          primary_location_name: null,
          date_of_birth: null,
          private_email: null,
          private_phone: null,
          street: null,
          postal_code: null,
          city: null,
        }}
      />,
    );
    await screen.findByRole('button', { name: 'Zugang einladen' });
    await pruefeBarrierefreiheit(container);
  });

  it('haelt das eigene Konto mit Kennwortfeldern und Rueckfragen sauber', async () => {
    const { container } = renderWithProviders(<MeinKontoPage user={testUser(['owner'])} />);
    await screen.findByRole('button', { name: 'Zweiten Faktor einrichten' });
    await pruefeBarrierefreiheit(container);
  });
});

describe('Barrierefreiheit von Serie und Terminzettel (CAL-EPIC-003b)', () => {
  it('haelt die Serienseite sauber - Formular und geprüfte Liste', async () => {
    fetchPatient.mockResolvedValue(testPatient({ given_name: 'Max', family_name: 'Mustermann' }));
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      // Ueber eine echte Route, damit useParams die Kennungen sieht - ohne sie
      // bleibt die Seite im Ladezustand und die Pruefung findet nichts.
      <main>
        <Routes>
          <Route
            path="/patienten/:patientId/verordnungen/:prescriptionId/serie"
            element={<AppointmentSeriesPage user={testUser(['office'])} />}
          />
        </Routes>
      </main>,
      '/patienten/pat-1/verordnungen/ver-1/serie',
    );

    await screen.findByRole('button', { name: 'Termine vorschlagen' });
    await pruefeBarrierefreiheit(container);

    // Die Liste bringt je Zeile zwei weitere Felder und eine Schaltfläche -
    // genau dort entstehen Beschriftungen, die sich leicht doppeln.
    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), 'st-1');
    await user.type(screen.getByLabelText('Beginn *'), '09:00');
    await user.click(screen.getByRole('button', { name: 'Termine vorschlagen' }));
    await screen.findByLabelText('Datum 1');
    await pruefeBarrierefreiheit(container);
  });

  it('haelt die Mitteilungsauswahl am Termin sauber (CAL-012)', async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Termin</h1>
        <MitteilungVermerken
          appointment={{
            id: 'ter-1',
            patient_id: 'pat-1',
            kind: 'treatment',
            title: null,
            event_group_id: null,
            staff_member_id: 'st-1',
            location_id: null,
            appointment_type: 'home_visit',
            status: 'confirmed',
            starts_at: '2027-05-12T07:00:00.000Z',
            ends_at: '2027-05-12T08:00:00.000Z',
            updated_at: '2027-05-01T10:00:00.000000+00',
            visit_street: 'Testweg',
            visit_house_number: '7',
            visit_postal_code: '72072',
            visit_city: 'Tuebingen',
            completed_at: null,
            cancellation_reason: null,
            no_show_recorded_at: null,
            no_show_protocol_confirmed: null,
            cancellation_received_at: null,
            fee_basis: null,
            patient_given_name: 'Max',
            patient_family_name: 'Mustermann',
            staff_given_name: 'Anna',
            staff_family_name: 'Beispiel',
            location_name: null,
            notification_channels: ['phone'],
            organization_time_zone: 'Europe/Berlin',
          }}
        />
      </main>,
    );

    await screen.findByRole('button', { name: 'Vermerk speichern' });
    await pruefeBarrierefreiheit(container);
  });

  it('haelt den Terminzettel sauber - auch mit offenem Mailentwurf (CAL-013)', async () => {
    fetchPatient.mockResolvedValue(
      testPatient({
        given_name: 'Max',
        family_name: 'Mustermann',
        email: 'max@example.invalid',
      }),
    );
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <main>
        <Routes>
          <Route path="/patienten/:patientId/terminzettel" element={<AppointmentSlipPage />} />
        </Routes>
      </main>,
      '/patienten/pat-1/terminzettel',
    );

    await screen.findByRole('heading', { name: 'Ihre nächsten Termine' });
    await pruefeBarrierefreiheit(container);

    // Der Entwurf bringt eine zweite Überschrift und eine Beschreibungsliste
    // mit - genau dort entsteht leicht eine Sprungmarke in der Gliederung.
    await user.click(screen.getByRole('button', { name: 'Termine per E-Mail senden' }));
    await screen.findByRole('heading', { name: 'E-Mail an die Patient:in' });
    await pruefeBarrierefreiheit(container);
  });
});
