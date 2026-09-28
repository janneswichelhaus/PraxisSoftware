import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TreatmentBasesApi from './api';
import type * as RouterModul from 'react-router-dom';
import type * as SessionContextModule from '@/features/auth/sessionContext';
import { renderWithProviders } from '@/test-utils';

const PRESCRIBER_ID = '77777777-7777-4777-8777-000000000001';
const BENUTZER_ID = '11111111-1111-4111-8111-000000000002';

const fetchPrescriber = vi.fn();
const createPrescriber = vi.fn();
const updatePrescriber = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TreatmentBasesApi>();
  return {
    ...actual,
    fetchPrescriber: (id: string) =>
      fetchPrescriber(id) as Promise<TreatmentBasesApi.Prescriber | null>,
    createPrescriber: (values: unknown) => createPrescriber(values) as Promise<string>,
    updatePrescriber: (id: string, values: unknown) =>
      updatePrescriber(id, values) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ prescriberId: PRESCRIBER_ID }),
}));

// Der Entwurfsspeicher bindet an die Benutzer-ID aus der Sitzung (ANN-019) -
// ohne diesen Mock würde useSession() außerhalb eines SessionProvider werfen.
// Der echte Zusammenspiel-Test mit tatsächlicher Anmeldeperson lebt in
// TreatmentBasisFormPage.entwurf.test.tsx.
vi.mock('@/features/auth/sessionContext', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContextModule>();
  return {
    ...actual,
    useSession: () => ({
      session: { user: { id: BENUTZER_ID } },
      initialising: false,
      signOut: vi.fn(),
    }),
  };
});

const { EditPrescriberPage, NewPrescriberPage } = await import('./PrescriberFormPage');
const { VerordnerBereitsVorhanden } = await import('./api');

const bestand: TreatmentBasesApi.Prescriber = {
  id: PRESCRIBER_ID,
  title: 'Dr. med.',
  given_name: 'Petra',
  family_name: 'Probst',
  practice_name: 'Praxis Fiktiv',
  speciality: 'Orthopaedie',
  street: 'Aerztegasse',
  house_number: '3',
  postal_code: '72070',
  city: 'Tuebingen',
  phone: '+49 7071 0000401',
  fax: null,
  email: null,
};

const DOPPELT =
  'Diese Verordner:in gibt es schon. Praxis ergänzen oder die vorhandene in der Liste wählen.';

const SCHUTZ = 'Ungespeicherte Angaben zur Verordner:in';

// Hinweis zu den Navigationsfällen unten: Geprüft wird über Ziele (href), den
// Aufruf von `navigate` und angehaltene Seitenwechsel. Ein Seitenwechsel, der
// tatsächlich durchläuft, baut im Data Router unter Node 24 mit jsdom keinen
// `Request` (BEF-011) - die echten Wege über mehrere Seiten stehen in
// TreatmentBasisFormPage.entwurf.test.tsx.

describe('NewPrescriberPage', () => {
  beforeEach(() => {
    createPrescriber.mockReset();
    navigate.mockReset();
  });

  it('verlangt einen Nachnamen und schreibt ohne ihn nicht', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    // Am Feld und in der Fehlerzusammenfassung darüber (UIK-02).
    expect(await screen.findAllByText('Nachname ist erforderlich.')).toHaveLength(2);
    expect(createPrescriber).not.toHaveBeenCalled();
  });

  // UIK-02, ZST-11: Das Formular ist am Telefon länger als ein Bild. Der
  // Fehler am dritten Feld stand beim Absenden außerhalb, und nichts geschah.
  it('fuehrt aus der Fehlerzusammenfassung zum Feld', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveFocus();
    await user.click(within(kasten).getByRole('link', { name: 'Nachname ist erforderlich.' }));
    expect(screen.getByLabelText('Nachname *')).toHaveFocus();
  });

  it('setzt die Grenzen des Schemas an die Felder (VER-15)', () => {
    renderWithProviders(<NewPrescriberPage />);

    expect(screen.getByLabelText('Titel')).toHaveAttribute('maxLength', '60');
    expect(screen.getByLabelText('Nachname *')).toHaveAttribute('maxLength', '100');
    expect(screen.getByLabelText('PLZ')).toHaveAttribute('maxLength', '12');
    // Ohne Grenze im Schema auch keine am Feld.
    expect(screen.getByLabelText('Telefon')).not.toHaveAttribute('maxLength');
  });

  it('trimmt Texte und sendet leere Optionalfelder als null', async () => {
    createPrescriber.mockResolvedValue('neue-id');
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.type(screen.getByLabelText('Nachname *'), '  Probst  ');
    await user.type(screen.getByLabelText('Praxis oder Einrichtung'), 'Praxis Fiktiv');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    await waitFor(() => expect(createPrescriber).toHaveBeenCalledTimes(1));
    expect(createPrescriber).toHaveBeenCalledWith({
      family_name: 'Probst',
      given_name: null,
      title: null,
      practice_name: 'Praxis Fiktiv',
      speciality: null,
      street: null,
      house_number: null,
      postal_code: null,
      city: null,
      phone: null,
      fax: null,
      email: null,
    });
  });

  // VER-02: Die Dublette ist ein Feldfehler am Nachnamen und sagt, was zu tun
  // ist - kein Kasten am Formularanfang und kein Fenster.
  it('erklaert einen Doppeleintrag am Nachnamen, statt nur zu scheitern', async () => {
    createPrescriber.mockRejectedValue(new VerordnerBereitsVorhanden());
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.type(screen.getByLabelText('Nachname *'), 'Probst');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    expect(await screen.findByText(DOPPELT)).toBeInTheDocument();
    const kasten = screen.getByRole('alert');
    expect(kasten).toHaveTextContent(`Nachname: ${DOPPELT}`);
    await waitFor(() => expect(kasten).toHaveFocus());
    expect(screen.getByLabelText('Nachname *')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  // VER-02, ZST-10, ANN-058: Wer am Seitenende speichert, sieht einen Kasten
  // am Formularanfang nicht. Der Fehler kommt als Fenster, mit einem Satz,
  // was zu tun ist - und ohne Ratefrage nach der Anmeldung (WRT-01).
  it('zeigt einen Speicherfehler als Fenster und laesst die Eingaben stehen', async () => {
    createPrescriber.mockRejectedValue(new Error('Die Verordner:in konnte nicht angelegt werden.'));
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.type(screen.getByLabelText('Nachname *'), 'Probst');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    const fenster = await screen.findByRole('dialog', {
      name: 'Die Verordner:in konnte nicht gespeichert werden.',
    });
    expect(fenster).toHaveTextContent(
      'Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut speichern.',
    );
    expect(fenster).not.toHaveTextContent(/angemeldet/);

    await user.click(within(fenster).getByRole('button', { name: 'Zurück zum Formular' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nachname *')).toHaveValue('Probst');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('legt bei doppeltem Absenden nur einen Datensatz an', async () => {
    let aufloesen: (id: string) => void = () => {};
    createPrescriber.mockReturnValue(
      new Promise<string>((resolve) => {
        aufloesen = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.type(screen.getByLabelText('Nachname *'), 'Probst');
    const knopf = screen.getByRole('button', { name: 'Verordner:in anlegen' });
    await user.click(knopf);
    await user.click(knopf);

    expect(createPrescriber).toHaveBeenCalledTimes(1);
    aufloesen('neue-id');
  });

  it('sendet keine Organisation und keine IDs mit', async () => {
    createPrescriber.mockResolvedValue('neue-id');
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />);

    await user.type(screen.getByLabelText('Nachname *'), 'Probst');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    await waitFor(() => expect(createPrescriber).toHaveBeenCalledTimes(1));
    const gesendet = JSON.stringify(createPrescriber.mock.calls[0]?.[0]);
    expect(gesendet).not.toMatch(/organization/i);
    expect(gesendet).not.toMatch(/"id"/);
  });

  // Das Nachtragen der neuen Verordner:in in einen vorhandenen Entwurf des
  // Verordnungsformulars (VER-003) und der Fall ohne vorhandenen Entwurf sind
  // als Store-Verhalten in api.test.ts abgedeckt (entwurfVerordnerNachtragen)
  // und im echten Seitenwechsel in TreatmentBasisFormPage.entwurf.test.tsx.
});

// -----------------------------------------------------------------------------
// VER-11: Der Rückweg aus der Adresszeile ist eine Eingabe von außen. Er gilt
// nur als Pfad innerhalb der Anwendung - `//host` und `/\host` lesen Browser als
// fremde Adresse (offene Weiterleitung). Beides fällt auf die Kartei zurück: für
// den Rückweg oben, für „Abbrechen" und für den Weg nach dem Speichern.
// -----------------------------------------------------------------------------
describe('Rueckweg der Verordner-Anlage (VER-11)', () => {
  beforeEach(() => {
    createPrescriber.mockReset();
    createPrescriber.mockResolvedValue('neue-id');
    navigate.mockReset();
  });

  it.each([
    ['/\\host (Schrägstrich und Backslash)', '/%5Cexample.org/pfad'],
    ['//host (zwei Schrägstriche)', '//example.org/pfad'],
    ['//host, kodiert', '%2F%2Fexample.org'],
    ['/\\host, ganz kodiert', '%2F%5Cexample.org'],
    ['eine vollständige fremde Adresse', 'https%3A%2F%2Fexample.org'],
  ])('faellt bei %s auf die Kartei zurueck', async (_fall, roh) => {
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />, `/verordner/neu?zurueck=${roh}`);

    expect(screen.getByRole('link', { name: /Zurück zu den Verordner:innen/ })).toHaveAttribute(
      'href',
      '/verordner',
    );
    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', '/verordner');
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/example\.org/);
    }

    await user.type(screen.getByLabelText('Nachname *'), 'Probst');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/verordner', { replace: true }));
  });

  it('prueft auch beim Bearbeiten und faellt bei /\\host auf die Kartei zurueck', async () => {
    fetchPrescriber.mockReset();
    fetchPrescriber.mockResolvedValue(bestand);
    renderWithProviders(
      <EditPrescriberPage />,
      `/verordner/${PRESCRIBER_ID}/bearbeiten?zurueck=/%5Cexample.org`,
    );

    await screen.findByLabelText('Nachname *');
    expect(screen.getByRole('link', { name: /Zurück zu den Verordner:innen/ })).toHaveAttribute(
      'href',
      '/verordner',
    );
    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', '/verordner');
  });

  it('fuehrt aus dem Grundlagenformular dorthin zurueck und sagt es', async () => {
    const grundlage = '/patienten/p1/verordnungen/neu?vorgang=v1';
    const user = userEvent.setup();
    renderWithProviders(
      <NewPrescriberPage />,
      `/verordner/neu?zurueck=${encodeURIComponent(grundlage)}`,
    );

    expect(screen.getByRole('link', { name: /Zurück zur Grundlage/ })).toHaveAttribute(
      'href',
      grundlage,
    );
    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', grundlage);

    await user.type(screen.getByLabelText('Nachname *'), 'Probst');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(grundlage, { replace: true }));
  });

  it('benennt jeden anderen Rueckweg nach seinem Ziel', () => {
    // Die Kopfsuche öffnet die Anlage mit der Seite, auf der man war.
    renderWithProviders(
      <NewPrescriberPage />,
      `/verordner/neu?zurueck=${encodeURIComponent('/kalender?ansicht=woche')}`,
    );

    expect(screen.getByRole('link', { name: /Zurück zum Kalender/ })).toHaveAttribute(
      'href',
      '/kalender?ansicht=woche',
    );
  });
});

// -----------------------------------------------------------------------------
// VER-03, ANN-046: Zwölf Felder gingen beim Verlassen still verloren. Ohne
// Entwurfszustand bietet die Rückfrage nur Verwerfen und Bleiben an.
// -----------------------------------------------------------------------------
describe('Schutz ungespeicherter Angaben (VER-03)', () => {
  beforeEach(() => {
    navigate.mockReset();
  });

  it('fragt nach, bevor Abbrechen getippte Angaben verwirft', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />, '/verordner/neu');

    await user.type(screen.getByLabelText('Nachname *'), 'Probst');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

    const frage = await screen.findByRole('group', { name: SCHUTZ });
    expect(frage).toHaveTextContent(
      'Die Eingaben sind noch nicht gespeichert. Beim Weitergehen gehen sie verloren.',
    );
    expect(
      within(frage).getByRole('button', { name: 'Verwerfen und weitergehen' }),
    ).toBeInTheDocument();
    // Kein Entwurfszustand, also kein „Speichern und weitergehen".
    expect(within(frage).queryByRole('button', { name: /Speichern/ })).not.toBeInTheDocument();

    await user.click(within(frage).getByRole('button', { name: 'Hier bleiben' }));
    expect(screen.queryByRole('group', { name: SCHUTZ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nachname *')).toHaveValue('Probst');
  });

  it('haelt auch den Rueckweg oben an', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriberPage />, '/verordner/neu');

    await user.type(screen.getByLabelText('Ort'), 'Tuebingen');
    await user.click(screen.getByRole('link', { name: /Zurück zu den Verordner:innen/ }));

    expect(await screen.findByRole('group', { name: SCHUTZ })).toBeInTheDocument();
  });
});

describe('EditPrescriberPage', () => {
  beforeEach(() => {
    fetchPrescriber.mockReset();
    fetchPrescriber.mockResolvedValue(bestand);
    updatePrescriber.mockReset();
    updatePrescriber.mockResolvedValue(undefined);
    navigate.mockReset();
  });

  it('befuellt das Formular mit den aktuellen Werten', async () => {
    renderWithProviders(<EditPrescriberPage />);

    expect(await screen.findByLabelText('Nachname *')).toHaveValue('Probst');
    expect(screen.getByLabelText('Titel')).toHaveValue('Dr. med.');
    expect(screen.getByLabelText('Praxis oder Einrichtung')).toHaveValue('Praxis Fiktiv');
    expect(screen.getByLabelText('Telefax')).toHaveValue('');
  });

  it('speichert die Aenderung und kehrt zur Kartei zurueck', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditPrescriberPage />);
    await screen.findByLabelText('Nachname *');

    await user.type(screen.getByLabelText('Telefax'), '+49 7071 0000402');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updatePrescriber).toHaveBeenCalledTimes(1));
    expect(updatePrescriber.mock.calls[0]?.[0]).toBe(PRESCRIBER_ID);
    expect(updatePrescriber.mock.calls[0]?.[1]).toMatchObject({ fax: '+49 7071 0000402' });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/verordner', { replace: true }));
  });

  it('fragt nach einer Aenderung am Bestand nach', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditPrescriberPage />);
    await screen.findByLabelText('Nachname *');

    await user.type(screen.getByLabelText('Telefax'), '1');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

    expect(await screen.findByRole('group', { name: SCHUTZ })).toBeInTheDocument();
  });

  // VER-15, WRT-02: Ohne Formular bleibt der Weg zurück und ein Satz, was zu
  // tun ist - und der Gegenstand heißt beim Namen statt „Datensatz".
  it('zeigt einen unzugaenglichen Datensatz nicht als Formular, aber mit Rueckweg', async () => {
    fetchPrescriber.mockResolvedValue(null);
    renderWithProviders(<EditPrescriberPage />);

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(
      screen.getByText(/Diese Verordner:in gibt es nicht oder sie ist für Ihren Zugang/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Datensatz/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nachname *')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Verordner:in bearbeiten' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zurück zu den Verordner:innen/ })).toHaveAttribute(
      'href',
      '/verordner',
    );
  });

  it('bietet nach einem Ladefehler einen neuen Versuch an (WRT-01)', async () => {
    fetchPrescriber.mockRejectedValueOnce(new Error('interne Ursache'));
    const user = userEvent.setup();
    renderWithProviders(<EditPrescriberPage />);

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveTextContent('Die Verordner:in konnte nicht geladen werden.');
    expect(kasten).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
    expect(kasten).not.toHaveTextContent(/interne Ursache|angemeldet/);

    await user.click(within(kasten).getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByLabelText('Nachname *')).toHaveValue('Probst');
  });
});
