import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { morgenOrtszeit, renderWithProviders } from '@/test-utils';

const createPatient = vi.fn();
// PRX-015: ohne Angabe keine Dublette.
const findPossibleDuplicates = vi.fn(
  (_vorname: string, _nachname: string, _geburt: string | null) =>
    Promise.resolve([] as unknown[]),
);
const navigate = vi.fn();
const fetchAssignableTherapists = vi.fn();

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    createPatient: (values: unknown) => createPatient(values) as Promise<string>,
    findPossibleDuplicates: (vorname: string, nachname: string, geburt: string | null) =>
      findPossibleDuplicates(vorname, nachname, geburt) as Promise<PatientsApi.PatientSearchHit[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const { NewPatientPage } = await import('./NewPatientPage');

async function ausfuellen(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Vorname *'), '  Nora  ');
  await user.type(screen.getByLabelText('Nachname *'), 'Neuzugang');
  await user.type(screen.getByLabelText('Geburtsdatum *'), '1980-03-14');
}

describe('NewPatientPage', () => {
  beforeEach(() => {
    createPatient.mockReset();
    findPossibleDuplicates.mockReset().mockResolvedValue([]);
    navigate.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: '55555555-5555-4555-8555-000000000002', display_name: 'Anna Beispiel' },
    ]);
  });

  it('markiert Pflichtfelder und zeigt fehlende Angaben inline', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    expect(screen.getByLabelText('Vorname *')).toBeRequired();
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));

    expect(await screen.findAllByText('Vorname ist erforderlich.')).toHaveLength(2);
    expect(screen.getAllByText('Nachname ist erforderlich.')).toHaveLength(2);
    expect(screen.getAllByText('Geburtsdatum ist erforderlich.')).toHaveLength(2);
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('verbindet Fehlermeldung und Feld ueber aria-describedby', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));

    const feld = screen.getByLabelText('Vorname *');
    await waitFor(() => expect(feld).toHaveAttribute('aria-invalid', 'true'));
    const beschreibung = feld.getAttribute('aria-describedby');
    expect(beschreibung).toBeTruthy();
    expect(document.getElementById(beschreibung!)).toHaveTextContent('Vorname ist erforderlich.');
  });

  it('fuehrt aus der Fehlerzusammenfassung direkt ins Feld', async () => {
    // Die Stammdaten sind das laengste Formular der Anwendung: Ein Fehler im
    // Vornamen steht beim Absenden ausserhalb des Bildes (UX-012).
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveFocus();
    expect(kasten).toHaveTextContent('Vorname ist erforderlich.');
    expect(kasten).not.toHaveTextContent('Geburtsdatum: Geburtsdatum');

    await user.click(
      within(kasten).getByRole('link', { name: /^Geburtsdatum ist erforderlich\.$/ }),
    );
    expect(screen.getByLabelText('Geburtsdatum *')).toHaveFocus();
  });

  it('nimmt die korrigierte Angabe aus der Fehlerzusammenfassung heraus', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));
    await screen.findByRole('alert');

    await user.type(screen.getByLabelText('Vorname *'), 'Nora');

    await waitFor(() =>
      expect(screen.getByRole('alert')).not.toHaveTextContent('Vorname ist erforderlich.'),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Nachname ist erforderlich.');
  });

  it('lehnt ein Geburtsdatum in der Zukunft ab', async () => {
    const user = userEvent.setup();
    const morgen = morgenOrtszeit();
    renderWithProviders(<NewPatientPage />);

    await user.type(screen.getByLabelText('Vorname *'), 'Nora');
    await user.type(screen.getByLabelText('Nachname *'), 'Neuzugang');
    await user.type(screen.getByLabelText('Geburtsdatum *'), morgen);
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));

    expect(
      await screen.findAllByText('Das Geburtsdatum darf nicht in der Zukunft liegen.'),
    ).toHaveLength(2);
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('prueft die E-Mail nur, wenn sie angegeben ist', async () => {
    createPatient.mockResolvedValue('66666666-6666-4666-8666-0000000000aa');
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    await user.type(screen.getByLabelText('E-Mail'), 'kein-at-zeichen');
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));
    expect(await screen.findAllByText('Keine gültige E-Mail-Adresse.')).toHaveLength(2);
    expect(createPatient).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('E-Mail'));
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));
    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
  });

  it('trimmt Texte und sendet leere Optionalfelder als null', async () => {
    createPatient.mockResolvedValue('66666666-6666-4666-8666-0000000000bb');
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    await user.type(screen.getByLabelText('Ort'), '  Tuebingen  ');
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));

    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
    // Vollstaendig aufgezaehlt: ein neues Stammdatenfeld soll diesen Test
    // brechen, damit es nicht unbemerkt am Formular vorbeigeht.
    expect(createPatient).toHaveBeenCalledWith({
      given_name: 'Nora',
      family_name: 'Neuzugang',
      date_of_birth: '1980-03-14',
      email: null,
      phone: null,
      phone_work: null,
      phone_mobile: null,
      fax: null,
      institution: null,
      street: null,
      house_number: null,
      postal_code: null,
      city: 'Tuebingen',
      primary_therapist_staff_member_id: null,
      home_visit_access_note: null,
      special_note: null,
      remark: null,
    });
  });

  it('sendet weder Status noch Organisation noch IDs mit', async () => {
    createPatient.mockResolvedValue('66666666-6666-4666-8666-0000000000cc');
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));

    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
    const gesendet = Object.keys(createPatient.mock.calls[0]![0] as object);
    for (const verboten of ['status', 'organization_id', 'id', 'person_id', 'patient_id']) {
      expect(gesendet).not.toContain(verboten);
    }
  });

  // ---------------------------------------------------------------------------
  // UX-012: Aus einem laufenden Vorgang heraus anlegen - die Anlage fuehrt
  // dorthin zurueck und nimmt die neue Kennung mit.
  // ---------------------------------------------------------------------------
  it('kehrt mit der neuen Kennung in den laufenden Vorgang zurueck', async () => {
    createPatient.mockResolvedValue('66666666-6666-4666-8666-0000000000ee');
    const user = userEvent.setup();
    const vorgang = '/termine/neu?datum=2027-05-12&beginn=09%3A00';
    renderWithProviders(
      <NewPatientPage />,
      `/patienten/neu?zurueck=${encodeURIComponent(vorgang)}`,
    );

    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        `${vorgang}&patient=66666666-6666-4666-8666-0000000000ee`,
        { replace: true },
      ),
    );
  });

  // „Abbrechen" ist ein Link und kein Knopf mit navigate() (UIK-13): Mittelklick
  // und Vorlesesoftware behandeln ihn als das, was er ist.
  it('bricht in den laufenden Vorgang ab, ohne etwas anzulegen', () => {
    const vorgang = '/termine/neu?datum=2027-05-12';
    renderWithProviders(
      <NewPatientPage />,
      `/patienten/neu?zurueck=${encodeURIComponent(vorgang)}`,
    );

    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', vorgang);
    expect(screen.queryByRole('button', { name: 'Abbrechen' })).not.toBeInTheDocument();
    expect(createPatient).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // PAT-02: Eingaben gehen nicht still verloren. Ohne Entwurfszustand bietet
  // die Rückfrage nur Verwerfen und Bleiben an (ANN-046).
  // ---------------------------------------------------------------------------
  it('fragt vor dem Weggehen, wenn etwas eingegeben ist, und behält die Eingabe beim Bleiben', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />, '/patienten/neu');

    await user.type(screen.getByLabelText('Vorname *'), 'Nora');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

    const rueckfrage = await screen.findByRole('group', { name: 'Ungespeicherte Eingaben' });
    expect(rueckfrage).toHaveTextContent('Die Eingaben sind noch nicht gespeichert.');
    expect(
      within(rueckfrage).getByRole('button', { name: 'Verwerfen und weitergehen' }),
    ).toBeInTheDocument();
    // Einen Entwurf gibt es hier nicht - also auch kein „Speichern und weitergehen".
    expect(
      within(rueckfrage).queryByRole('button', { name: /Speichern und/ }),
    ).not.toBeInTheDocument();

    await user.click(within(rueckfrage).getByRole('button', { name: 'Hier bleiben' }));
    expect(
      screen.queryByRole('group', { name: 'Ungespeicherte Eingaben' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Vorname *')).toHaveValue('Nora');
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('warnt vor dem Neuladen nur, wenn etwas eingegeben ist', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />, '/patienten/neu');

    const leer = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leer);
    expect(leer.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText('Nachname *'), 'Neuzugang');
    const gefuellt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(gefuellt);
    expect(gefuellt.defaultPrevented).toBe(true);
  });

  it('navigiert nach erfolgreicher Anlage zur neuen Patientenakte', async () => {
    createPatient.mockResolvedValue('66666666-6666-4666-8666-0000000000dd');
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/patienten/66666666-6666-4666-8666-0000000000dd', {
        replace: true,
      }),
    );
  });

  it('legt bei doppeltem Absenden nur einen Patienten an', async () => {
    let aufloesen: ((id: string) => void) | undefined;
    createPatient.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          aufloesen = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    const knopf = screen.getByRole('button', { name: 'Patient:in anlegen' });
    await user.click(knopf);

    // Waehrend der Vorgang laeuft, ist die Aktion gesperrt.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Wird angelegt …' })).toBeDisabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Wird angelegt …' }));
    await user.click(screen.getByRole('button', { name: 'Wird angelegt …' }));

    expect(createPatient).toHaveBeenCalledTimes(1);
    aufloesen?.('66666666-6666-4666-8666-0000000000ee');
  });

  // PAT-03: Der Fehler steht als Fenster im Bild - am Telefon lag er sonst
  // rund 2000 px über dem Knopf. Danach steht der Fokus wieder am Knopf.
  it('zeigt bei einem Serverfehler eine verstaendliche Meldung ohne Details', async () => {
    createPatient.mockRejectedValue(new Error('not allowed to create patients'));
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));

    const fenster = await screen.findByRole('dialog', {
      name: 'Die Patient:in konnte nicht angelegt werden.',
    });
    const meldung = within(fenster).getByRole('alert');
    expect(meldung).toHaveTextContent('Die Eingaben stehen noch im Formular.');
    expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen');
    expect(fenster.textContent).not.toMatch(/not allowed|angemeldet/i);

    await user.click(within(fenster).getByRole('button', { name: 'Zurück zum Formular' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Patient:in anlegen' })).toHaveFocus();
    // Die Eingaben stehen noch da.
    expect(screen.getByLabelText('Nachname *')).toHaveValue('Neuzugang');
  });

  // ---------------------------------------------------------------------------
  // PAT-20: Die Auswahl der Therapeut:in sagt, was mit ihrer Liste ist.
  // ---------------------------------------------------------------------------
  it('zeigt beim Laden der Therapeut:innen „Wird geladen …" statt „Keine feste Zuordnung"', () => {
    fetchAssignableTherapists.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<NewPatientPage />);

    const auswahl = screen.getByLabelText('Feste Therapeut:in');
    expect(auswahl).toBeDisabled();
    expect(auswahl).toHaveDisplayValue('Wird geladen …');
  });

  it('sagt, wenn die Liste der Therapeut:innen fehlt', async () => {
    fetchAssignableTherapists.mockRejectedValue(new Error('offline'));
    renderWithProviders(<NewPatientPage />);

    expect(
      await screen.findByText(/Die Liste der Therapeut:innen ließ sich nicht laden/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Feste Therapeut:in')).toBeEnabled();
  });

  // PAT-12: Namen und Anschrift ohne Autokorrektur, das Geburtsdatum mit
  // Grenzen für den Wähler am Telefon.
  it('schützt Namen vor der Autokorrektur und begrenzt das Geburtsdatum', () => {
    renderWithProviders(<NewPatientPage />);

    for (const feld of ['Vorname *', 'Nachname *', 'Straße', 'Ort']) {
      const eingabe = screen.getByLabelText(feld);
      expect(eingabe).toHaveAttribute('spellcheck', 'false');
      expect(eingabe).toHaveAttribute('autocorrect', 'off');
      expect(eingabe).toHaveAttribute('autocapitalize', 'words');
    }
    const geburtsdatum = screen.getByLabelText('Geburtsdatum *');
    expect(geburtsdatum).toHaveAttribute('min', '1900-01-01');
    expect(geburtsdatum.getAttribute('max')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // PAT-07, PAT-15: Kontakt in der Reihenfolge der Anzeige, Freitexte mit
  // ihrer Grenze, derselbe Name für den Zugangshinweis.
  it('ordnet Kontakt wie die Anzeige und begrenzt die Freitexte', () => {
    renderWithProviders(<NewPatientPage />);

    const kontakt = [
      'Mobil',
      'Telefon (privat)',
      'Telefon (geschäftlich)',
      'Telefax',
      'E-Mail',
    ].map((feld) => screen.getByLabelText(feld));
    for (let i = 1; i < kontakt.length; i += 1) {
      expect(
        kontakt[i - 1]!.compareDocumentPosition(kontakt[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.getByLabelText('Zugangshinweis')).toHaveAttribute('maxlength', '1000');
    expect(screen.getByLabelText('Besonderheit')).toHaveAttribute('maxlength', '1000');
    expect(screen.getByLabelText('Bemerkung')).toHaveAttribute('maxlength', '2000');
    expect(
      screen.getByRole('heading', { name: 'Hausbesuch und Praxisangaben' }),
    ).toBeInTheDocument();
  });

  describe('Dublettenpruefung (PRX-015)', () => {
    const treffer = {
      id: '66666666-6666-4666-8666-000000000001',
      given_name: 'Nora',
      family_name: 'Neuzugang',
      date_of_birth: '1980-03-14',
      status: 'active' as const,
    };

    it('weist auf eine moegliche Dublette hin und legt erst beim zweiten Tipp an', async () => {
      findPossibleDuplicates.mockResolvedValueOnce([treffer]);
      createPatient.mockResolvedValue('neu');
      const user = userEvent.setup();
      renderWithProviders(<NewPatientPage />);

      await ausfuellen(user);
      await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));

      expect(await screen.findByText('Vielleicht schon in der Kartei')).toBeInTheDocument();
      expect(findPossibleDuplicates).toHaveBeenCalledWith('  Nora  ', 'Neuzugang', '1980-03-14');
      expect(screen.getByRole('link', { name: /Nora Neuzugang, geb\./ })).toHaveAttribute(
        'href',
        `/patienten/${treffer.id}?zurueck=%2Fpatienten`,
      );
      expect(createPatient).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));
      await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
      expect(findPossibleDuplicates).toHaveBeenCalledTimes(1);
    });

    it('prueft erneut, wenn sich der Name aendert', async () => {
      findPossibleDuplicates.mockResolvedValueOnce([treffer]);
      const user = userEvent.setup();
      renderWithProviders(<NewPatientPage />);

      await ausfuellen(user);
      await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));
      await screen.findByText('Vielleicht schon in der Kartei');
      await user.type(screen.getByLabelText('Nachname *'), 'x');
      expect(screen.queryByText('Vielleicht schon in der Kartei')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));
      await waitFor(() => expect(findPossibleDuplicates).toHaveBeenCalledTimes(2));
    });

    it('legt an, wenn die Pruefung scheitert - sie ist ein Hinweis, kein Tor', async () => {
      findPossibleDuplicates.mockRejectedValueOnce(new Error('offline'));
      createPatient.mockResolvedValue('neu');
      const user = userEvent.setup();
      renderWithProviders(<NewPatientPage />);
      await ausfuellen(user);
      await user.click(screen.getByRole('button', { name: 'Patient:in anlegen' }));
      await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
    });
  });
});
