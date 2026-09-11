import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from '@/features/patients/api';
import type * as PrescriptionsApi from '@/features/prescriptions/api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as Bausteine from '@/features/documentation/textbausteine';
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

vi.mock('@/features/patients/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PatientsApi>()),
  fetchPatients: () => Promise.resolve([]),
  fetchPatient: () => Promise.resolve(null),
  logPatientRecordView: () => Promise.resolve(),
}));

vi.mock('@/features/prescriptions/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PrescriptionsApi>()),
  fetchPrescribers: () => Promise.resolve([]),
  fetchPatientPrescriptions: () => Promise.resolve([]),
  fetchPatientPrescriptionsClinical: () => Promise.resolve([]),
}));

vi.mock('@/features/appointments/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  fetchAssignableTherapists: () => Promise.resolve([]),
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

const { PatientMasterDataFields } = await import('@/features/patients/PatientMasterDataFields');
const { PrescriptionFormFields } = await import('@/features/prescriptions/PrescriptionFormFields');
const { PatientPrescriptions } = await import('@/features/prescriptions/PatientPrescriptions');
const { Rueckfrage } = await import('@/components/ui/Rueckfrage');
const { Section } = await import('@/components/ui/Section');
const { DetailList, DetailRow } = await import('@/components/ui/DetailList');
const { SearchField } = await import('@/components/ui/SearchField');
const { Verbindungsanzeige } = await import('@/app/Verbindungsanzeige');
const { SearchCombobox } = await import('@/components/ui/SearchCombobox');
const { Tageskarte } = await import('@/features/today/Tagesliste');
const { NavigationZumTermin } = await import('@/features/appointments/NavigationStarten');
const { TextbausteinLeiste } = await import('@/features/documentation/TextbausteinLeiste');

/** Ein Hausbesuch mit allem, was die Tageskarte zeigen kann. */
const tagesEintrag = {
  id: 't1',
  patient_id: 'p1',
  staff_member_id: 's1',
  appointment_type: 'home_visit' as const,
  status: 'scheduled' as const,
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
        <PatientPrescriptions patient={testPatient()} user={testUser(['therapist'])} />
      </main>,
    );
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
