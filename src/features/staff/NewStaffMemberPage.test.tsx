import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type * as StaffApi from './api';
import type * as KontoApi from './konto-api';
import type * as FleetApi from '@/features/fleet/api';
import type * as SchedulingApi from '@/features/scheduling/api';
import type * as RouterModul from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testFlotte } from '@/features/fleet/testdaten';
import { renderWithProviders, testUser } from '@/test-utils';

const NEU = '55555555-5555-4555-8555-0000000000aa';

const createStaffMember = vi.fn<(werte: unknown, privat?: boolean) => Promise<string>>();
const setzeKalender = vi.fn<(id: string, kalender: unknown) => Promise<void>>();
const saveWorkingHours =
  vi.fn<(id: string, tag: number, bloecke: SchedulingApi.Zeitblock[]) => Promise<void>>();
const fetchFleet = vi.fn<() => Promise<FleetApi.Fleet>>();
const takeKey = vi.fn<(radId: string, staffId: string | null) => Promise<void>>();
const ladeZugangEin =
  vi.fn<(id: string, email: string, rollen: readonly string[]) => Promise<KontoApi.Zustellung>>();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    createStaffMember: (values: StaffApi.StaffMasterDataValues, privat?: boolean) =>
      createStaffMember(values, privat),
    setzeKalender: (id: string, kalender: { behandlung: boolean; training: boolean }) =>
      setzeKalender(id, kalender),
  };
});

vi.mock('./konto-api', async (importOriginal) => {
  const actual = await importOriginal<typeof KontoApi>();
  return {
    ...actual,
    ladeZugangEin: (id: string, email: string, rollen: readonly string[]) =>
      ladeZugangEin(id, email, rollen),
  };
});

vi.mock('@/features/scheduling/api', async (importOriginal) => {
  const actual = await importOriginal<typeof SchedulingApi>();
  return {
    ...actual,
    saveWorkingHours: (id: string, tag: number, bloecke: SchedulingApi.Zeitblock[]) =>
      saveWorkingHours(id, tag, bloecke),
  };
});

vi.mock('@/features/fleet/api', async (importOriginal) => {
  const actual = await importOriginal<typeof FleetApi>();
  return {
    ...actual,
    fetchFleet: () => fetchFleet(),
    takeKey: (radId: string, staffId: string | null) => takeKey(radId, staffId),
  };
});

// Aufgezeichnet und ausgeführt: Die Tests sehen, wohin es geht, und der Schutz
// der Formulare sieht den Weg hinaus wie in der Anwendung.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModul>();
  return {
    ...actual,
    useNavigate: () => {
      const echt = actual.useNavigate();
      return (...argumente: Parameters<RouterModul.NavigateFunction>) => {
        navigate(...argumente);
        return echt(...(argumente as [RouterModul.To, RouterModul.NavigateOptions?]));
      };
    },
  };
});

const { NewStaffMemberPage } = await import('./NewStaffMemberPage');

/** Das Fenster des Ablaufs; es heißt nach der Frage der Seite. */
function fenster(frage: string | RegExp) {
  return screen.getByRole('dialog', { name: frage });
}

/** Nach jedem Seitenwechsel nimmt die Seite kurz keinen Tipp an (`TIPPSPERRE_MS`). */
async function bereit<E extends HTMLElement>(element: E): Promise<E> {
  await waitFor(() => expect(element.closest('.pointer-events-none')).toBeNull(), {
    timeout: 2000,
  });
  return element;
}

/** Tipps zählen wie in `kernablaeufe.md` - getippter Text zählt nicht. */
function zaehler(nutzer: UserEvent) {
  let tipps = 0;
  return {
    async tippe(element: HTMLElement) {
      await bereit(element);
      tipps += 1;
      await nutzer.click(element);
    },
    get tipps() {
      return tipps;
    },
  };
}

async function personEintragen(
  nutzer: UserEvent,
  { vorname = 'Nina', nachname = 'Neu', email = '' } = {},
) {
  if (vorname) await nutzer.type(await bereit(screen.getByLabelText('Vorname *')), vorname);
  if (nachname) await nutzer.type(screen.getByLabelText('Nachname *'), nachname);
  if (email) await nutzer.type(screen.getByLabelText('Dienstliche E-Mail'), email);
}

// Die Tests gehen ganze Abläufe mit Tippsperre durch; unter Last reichen 5 s nicht.
describe('NewStaffMemberPage: Neue:n Mitarbeiter:in einrichten (G5)', { timeout: 30_000 }, () => {
  beforeEach(() => {
    for (const attrappe of [
      createStaffMember,
      setzeKalender,
      saveWorkingHours,
      fetchFleet,
      takeKey,
      ladeZugangEin,
      navigate,
    ]) {
      attrappe.mockReset();
    }
    createStaffMember.mockResolvedValue(NEU);
    setzeKalender.mockResolvedValue(undefined);
    saveWorkingHours.mockResolvedValue(undefined);
    fetchFleet.mockResolvedValue(testFlotte());
    takeKey.mockResolvedValue(undefined);
    ladeZugangEin.mockResolvedValue('gesendet');
  });

  // ---------------------------------------------------------------------------
  // Erste Seite: Name und Kontakt, dieselbe Prüfung wie in den Stammdaten
  // ---------------------------------------------------------------------------
  it('verlangt Vor- und Nachname, bevor es weitergeht', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    const seite = fenster('Wer kommt ins Team?');
    expect(within(seite).getByText('Schritt 1 von 6')).toBeInTheDocument();
    expect(within(seite).queryByRole('button', { name: '← Zurück' })).toBeNull();
    await nutzer.click(within(seite).getByRole('button', { name: 'Weiter' }));

    expect(await screen.findByText('Vorname ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Nachname ist erforderlich.')).toBeInTheDocument();
    expect(fenster('Wer kommt ins Team?')).toBeInTheDocument();
    expect(createStaffMember).not.toHaveBeenCalled();
  });

  it('führt bei einem Fehler ins erste Feld, in dem er steht', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await personEintragen(nutzer, { nachname: '' });
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));

    const feld = screen.getByLabelText('Nachname *');
    expect(feld).toHaveFocus();
    expect(feld).toHaveAccessibleDescription('Nachname ist erforderlich.');
  });

  it('weist eine unbrauchbare E-Mail-Adresse ab', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await personEintragen(nutzer, { email: 'keine-adresse' });
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(await screen.findByText('Keine gültige E-Mail-Adresse.')).toBeInTheDocument();
    expect(screen.getByLabelText('Dienstliche E-Mail')).toHaveFocus();
    expect(fenster('Wer kommt ins Team?')).toBeInTheDocument();
  });

  it('fragt keine Privatangaben ab - auch nicht für die Inhaber:in (ANN-024)', async () => {
    // Privates und Hauptstandort bleiben dem Bearbeiten vorbehalten; das Büro
    // sieht sie dort gar nicht erst.
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['office'])} />);

    expect(screen.queryByLabelText('Private E-Mail')).toBeNull();
    expect(screen.queryByLabelText('Geburtsdatum')).toBeNull();
    expect(screen.queryByLabelText('Hauptstandort')).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    const seite = fenster('Wer kommt ins Team?');
    expect(seite).toHaveTextContent('Vorname ist erforderlich.');
    expect(seite).not.toHaveTextContent('Private E-Mail');
    await pruefeBarrierefreiheit(document.body);
  });

  // ---------------------------------------------------------------------------
  // Inhaber:in: alle sechs Seiten
  // ---------------------------------------------------------------------------
  it('richtet als Inhaber:in in sieben Tipps ein: anlegen, Wochenplan, Schlüssel, Einladung', async () => {
    const nutzer = userEvent.setup();
    const z = zaehler(nutzer);
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await personEintragen(nutzer, { email: 'nina.neu@praxis.invalid' });
    await z.tippe(screen.getByRole('button', { name: 'Weiter' }));

    // Rolle: keine vorgewählt; was sie darf, steht an ihr, sobald sie gewählt ist.
    const rolle = fenster('Welche Rolle?');
    expect(within(rolle).getByText('Schritt 2 von 6')).toBeInTheDocument();
    for (const kaestchen of within(rolle).getAllByRole('checkbox')) {
      expect(kaestchen).not.toBeChecked();
    }
    expect(within(rolle).queryByText(/Behandelt, dokumentiert/)).toBeNull();
    await z.tippe(within(rolle).getByLabelText('Therapeut:in'));
    expect(within(rolle).getByLabelText('Therapeut:in')).toHaveAccessibleDescription(
      'Behandelt, dokumentiert, sieht alle Akten der Praxis.',
    );
    await z.tippe(within(rolle).getByRole('button', { name: 'Weiter' }));

    // Wochenplan aus der Vorlage - ein Tipp wählt.
    const zeit = fenster('Wann arbeitet Nina?');
    expect(within(zeit).getByRole('button', { name: /^Teilzeit drei Tage/ })).toHaveTextContent(
      'Mo, Mi, Do 8:00–12:30 und 13:00–16:30',
    );
    await z.tippe(within(zeit).getByRole('button', { name: /^Vollzeit/ }));

    // Gesperrte und entnommene Räder stehen nicht zur Wahl.
    const rad = fenster('Fährt Nina ein Lastenrad?');
    expect(within(rad).queryByRole('button', { name: /^Lastenrad 3/ })).toBeNull();
    await z.tippe(await within(rad).findByRole('button', { name: /^Lastenrad 4/ }));

    // Einladung: die dienstliche Adresse vorbelegt, änderbar.
    const zugang = fenster('Zugang einladen?');
    expect(within(zugang).getByLabelText('E-Mail-Adresse für den Zugang')).toHaveValue(
      'nina.neu@praxis.invalid',
    );
    expect(zugang).toHaveTextContent('noch kein Konto');
    await z.tippe(within(zugang).getByRole('button', { name: 'Einladung senden' }));

    // Abschluss: je Angabe eine Zeile mit „Ändern“; noch ist nichts geschrieben.
    const abschluss = fenster('Alles richtig?');
    expect(createStaffMember).not.toHaveBeenCalled();
    const angaben = within(abschluss).getByRole('list', { name: 'Angaben' });
    expect(angaben).toHaveTextContent('Nina Neu');
    expect(angaben).toHaveTextContent('Therapeut:in');
    expect(angaben).toHaveTextContent('Vollzeit: Mo–Fr 8:00–12:30 und 13:00–16:30');
    expect(angaben).toHaveTextContent('Steht damit im Kalender für Behandlungen');
    expect(angaben).toHaveTextContent('Schlüssel von Lastenrad 4');
    expect(angaben).toHaveTextContent('Einladung an nina.neu@praxis.invalid');
    for (const was of ['Name und Kontakt', 'Rolle', 'Arbeitszeiten', 'Lastenrad', 'Zugang']) {
      expect(within(abschluss).getByRole('button', { name: `${was} ändern` })).toBeInTheDocument();
    }
    // Das Stammrad teilt die Inhaber:in am Rad zu - hier nur als offener Punkt.
    expect(within(abschluss).getByRole('list', { name: 'Danach noch offen' })).toHaveTextContent(
      'Stammrad',
    );
    await pruefeBarrierefreiheit(document.body);
    await z.tippe(within(abschluss).getByRole('button', { name: 'Nina einrichten' }));

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(createStaffMember).toHaveBeenCalledTimes(1);
    expect(createStaffMember.mock.calls[0]?.[0]).toMatchObject({
      given_name: 'Nina',
      family_name: 'Neu',
      work_email: 'nina.neu@praxis.invalid',
      // Leere Optionalfelder gehen als null, nicht als leerer Text.
      work_phone: null,
      primary_location_id: null,
      date_of_birth: null,
    });
    // Erst in den Kalender, dann der Wochenplan je Tag, dann Schlüssel und Einladung.
    expect(setzeKalender).toHaveBeenCalledWith(NEU, { behandlung: true, training: false });
    expect(saveWorkingHours.mock.calls.map(([, tag]) => tag)).toEqual([1, 2, 3, 4, 5]);
    expect(saveWorkingHours).toHaveBeenCalledWith(NEU, 1, [
      { von: '08:00', bis: '12:30' },
      { von: '13:00', bis: '16:30' },
    ]);
    expect(setzeKalender.mock.invocationCallOrder[0]!).toBeLessThan(
      saveWorkingHours.mock.invocationCallOrder[0]!,
    );
    expect(takeKey).toHaveBeenCalledWith('rad-4', NEU);
    expect(ladeZugangEin).toHaveBeenCalledWith(NEU, 'nina.neu@praxis.invalid', ['therapist']);
    expect(navigate).toHaveBeenCalledWith(`/praxis/team/${NEU}`, {
      replace: true,
      state: { meldung: 'Nina Neu ist eingerichtet.' },
    });
    // G5: ≤ 8 Tipps + Felder (Spec Überholung 6); der Einstieg „Anlegen“ zählt dazu.
    expect(z.tipps).toBe(7);
  });

  it('lässt mit „Später“ bei der Rolle die Einladung weg', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await personEintragen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Später' })));
    // Ohne Rolle fünf Schritte: Die Einladung fällt weg.
    expect(within(fenster('Wann arbeitet Nina?')).getByText('Schritt 3 von 5')).toBeInTheDocument();
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Später festlegen' })));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Kein Rad' })));

    const abschluss = fenster('Alles richtig?');
    expect(within(abschluss).getByRole('list', { name: 'Angaben' })).toHaveTextContent('Kein Rad');
    expect(within(abschluss).queryByRole('button', { name: 'Zugang ändern' })).toBeNull();
    await nutzer.click(
      await bereit(within(abschluss).getByRole('button', { name: 'Nina einrichten' })),
    );

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(setzeKalender).not.toHaveBeenCalled();
    expect(saveWorkingHours).not.toHaveBeenCalled();
    expect(takeKey).not.toHaveBeenCalled();
    expect(ladeZugangEin).not.toHaveBeenCalled();
  });

  it('verlangt eine Rolle für „Weiter“ und geht mit „← Zurück“ zurück, ohne Eingaben zu verlieren', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await personEintragen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    const rolle = fenster('Welche Rolle?');
    await nutzer.click(await bereit(within(rolle).getByRole('button', { name: 'Weiter' })));
    expect(within(rolle).getByText('Bitte mindestens eine Rolle wählen.')).toBeInTheDocument();
    expect(within(rolle).getByLabelText('Therapeut:in')).toHaveFocus();

    await nutzer.click(within(rolle).getByRole('button', { name: '← Zurück' }));
    expect(await bereit(screen.getByLabelText('Vorname *'))).toHaveValue('Nina');
  });

  it('verwirft beim Zurückgehen, was auf der Seite nicht mit „Weiter“ bestätigt war', async () => {
    // Wie beim Check-Up: Erst „Weiter“ macht eine Antwort zur Antwort.
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await personEintragen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(await bereit(screen.getByLabelText('Teamleitung')));
    await nutzer.click(screen.getByRole('button', { name: '← Zurück' }));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Weiter' })));

    expect(await bereit(screen.getByLabelText('Teamleitung'))).not.toBeChecked();
    expect(screen.queryByText(/Arbeitszeiten pflegen/)).toBeNull();
  });

  it('führt aus dem Abschluss zur neuen Frage, wenn eine andere Rolle sie aufwirft', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await personEintragen(nutzer, { email: 'nina.neu@praxis.invalid' });
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Später' })));
    await nutzer.click(await bereit(screen.getByRole('button', { name: /^Teilzeit vormittags/ })));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Kein Rad' })));

    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Rolle ändern' })));
    await nutzer.click(await bereit(screen.getByLabelText('Teamleitung')));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    // Mit Rolle gibt es die Einladung - erst sie, dann zurück zum Abschluss.
    const zugang = fenster('Zugang einladen?');
    await nutzer.click(
      await bereit(within(zugang).getByRole('button', { name: 'Einladung senden' })),
    );
    const abschluss = fenster('Alles richtig?');
    const angaben = within(abschluss).getByRole('list', { name: 'Angaben' });
    expect(angaben).toHaveTextContent('Teamleitung');
    expect(angaben).toHaveTextContent('Teilzeit vormittags');
    expect(angaben).toHaveTextContent('Einladung an nina.neu@praxis.invalid');
  });

  // ---------------------------------------------------------------------------
  // Büro: ohne Rolle, ohne Einladung, ohne Wochenplan
  // ---------------------------------------------------------------------------
  it('führt das Büro über drei Seiten und nennt, was die Inhaber:in danach tut', async () => {
    const nutzer = userEvent.setup();
    const z = zaehler(nutzer);
    renderWithProviders(<NewStaffMemberPage user={testUser(['office'], 'Olivia Office')} />);

    expect(within(fenster('Wer kommt ins Team?')).getByText('Schritt 1 von 3')).toBeInTheDocument();
    await personEintragen(nutzer);
    await z.tippe(screen.getByRole('button', { name: 'Weiter' }));
    const rad = fenster('Fährt Nina ein Lastenrad?');
    expect(within(rad).getByText('Schritt 2 von 3')).toBeInTheDocument();
    await z.tippe(await within(rad).findByRole('button', { name: /^Lastenrad 1/ }));

    const abschluss = fenster('Alles richtig?');
    expect(within(abschluss).queryByRole('button', { name: 'Rolle ändern' })).toBeNull();
    const offen = within(abschluss).getByRole('list', { name: 'Danach noch offen' });
    expect(offen).toHaveTextContent('Lädt die Inhaber:in ein');
    expect(offen).toHaveTextContent('Sobald die Inhaber:in die Person in den Kalender nimmt');
    expect(offen).toHaveTextContent('Teilt die Inhaber:in am Rad zu');
    await z.tippe(within(abschluss).getByRole('button', { name: 'Nina einrichten' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/praxis/team/${NEU}`, expect.anything()),
    );
    // office schickt keine Privatangaben mit (ANN-024).
    expect(createStaffMember.mock.calls[0]?.[1]).toBe(false);
    expect(takeKey).toHaveBeenCalledWith('rad-1', NEU);
    expect(setzeKalender).not.toHaveBeenCalled();
    expect(saveWorkingHours).not.toHaveBeenCalled();
    expect(ladeZugangEin).not.toHaveBeenCalled();
    expect(z.tipps).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Was scheitert, steht da - nichts wird still übersprungen
  // ---------------------------------------------------------------------------
  it('zeigt nach einem gescheiterten Schritt, was erledigt ist und was fehlt, mit dem Weg dorthin', async () => {
    takeKey.mockRejectedValue(
      new Error('Der Schlüssel ist schon entnommen. Bitte die Liste neu laden.'),
    );
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await personEintragen(nutzer, { email: 'nina.neu@praxis.invalid' });
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(await bereit(screen.getByLabelText('Therapeut:in')));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(await bereit(screen.getByRole('button', { name: /^Vollzeit/ })));
    await nutzer.click(await bereit(await screen.findByRole('button', { name: /^Lastenrad 4/ })));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Einladung senden' })));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Nina einrichten' })));

    const ergebnis = await screen.findByRole('dialog', { name: 'Nina Neu ist angelegt' });
    expect(navigate).not.toHaveBeenCalled();
    const schritte = within(ergebnis).getByRole('list', { name: 'Schritte' });
    const zeilen = within(schritte).getAllByRole('listitem');
    expect(zeilen.map((zeile) => zeile.textContent)).toEqual([
      expect.stringContaining('Arbeitszeiten✓erledigt'),
      expect.stringContaining('Lastenrad×fehltDer Schlüssel ist schon entnommen.'),
      expect.stringContaining('Stammrad!offen'),
      expect.stringContaining('Zugang✓erledigt'),
    ]);
    expect(
      within(ergebnis).getByRole('link', { name: 'Lastenrad: Schlüssel eintragen' }),
    ).toHaveAttribute('href', '/betrieb/flotte/schluessel?rad=rad-4');
    expect(within(ergebnis).getByRole('link', { name: 'Stammrad: Zum Rad' })).toHaveAttribute(
      'href',
      '/betrieb/flotte/rad/rad-4?bereich=angaben',
    );
    expect(within(ergebnis).getByRole('link', { name: 'Arbeitszeiten: Planung' })).toHaveAttribute(
      'href',
      `/praxis/planung?person=${NEU}`,
    );
    expect(within(ergebnis).getByRole('link', { name: 'Zur Mitarbeiterseite' })).toHaveAttribute(
      'href',
      `/praxis/team/${NEU}`,
    );
    // Die Einladung lief trotzdem - jeder Schritt für sich.
    expect(ladeZugangEin).toHaveBeenCalledTimes(1);
    await pruefeBarrierefreiheit(document.body);

    // Angelegt ist angelegt: Weggehen fragt nicht mehr.
    const leer = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leer);
    expect(leer.defaultPrevented).toBe(false);
  });

  it('bleibt bei der Ergebnisseite, wenn die Anmeldemail nicht hinausging', async () => {
    ladeZugangEin.mockResolvedValue('kein_konto');
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await personEintragen(nutzer, { email: 'nina.neu@praxis.invalid' });
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(await bereit(screen.getByLabelText('Praxismanagement')));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    // Praxismanagement behandelt nicht: kein Wochenplan, kein Rad.
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Einladung senden' })));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Nina einrichten' })));

    const ergebnis = await screen.findByRole('dialog', { name: 'Nina Neu ist angelegt' });
    expect(within(ergebnis).getByRole('list', { name: 'Schritte' })).toHaveTextContent(
      'Zugang!offenEingeladen, die Anmeldemail ging nicht hinaus',
    );
    expect(ergebnis).toHaveTextContent(
      'Zu nina.neu@praxis.invalid gibt es beim Anmeldedienst noch kein Konto.',
    );
    expect(within(ergebnis).getByRole('link', { name: 'Zugang: Öffnen' })).toHaveAttribute(
      'href',
      `/praxis/team/${NEU}?bereich=zugang`,
    );
    expect(setzeKalender).not.toHaveBeenCalled();
    expect(takeKey).not.toHaveBeenCalled();
  });

  it('meldet ein gescheitertes Anlegen im Fenster, ohne Details preiszugeben (ORG-15)', async () => {
    // Bis UXR-011 stand der Fehler oben im Formular, am Telefon rund 1000 px
    // ueber dem Knopf und ohne Fokus.
    createStaffMember.mockRejectedValue(new Error('irgendetwas aus der Datenbank'));
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['office'])} />);

    await personEintragen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Kein Rad' })));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Nina einrichten' })));

    const meldung = await screen.findByRole('dialog', {
      name: 'Die Mitarbeiter:in konnte nicht angelegt werden.',
    });
    expect(meldung).toHaveTextContent('Es ist nichts gespeichert, die Angaben stehen noch da.');
    expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
    expect(screen.queryByText(/irgendetwas aus der Datenbank/)).not.toBeInTheDocument();
    expect(takeKey).not.toHaveBeenCalled();

    await nutzer.click(screen.getByRole('button', { name: 'Zurück zum Abschluss' }));
    expect(
      screen.queryByRole('dialog', { name: 'Die Mitarbeiter:in konnte nicht angelegt werden.' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nina einrichten' })).toHaveFocus();
    expect(navigate).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // ORG-03, ZST-05: Eingaben gehen nicht still verloren. Ohne Entwurfszustand
  // bietet die Rückfrage nur Verwerfen und Bleiben an (ANN-046).
  // ---------------------------------------------------------------------------
  it('fragt vor dem Abbrechen, wenn etwas eingegeben ist, und behält die Eingabe beim Bleiben', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['office'])} />, '/praxis/team/neu');

    await nutzer.type(screen.getByLabelText('Vorname *'), 'Nora');
    await nutzer.click(screen.getByRole('button', { name: 'Einrichten abbrechen' }));

    const rueckfrage = await screen.findByRole('group', { name: 'Ungespeicherte Eingaben' });
    expect(
      within(rueckfrage).getByRole('button', { name: 'Verwerfen und weitergehen' }),
    ).toBeInTheDocument();
    expect(
      within(rueckfrage).queryByRole('button', { name: /Speichern und/ }),
    ).not.toBeInTheDocument();

    await nutzer.click(within(rueckfrage).getByRole('button', { name: 'Hier bleiben' }));
    expect(screen.getByLabelText('Vorname *')).toHaveValue('Nora');
    expect(createStaffMember).not.toHaveBeenCalled();
  });

  it('warnt vor dem Neuladen nur, wenn etwas eingegeben ist', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />, '/praxis/team/neu');

    const leer = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leer);
    expect(leer.defaultPrevented).toBe(false);

    await nutzer.type(screen.getByLabelText('Nachname *'), 'Neu');
    const gefuellt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(gefuellt);
    expect(gefuellt.defaultPrevented).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // ORG-24: Der Rückweg reist mit
  // ---------------------------------------------------------------------------
  it('führt mit ✕ dorthin zurück, woher die Anlage kam (ORG-24)', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <NewStaffMemberPage user={testUser(['owner'])} />,
      `/praxis/team/neu?zurueck=${encodeURIComponent('/kalender?ansicht=woche')}`,
    );

    await nutzer.click(screen.getByRole('button', { name: 'Einrichten abbrechen' }));
    expect(navigate).toHaveBeenCalledWith('/kalender?ansicht=woche');
  });

  it('nimmt den Rückweg nach dem Einrichten in den neuen Datensatz mit (ORG-24)', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <NewStaffMemberPage user={testUser(['office'])} />,
      `/praxis/team/neu?zurueck=${encodeURIComponent('/kalender')}`,
    );

    await personEintragen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Später' })));
    await nutzer.click(await bereit(screen.getByRole('button', { name: 'Nina einrichten' })));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        `/praxis/team/${NEU}?zurueck=${encodeURIComponent('/kalender')}`,
        { replace: true, state: { meldung: 'Nina Neu ist eingerichtet.' } },
      ),
    );
  });
});
