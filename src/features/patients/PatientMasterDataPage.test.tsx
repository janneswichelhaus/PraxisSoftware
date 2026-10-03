import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as ZugangApi from '@/features/platform-access/api';
import type * as VermerkeApi from '@/features/datenschutz/vermerke';
import type * as FilesApi from '@/features/files/api';
import type * as IntakeApi from '@/features/open-points/intake-api';
import type * as BillingApi from '@/features/billing/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const STAMMDATEN = `/patienten/${PATIENT_ID}/stammdaten`;

/** Ziel und mitgegebener Rückweg eines Links, getrennt geprüft. */
function linkZiel(link: HTMLElement): { pfad: string; zurueck: string | null } {
  const adresse = new URL(link.getAttribute('href') ?? '', 'http://akte.test');
  return { pfad: adresse.pathname, zurueck: adresse.searchParams.get('zurueck') };
}

const aktiv: PatientsApi.Patient = testPatient({
  id: PATIENT_ID,
  status: 'active',
  care_started_on: '2026-01-05',
  date_of_birth: '1985-07-19',
  email: 'max.mustermann@example.invalid',
  phone: '0221 1234567',
  street: 'Musterweg',
  house_number: '12b',
  postal_code: '72070',
  city: 'Tübingen',
});

const setPatientStatus = vi.fn();
const concludePatientCare = vi.fn();
const reopenPatientCare = vi.fn();
const setTreatmentTableRequired = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    setPatientStatus: (id: string, status: string) => setPatientStatus(id, status) as Promise<void>,
    concludePatientCare: (id: string, tag?: string) =>
      concludePatientCare(id, tag) as Promise<void>,
    reopenPatientCare: (id: string) => reopenPatientCare(id) as Promise<void>,
    setTreatmentTableRequired: (id: string, wert: boolean) =>
      setTreatmentTableRequired(id, wert) as Promise<void>,
  };
});

// Der Abschnitt „Plattform" hat eigene Tests (POR-002, POR-005); hier nur
// ohne Zugang und ohne Vertretung.
vi.mock('@/features/platform-access/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ZugangApi>()),
  getPlatformAccess: () => Promise.resolve(null),
  listPlatformRepresentations: () => Promise.resolve([]),
}));

// AKTE-007: Anmeldebogen und Dateien stehen jetzt hier; ihre Inhalte prüfen
// eigene Tests, hier nur, dass und für wen sie stehen.
const fetchDatenschutzvermerke = vi.fn();
vi.mock('@/features/datenschutz/vermerke', async (importOriginal) => ({
  ...(await importOriginal<typeof VermerkeApi>()),
  fetchDatenschutzvermerke: (id: string) =>
    fetchDatenschutzvermerke(id) as Promise<VermerkeApi.Datenschutzvermerk[]>,
}));
const fetchPatientFiles = vi.fn();
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesApi>()),
  fetchPatientFiles: (id: string) => fetchPatientFiles(id) as Promise<FilesApi.PatientFile[]>,
}));

// Akte entschlacken (2026-10-03): Zustand des Anmeldebogens und „Rechnung an".
const fetchIntakeChecklist = vi.fn();
vi.mock('@/features/open-points/intake-api', async (importOriginal) => ({
  ...(await importOriginal<typeof IntakeApi>()),
  fetchIntakeChecklist: (id: string) =>
    fetchIntakeChecklist(id) as Promise<IntakeApi.IntakeChecklist>,
}));
const fetchEmpfaenger = vi.fn();
vi.mock('@/features/billing/api', async (importOriginal) => ({
  ...(await importOriginal<typeof BillingApi>()),
  fetchEmpfaenger: (id: string) => fetchEmpfaenger(id) as Promise<BillingApi.Empfaenger[]>,
}));

const { Stammdaten } = await import('./PatientMasterDataPage');

/**
 * Die Fehlermeldung mit Text. Seit AKTE-007 steht in den Stammdaten auch das
 * Hinzufügen beim Anmeldebogen, und dessen Ansagebereich (`role="alert"`,
 * leer bis zur Ablehnung einer Datei) ist ständig da.
 */
async function meldung(text: RegExp): Promise<HTMLElement> {
  return waitFor(() => {
    const treffer = screen.getAllByRole('alert').find((el) => text.test(el.textContent ?? ''));
    if (!treffer) throw new Error(`Keine Meldung mit ${String(text)}`);
    return treffer;
  });
}

/**
 * Stammdaten und Verwaltung (AKTE-005).
 *
 * Inhaltlich derselbe Umfang wie vorher in der einseitigen Akte - geprüft wird
 * hier, dass er vollständig geblieben ist und dass die beiden Vorgänge mit
 * Rückfrage weiterhin nichts ohne zweiten Klick schreiben.
 */
describe('Stammdaten der Akte', () => {
  beforeEach(() => {
    setPatientStatus.mockReset();
    concludePatientCare.mockReset();
    reopenPatientCare.mockReset();
    setPatientStatus.mockResolvedValue(undefined);
    concludePatientCare.mockResolvedValue(undefined);
    reopenPatientCare.mockResolvedValue(undefined);
    fetchDatenschutzvermerke.mockReset().mockResolvedValue([]);
    fetchPatientFiles.mockReset().mockResolvedValue([]);
    fetchIntakeChecklist.mockReset().mockResolvedValue([]);
    fetchEmpfaenger.mockReset().mockResolvedValue([]);
  });

  describe('Karten (Akte entschlacken, 2026-10-03)', () => {
    it('zeigt den fehlenden Anmeldebogen mit Hinweis und Knopf zum Foto', async () => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
      fetchIntakeChecklist.mockResolvedValue([{ item: 'registration_form', state: 'open' }]);
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      const karte = (await screen.findByRole('heading', { name: 'Anmeldebogen' })).closest(
        'section',
      )!;
      expect(await within(karte).findByText('Fehlt')).toBeInTheDocument();
      expect(within(karte).getByText('Enthält die Datenschutzerklärung.')).toBeInTheDocument();
    });

    it('sagt „Liegt vor", sobald das Foto da ist', async () => {
      fetchIntakeChecklist.mockResolvedValue([{ item: 'registration_form', state: 'done' }]);
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);
      expect(await screen.findByText('Liegt vor')).toBeInTheDocument();
      expect(screen.queryByText('Fehlt')).toBeNull();
    });

    it('nennt dem Büro die Standard-Empfänger:in unter „Rechnung an"', async () => {
      fetchEmpfaenger.mockResolvedValue([
        {
          id: 'e1',
          recipient_kind: 'aid_authority',
          name: 'Beihilfestelle Fiktiv',
          street: 'Amtsweg',
          house_number: '3',
          postal_code: '70173',
          city: 'Stuttgart',
          reference: null,
          is_default: true,
        },
      ]);
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      expect(await screen.findByText('Beihilfestelle Fiktiv (Beihilfestelle)')).toBeInTheDocument();
      expect(screen.getByText('Amtsweg 3, 70173 Stuttgart')).toBeInTheDocument();
    });

    it('rechnet ohne Empfänger:in an die Person selbst, Anschrift wie Hausbesuch', async () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);
      const zeile = (await screen.findByText('Rechnung an')).nextElementSibling;
      expect(zeile).toHaveTextContent(`${aktiv.given_name} ${aktiv.family_name}`);
      expect(screen.getByText('wie Hausbesuch')).toBeInTheDocument();
    });

    it('fragt für die Behandlung keine Rechnungsempfänger ab', async () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);
      await screen.findByRole('heading', { name: 'Anmeldebogen' });
      expect(fetchEmpfaenger).not.toHaveBeenCalled();
      expect(screen.queryByText('Rechnung an')).toBeNull();
    });
  });

  describe('Anmeldebogen und Dateien (AKTE-007)', () => {
    it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
      'zeigt %s den Anmeldebogen als Foto unter einem Anker, die Einwilligungen darunter',
      async (role) => {
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
        renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);

        const titel = await screen.findByRole('heading', { name: 'Anmeldebogen' });
        const anker = titel.closest('#anmeldebogen');
        expect(anker).not.toBeNull();
        expect(
          within(anker as HTMLElement).getByLabelText('Anmeldebogen als Datei'),
        ).toBeInTheDocument();
        // ANN-227: keine Einzelvermerke mehr für Datenschutzinformation und Vertrag.
        expect(screen.queryByText('Datenschutzinformation')).toBeNull();
        expect(screen.queryByText('Behandlungsvertrag')).toBeNull();
        const einwilligungen = await screen.findByRole('heading', { name: 'Einwilligungen' });
        expect(einwilligungen.closest('#anmeldebogen')).toBeNull();
        expect(einwilligungen.closest('#einwilligungen')).not.toBeNull();
      },
    );

    it('zeigt einem Patientenkonto keinen Anmeldebogen und fragt nicht danach', () => {
      renderWithProviders(
        <Stammdaten patient={testPatient({ id: PATIENT_ID })} user={testUser(['patient'])} />,
      );
      expect(screen.queryByRole('heading', { name: 'Anmeldebogen' })).toBeNull();
      expect(fetchDatenschutzvermerke).not.toHaveBeenCalled();
      expect(fetchPatientFiles).not.toHaveBeenCalled();
    });

    it('legt Einwilligung und Vertrag zum Anmeldebogen, Unbekanntes unter „Sonstige Dateien"', async () => {
      const datei = (art: string, name: string): FilesApi.PatientFile => ({
        id: name,
        treatment_basis_id: null,
        document_type: art,
        is_clinical: false,
        display_name: name,
        mime_type: 'application/pdf',
        byte_size: 1024,
        uploaded_at: '2026-09-13T08:00:00.000Z',
        uploaded_by_name: 'Anna Beispiel',
        object_missing: false,
        verified_at: null,
      });
      fetchPatientFiles.mockResolvedValue([
        datei('vertrag', 'Vertrag unterschrieben.pdf'),
        datei('kuenftige_art', 'Unbekannt.pdf'),
        datei('befund', 'Befund.pdf'),
      ]);
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      const vertrag = await screen.findByText('Vertrag unterschrieben.pdf');
      expect(vertrag.closest('#anmeldebogen')).not.toBeNull();
      const sonstige = await screen.findByText('Unbekannt.pdf');
      expect(sonstige.closest('#anmeldebogen')).toBeNull();
      expect(screen.getByText('Sonstige Dateien')).toBeInTheDocument();
      // Der Befund gehört in die Doku.
      expect(screen.queryByText('Befund.pdf')).toBeNull();
    });
  });

  // Akte entschlacken (2026-10-03): Jede Karte führt ins Formular - mit
  // Rückweg in die Stammdaten samt dem der Akte (PAT-08).
  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'bietet %s an jeder Karte „Bearbeiten" an',
    (role) => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />, STAMMDATEN);

      for (const karte of ['Person', 'Kontakt', 'Hausbesuch']) {
        expect(linkZiel(screen.getByRole('link', { name: `${karte} bearbeiten` }))).toEqual({
          pfad: `/patienten/${PATIENT_ID}/bearbeiten`,
          zurueck: STAMMDATEN,
        });
      }
    },
  );

  it('zeigt Name, Geburtsdatum, Anschrift und Versorgungsbeginn - ohne Statuszeile', () => {
    renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

    expect(screen.getByText('Musterweg 12b, 72070 Tübingen')).toBeInTheDocument();
    expect(screen.getByText('05.01.2026')).toBeInTheDocument();
    expect(screen.getByText('Geboren')).toBeInTheDocument();
    expect(screen.getByText('19.07.1985')).toBeInTheDocument();
    // Der Kopf der Akte traegt - als Ausnahme - den Status; der Regelfall
    // „Aktiv" bekommt hier keine Zeile.
    expect(screen.queryByText('Aktiv')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  // UX-005e: Ein leerer Wert bekommt keine Zeile, ein Satz ersetzt vier
  // Gedankenstriche; die Kartenposition steht nur, solange sie fehlt.
  describe('leere Werte (UX-005e)', () => {
    it('laesst leere Kontaktwege weg und zeigt nur, was da ist', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      expect(screen.getByText('Telefon (privat)')).toBeInTheDocument();
      expect(screen.getByText('E-Mail')).toBeInTheDocument();
      expect(screen.queryByText('Mobil')).not.toBeInTheDocument();
      expect(screen.queryByText('—')).not.toBeInTheDocument();
      expect(screen.queryByText('Keine Kontaktdaten hinterlegt')).not.toBeInTheDocument();
    });

    it('sagt in einem Satz, wenn kein Kontaktweg hinterlegt ist', () => {
      renderWithProviders(
        <Stammdaten patient={testPatient({ id: PATIENT_ID })} user={testUser(['office'])} />,
      );

      expect(screen.getByText('Kontakt')).toBeInTheDocument();
      expect(screen.getByText('Keine Kontaktdaten hinterlegt')).toBeInTheDocument();
      expect(screen.queryByText('E-Mail')).not.toBeInTheDocument();
      expect(screen.queryByText('Adresse')).not.toBeInTheDocument();
    });

    it('zeigt die Kartenposition nur, solange die Adresse nicht verortet ist', () => {
      const { unmount } = renderWithProviders(
        <Stammdaten patient={aktiv} user={testUser(['office'])} />,
      );
      expect(screen.getByText('Kartenposition')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Adresse verorten' })).toBeInTheDocument();
      unmount();

      renderWithProviders(
        <Stammdaten
          patient={{ ...aktiv, geocode_precision: 'address' }}
          user={testUser(['office'])}
        />,
      );
      expect(screen.queryByText('Kartenposition')).not.toBeInTheDocument();
      expect(screen.queryByText(/Verortet/)).not.toBeInTheDocument();
    });

    it('laesst die Karte „Hausbesuch" weg, wenn sie keine Zeile haette', () => {
      renderWithProviders(
        <Stammdaten patient={testPatient({ id: PATIENT_ID })} user={testUser(['patient'])} />,
      );
      expect(screen.queryByText('Hausbesuch')).not.toBeInTheDocument();
    });

    it('schreibt keinen Protokollhinweis unter die Stammdaten', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['owner'])} />);
      expect(screen.queryByText(/werden protokolliert/)).not.toBeInTheDocument();
    });
  });

  describe('Hausbesuch und Praxisangaben (PAT-005)', () => {
    it('zeigt Etage, Zugang und Besonderheit im Hausbesuch, feste Therapeut:in und Bemerkung in der Praxis', () => {
      renderWithProviders(
        <Stammdaten
          patient={testPatient({
            id: PATIENT_ID,
            home_visit_access_note: '2. OG links, Klingel "Mustermann".',
            special_note: 'Hund im Flur.',
            primary_therapist_name: 'Anna Beispiel',
            remark: 'Bevorzugt Vormittage.',
          })}
          user={testUser(['office'])}
        />,
      );

      expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
      expect(screen.getByText('Bevorzugt Vormittage.')).toBeInTheDocument();
      // Seit 2026-10-03 trägt die Karte „Hausbesuch" sie; die Etage ist der
      // Anfang des Zugangshinweises (ANN-197).
      expect(screen.getByText('Etage').nextElementSibling).toHaveTextContent('2. OG links');
      expect(screen.getByText('Zugang').nextElementSibling).toHaveTextContent(
        'Klingel "Mustermann".',
      );
      expect(screen.getByText('Hund im Flur.')).toBeInTheDocument();
    });

    it('laesst den Abschnitt weg, wenn die Sicht nichts liefert', () => {
      // Fuer ein Patientenkonto sind die internen Angaben serverseitig leer
      // (ANN-010). Die Oberflaeche zeigt dann keinen leeren Abschnitt.
      renderWithProviders(
        <Stammdaten patient={testPatient({ id: PATIENT_ID })} user={testUser(['patient'])} />,
      );

      expect(screen.queryByText('Praxis')).not.toBeInTheDocument();
    });

    it('bietet die Mobilnummer als Anruf an', () => {
      renderWithProviders(
        <Stammdaten
          patient={testPatient({ id: PATIENT_ID, phone_mobile: '+49 160 0000005' })}
          user={testUser(['therapist'])}
        />,
      );

      const anruf = screen.getByRole('link', { name: '+49 160 0000005' });
      expect(anruf).toHaveAttribute('href', 'tel:+491600000005');
      // 44 px Tippziel und als Link erkennbar (PAT-11, RSP-05).
      expect(anruf).toHaveClass('min-h-11', 'underline');
    });

    it('bietet die E-Mail als Link mit Tippziel an', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      const mail = screen.getByRole('link', { name: 'max.mustermann@example.invalid' });
      expect(mail).toHaveAttribute('href', 'mailto:max.mustermann@example.invalid');
      expect(mail).toHaveClass('min-h-11', 'underline');
    });
  });

  describe('Dublette (PRX-018)', () => {
    it('zeigt owner den Weg, eine Dublette zu übernehmen', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['owner'])} />, STAMMDATEN);

      expect(linkZiel(screen.getByRole('link', { name: 'Dublette übernehmen' }))).toEqual({
        pfad: `/patienten/${aktiv.id}/dublette`,
        zurueck: STAMMDATEN,
      });
    });

    it.each([['therapist'], ['team_lead'], ['office']] as const)(
      'blendet ihn für %s aus',
      (role) => {
        renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);
        expect(screen.queryByRole('link', { name: 'Dublette übernehmen' })).toBeNull();
      },
    );
  });

  describe('Betroffenenrechte', () => {
    it('zeigt owner den Weg zu Auskunft und Loeschverlangen', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['owner'])} />, STAMMDATEN);

      expect(linkZiel(screen.getByRole('link', { name: 'Auskunft und Löschverlangen' }))).toEqual({
        pfad: `/patienten/${aktiv.id}/auskunft`,
        zurueck: STAMMDATEN,
      });
    });

    // UX-005e: Die übrigen Praxisrollen sehen den Abschnitt gar nicht - ein
    // Satz darüber, wer etwas darf, ist kein Inhalt der Akte.
    it.each([['therapist'], ['team_lead'], ['office']] as const)(
      'zeigt %s den Abschnitt nicht',
      (role) => {
        renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);

        expect(screen.queryByRole('link', { name: 'Auskunft und Löschverlangen' })).toBeNull();
        expect(screen.queryByText('Betroffenenrechte')).not.toBeInTheDocument();
        expect(screen.queryByText(/vorbehalten/)).not.toBeInTheDocument();
      },
    );

    it('sagt einem Patientenkonto dazu nichts', () => {
      renderWithProviders(
        <Stammdaten patient={testPatient({ id: PATIENT_ID })} user={testUser(['patient'])} />,
      );
      expect(screen.queryByText(/Löschverlangen/)).not.toBeInTheDocument();
    });
  });

  describe('Versorgungsstatus', () => {
    it.each([['owner'], ['team_lead'], ['office']] as const)('zeigt %s die Aktion', (role) => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);
      expect(screen.getByRole('button', { name: 'Als inaktiv markieren' })).toBeInTheDocument();
    });

    // UX-005e: Kein erklärender Satz unter „Verwaltung" - was ein Vorgang tut,
    // sagt seine Rückfrage.
    it('erklärt die Verwaltung nicht in einem Dauersatz', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['owner'])} />);
      expect(screen.getByText('Verwaltung')).toBeInTheDocument();
      expect(screen.queryByText(/rücknehmbar\./)).not.toBeInTheDocument();
      expect(screen.queryByText(/aus dem laufenden Betrieb/)).not.toBeInTheDocument();
    });

    it('blendet die Aktion fuer therapist aus, obwohl die Akte lesbar ist', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      expect(screen.getByText('Kontakt')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Als inaktiv markieren' }),
      ).not.toBeInTheDocument();
    });

    it('schreibt erst nach der Rueckfrage', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      await user.click(screen.getByRole('button', { name: 'Als inaktiv markieren' }));
      expect(setPatientStatus).not.toHaveBeenCalled();

      const buttons = screen.getAllByRole('button', { name: 'Als inaktiv markieren' });
      await user.click(buttons[buttons.length - 1]!);

      await waitFor(() => expect(setPatientStatus).toHaveBeenCalledWith(PATIENT_ID, 'inactive'));
    });

    it('verwirft die Rueckfrage bei Abbrechen ohne Schreibvorgang', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      await user.click(screen.getByRole('button', { name: 'Als inaktiv markieren' }));
      await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

      expect(setPatientStatus).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Abbrechen' })).not.toBeInTheDocument();
    });

    it('bietet einem inaktiven Datensatz die Reaktivierung an', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Stammdaten patient={{ ...aktiv, status: 'inactive' }} user={testUser(['office'])} />,
      );

      await user.click(screen.getByRole('button', { name: 'Wieder als aktiv führen' }));
      const buttons = screen.getAllByRole('button', { name: 'Wieder als aktiv führen' });
      await user.click(buttons[buttons.length - 1]!);

      await waitFor(() => expect(setPatientStatus).toHaveBeenCalledWith(PATIENT_ID, 'active'));
    });

    it('loest bei doppeltem Klick nur einen Schreibvorgang aus', async () => {
      const user = userEvent.setup();
      let aufloesen: () => void = () => undefined;
      setPatientStatus.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            aufloesen = resolve;
          }),
      );

      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);
      await user.click(screen.getByRole('button', { name: 'Als inaktiv markieren' }));
      const buttons = screen.getAllByRole('button', { name: 'Als inaktiv markieren' });
      await user.click(buttons[buttons.length - 1]!);

      const laufend = await screen.findByRole('button', { name: 'Wird geändert …' });
      await user.click(laufend);

      expect(setPatientStatus).toHaveBeenCalledTimes(1);

      aufloesen();
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Wird geändert …' })).not.toBeInTheDocument(),
      );
      expect(setPatientStatus).toHaveBeenCalledTimes(1);
    });

    it('meldet einen fehlgeschlagenen Statuswechsel ohne interne Details', async () => {
      const user = userEvent.setup();
      setPatientStatus.mockRejectedValue(new Error('boom'));
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      await user.click(screen.getByRole('button', { name: 'Als inaktiv markieren' }));
      const buttons = screen.getAllByRole('button', { name: 'Als inaktiv markieren' });
      await user.click(buttons[buttons.length - 1]!);

      expect(
        await screen.findByText('Der Versorgungsstatus konnte nicht geändert werden.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('boom')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Abschluss der Versorgung (LOE-001b)
  //
  // Der Vorgang startet die zehnjaehrige Aufbewahrung nach ADR-008. Geprueft
  // wird deshalb dreierlei: der Rollenschnitt (ohne office), dass nichts ohne
  // Rueckfrage geschrieben wird, und dass der Zustand als Text dasteht - nicht
  // nur als Abwesenheit einer Schaltflaeche.
  // ---------------------------------------------------------------------------
  describe('Abschluss der Versorgung', () => {
    const abgeschlossen = { ...aktiv, care_concluded_on: '2026-03-12' };

    it.each([['owner'], ['therapist'], ['team_lead']] as const)(
      'bietet %s den Abschluss an',
      (role) => {
        renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);
        expect(screen.getByRole('button', { name: 'Versorgung abschließen' })).toBeInTheDocument();
      },
    );

    it('bietet office den Abschluss nicht an', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      expect(
        screen.queryByRole('button', { name: 'Versorgung abschließen' }),
      ).not.toBeInTheDocument();
    });

    // UX-005e: Der Regelfall bekommt keine Zeile - die Zeile „Abschluss"
    // entsteht erst mit dem Abschluss.
    it('fuehrt bei laufender Versorgung keine Zeile „Abschluss"', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);
      expect(screen.getByText('Beginn')).toBeInTheDocument();
      expect(screen.queryByText('Abschluss')).not.toBeInTheDocument();
      expect(screen.queryByText('Laufende Versorgung')).not.toBeInTheDocument();
    });

    it('nennt Abschlusstag und Ende der Aufbewahrung als Text', () => {
      renderWithProviders(<Stammdaten patient={abgeschlossen} user={testUser(['therapist'])} />);

      expect(screen.getByText('Abschluss')).toBeInTheDocument();
      expect(screen.getByText(/12\.03\.2026 – Aufbewahrung bis 2036/)).toBeInTheDocument();
    });

    it('schreibt erst nach der Rueckfrage und mit dem gewaehlten Tag', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Versorgung abschließen' }));
      expect(concludePatientCare).not.toHaveBeenCalled();

      const feld = screen.getByLabelText('Letzter Behandlungstag');
      await user.clear(feld);
      await user.type(feld, '2026-09-01');

      const buttons = screen.getAllByRole('button', { name: 'Versorgung abschließen' });
      await user.click(buttons[buttons.length - 1]!);

      await waitFor(() =>
        expect(concludePatientCare).toHaveBeenCalledWith(PATIENT_ID, '2026-09-01'),
      );
    });

    // PAT-15: Der Wähler bietet keinen Tag vor dem Beginn der Versorgung an.
    it('begrenzt den letzten Behandlungstag auf die Zeit der Versorgung', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Versorgung abschließen' }));
      expect(screen.getByLabelText('Letzter Behandlungstag')).toHaveAttribute('min', '2026-01-05');
    });

    // WRT-10: Knopf und Laufanzeige nennen dieselbe Handlung.
    it('nennt beim Abschließen, was gerade geschieht', async () => {
      const user = userEvent.setup();
      concludePatientCare.mockImplementation(() => new Promise<void>(() => undefined));
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Versorgung abschließen' }));
      const kasten = screen.getByRole('group', { name: 'Versorgung abschließen' });
      await user.click(within(kasten).getByRole('button', { name: 'Versorgung abschließen' }));

      expect(await screen.findByRole('button', { name: 'Wird abgeschlossen …' })).toBeDisabled();
    });

    it('bietet einem abgeschlossenen Fall die Ruecknahme an', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={abgeschlossen} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Abschluss zurücknehmen' }));
      const buttons = screen.getAllByRole('button', { name: 'Abschluss zurücknehmen' });
      await user.click(buttons[buttons.length - 1]!);

      await waitFor(() => expect(reopenPatientCare).toHaveBeenCalledWith(PATIENT_ID));
      expect(concludePatientCare).not.toHaveBeenCalled();
    });

    it('meldet einen Fehler, ohne Erfolg vorzutaeuschen', async () => {
      const user = userEvent.setup();
      concludePatientCare.mockRejectedValue(new Error('abgelehnt'));
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Versorgung abschließen' }));
      const buttons = screen.getAllByRole('button', { name: 'Versorgung abschließen' });
      await user.click(buttons[buttons.length - 1]!);

      expect(await meldung(/konnte nicht gespeichert werden/)).toBeInTheDocument();
    });
  });

  describe('Behandlungsliege (UX-003a)', () => {
    beforeEach(() => {
      setTreatmentTableRequired.mockReset();
      setTreatmentTableRequired.mockResolvedValue(undefined);
    });

    it('setzt die Liege mit einem Tap, ohne Rueckfrage', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      expect(screen.getByText('Behandlungsliege')).toBeInTheDocument();
      // Seit PRX-013 ist „nein“ eine Entscheidung, kein Standard (ANN-143);
      // unentschieden stehen nur die beiden Handlungen da (UX-005e).
      expect(screen.queryByText('Noch nicht entschieden')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Liege nicht nötig' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Liege mitnehmen' }));

      await waitFor(() => expect(setTreatmentTableRequired).toHaveBeenCalledWith(PATIENT_ID, true));
    });

    it('haelt „nicht noetig“ als Entscheidung fest (PRX-013)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Liege nicht nötig' }));
      await waitFor(() =>
        expect(setTreatmentTableRequired).toHaveBeenCalledWith(PATIENT_ID, false),
      );
    });

    it('zeigt eine entschiedene „nein“-Liege mit dem Weg zum Umstellen', () => {
      renderWithProviders(
        <Stammdaten
          patient={{ ...aktiv, treatment_table_required: false }}
          user={testUser(['therapist'])}
        />,
      );
      expect(screen.getByText('Nicht nötig')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Liege mitnehmen' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Liege nicht nötig' })).toBeNull();
    });

    it('nimmt eine gesetzte Liege zurueck', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Stammdaten
          patient={{ ...aktiv, treatment_table_required: true }}
          user={testUser(['office'])}
        />,
      );

      expect(screen.getByText('Mitnehmen')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Liege nicht mehr mitnehmen' }));

      await waitFor(() =>
        expect(setTreatmentTableRequired).toHaveBeenCalledWith(PATIENT_ID, false),
      );
    });

    it('meldet einen Fehler als Text', async () => {
      const user = userEvent.setup();
      setTreatmentTableRequired.mockRejectedValue(new Error('abgelehnt'));
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Liege mitnehmen' }));
      expect(await meldung(/Behandlungsliege/)).toBeInTheDocument();
    });

    it('zeigt einem Patientenkonto weder Angabe noch Knopf', () => {
      renderWithProviders(
        <Stammdaten patient={testPatient({ id: PATIENT_ID })} user={testUser(['patient'])} />,
      );
      expect(screen.queryByText('Behandlungsliege')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Liege/ })).not.toBeInTheDocument();
    });
  });
});
