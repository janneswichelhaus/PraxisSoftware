import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import * as api from './api';
import { BreakdownPage } from './BreakdownPage';
import { Zielanzeige } from './Testbausteine';
import { testDetail, testFlotte, testRad } from './testdaten';
import { rendereSeite } from './testseite';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleet: vi.fn(),
  fetchBike: vi.fn(),
  recordBreakdown: vi.fn(),
  uploadFleetPhoto: vi.fn(),
}));

// Die Kamera gibt es in jsdom nicht: Der Stellvertreter löst mit einem Tipp aus.
vi.mock('@/features/files/Kameradialog', () => ({
  Kameradialog: ({ titel, onAufnahme }: { titel: string; onAufnahme: (foto: Blob) => void }) => (
    <div role="group" aria-label={`Kamera: ${titel}`}>
      <button type="button" onClick={() => onAufnahme(new Blob([titel], { type: 'image/jpeg' }))}>
        Auslösen
      </button>
    </div>
  ),
}));

const fetchFleet = vi.mocked(api.fetchFleet);
const fetchBike = vi.mocked(api.fetchBike);
const recordBreakdown = vi.mocked(api.recordBreakdown);
const uploadFleetPhoto = vi.mocked(api.uploadFleetPhoto);

const RAD = testRad();

function oeffne(pfad = `/betrieb/flotte/panne?rad=${RAD.id}`) {
  return rendereSeite(
    '/betrieb/flotte/panne',
    <BreakdownPage user={testUser(['therapist'])} />,
    pfad,
  );
}

/**
 * Wie `oeffne`, aber mit der Radwahl davor im Verlauf und dem Router in der
 * Hand: So drückt ein Test das Zurück des Browsers - am Telefon die Geste.
 */
function oeffneMitVerlauf() {
  const router = createMemoryRouter(
    [
      { path: '/betrieb/flotte/panne', element: <BreakdownPage user={testUser(['therapist'])} /> },
      { path: '*', element: <Zielanzeige /> },
    ],
    {
      initialEntries: ['/betrieb/flotte/panne', `/betrieb/flotte/panne?rad=${RAD.id}`],
      initialIndex: 1,
    },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** Das Fenster der Panne; sein Name ist die Frage der Seite. */
function fenster(name: string | RegExp) {
  return screen.findByRole('dialog', { name });
}

/** „Wo ist der Schaden?“: das Bauteil aus der Liste wählen. */
async function waehleBauteil(nutzer: ReturnType<typeof userEvent.setup>, zone: string) {
  const schaden = within(await fenster('Wo ist der Schaden?'));
  await nutzer.selectOptions(schaden.getByRole('combobox', { name: 'Bauteil' }), zone);
}

/** Antwortet in der Reihenfolge, Seite für Seite. */
async function antworte(nutzer: ReturnType<typeof userEvent.setup>, ...antworten: string[]) {
  for (const antwort of antworten) {
    const seite = screen.getByRole('dialog');
    await nutzer.click(within(seite).getByRole('button', { name: antwort }));
  }
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  fetchFleet.mockResolvedValue(testFlotte());
  fetchBike.mockResolvedValue(
    testDetail({ bike: RAD, spots: [], checkups: [], breakdowns: [], blocks: [] }),
  );
  recordBreakdown.mockResolvedValue({
    breakdownId: 'panne-neu',
    spotIds: ['stelle-neu'],
    blocked: false,
  });
  uploadFleetPhoto.mockResolvedValue('foto-neu');
  let nummer = 0;
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: () => `blob:test/${(nummer += 1)}`,
      revokeObjectURL: () => undefined,
    }),
  );
});

/**
 * Panne melden: zuerst „Wo ist der Schaden?“ mit der Liste der Bauteile, „Weiter“ auch ohne
 * Stelle, danach je Frage der Vorlage eine Seite; die Stellen stehen in der Meldung.
 */
describe('Panne melden', () => {
  it('öffnet „Wo ist der Schaden?“ mit der Liste der Bauteile und geht auch ohne Stelle weiter', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    const schaden = await fenster('Wo ist der Schaden?');
    expect(within(schaden).getByText('Panne melden · Lastenrad 1')).toBeInTheDocument();
    // Ohne Gesamtzahl und ohne Balken: Der Weg verzweigt.
    expect(within(schaden).getByText('Schritt 1')).toBeInTheDocument();
    expect(document.querySelector('[data-fortschritt]')).toBeNull();
    // Die erste Seite des Fensters hat kein Zurück.
    expect(within(schaden).queryByRole('button', { name: '← Zurück' })).toBeNull();
    // Alle Bauteile, nach Prüfpunkt gruppiert; der Fokus beginnt an der Liste.
    const bauteil = within(schaden).getByRole('combobox', { name: 'Bauteil' });
    expect(bauteil).toHaveFocus();
    expect(within(bauteil).getAllByRole('option')).toHaveLength(28);
    await pruefeBarrierefreiheit(document.body);

    await nutzer.click(within(schaden).getByRole('button', { name: 'Weiter' }));
    const frage = await fenster('Ist die Weiterfahrt gehindert?');
    expect(within(frage).getByText('Schritt 2')).toBeInTheDocument();
    expect(within(frage).getByRole('button', { name: 'Ja' })).toHaveFocus();
    // Die Herkunft der Vorlage bleibt sichtbar, in einer Zeile.
    expect(within(frage).getByText('Für Tübingen noch zu prüfen.')).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
    // Zurück führt vor die erste Frage der Vorlage.
    await nutzer.click(within(frage).getByRole('button', { name: '← Zurück' }));
    expect(await fenster('Wo ist der Schaden?')).toBeInTheDocument();
  });

  it('bietet „Weiter“ erst, wenn keine Stelle mehr offen ist; jede Stelle ist ein Schaden', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await waehleBauteil(nutzer, 'bremse-vorne');
    const stelle = within(await fenster('Wo ist der Schaden?'));
    // Mit offener Stelle ist „Stelle setzen“ der Hauptknopf, nicht „Weiter“.
    expect(stelle.queryByRole('button', { name: 'Weiter' })).toBeNull();
    expect(stelle.getByRole('combobox', { name: 'Bauteil' })).toHaveValue('bremse-vorne');
    // Keine Einstufung in der Pannenmeldung (Handoff, Vorschlag 4).
    expect(stelle.queryByRole('group', { name: 'Bewertung der Stelle' })).toBeNull();
    await nutzer.type(stelle.getByLabelText('Was ist passiert?'), 'schleift');
    await nutzer.click(stelle.getByRole('button', { name: 'Stelle setzen' }));
    expect(stelle.getByRole('list', { name: 'Schäden am Rad' })).toHaveTextContent(
      'Bremse vorneschleift',
    );
    expect(stelle.getByRole('button', { name: 'Weiter' })).toBeEnabled();
    // Ein weiterer Schaden geht über dieselbe Liste.
    expect(stelle.getByRole('combobox', { name: 'Weiteres Bauteil' })).toHaveValue('');
  });

  it('füllt „Was ist auffällig?“ aus den Stellen vor und meldet ohne Sperre', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await waehleBauteil(nutzer, 'bremse-vorne');
    await nutzer.type(screen.getByLabelText('Was ist passiert?'), 'schleift');
    await nutzer.click(screen.getByRole('button', { name: 'Stelle setzen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await fenster('Ist die Weiterfahrt gehindert?');
    await antworte(nutzer, 'Nein');

    const auffaellig = within(await fenster('Rad ist weiter fahrbar. Was genau ist auffällig?'));
    expect(auffaellig.getByLabelText('Was ist auffällig?')).toHaveValue('Bremse vorne: schleift');
    expect(
      auffaellig.getByText(
        'Diese Meldung sperrt das Rad nicht. Es bleibt in der Planung verfügbar.',
      ),
    ).toBeInTheDocument();
    // Der Abschluss: Der Fuß steht mit Linie unter dem Inhalt, und der Fokus
    // beginnt beim Inhalt - ein zweites Enter meldet nicht ungelesen.
    const melden = auffaellig.getByRole('button', { name: 'Melden' });
    expect(melden.closest('.border-t')).not.toBeNull();
    expect(melden).not.toHaveFocus();
    expect(document.activeElement).toContainElement(
      auffaellig.getByLabelText('Was ist auffällig?'),
    );
    await nutzer.click(melden);

    expect(recordBreakdown).toHaveBeenCalledWith({
      bikeId: RAD.id,
      outcome: 'meldungOhneSperre',
      summary: 'Weiterfahrt möglich: Bremse vorne: schleift',
      remark: '',
      locationNote: '',
      transport: null,
      spots: [{ zone: 'bremse-vorne', severity: 'problem', note: 'schleift' }],
    });
    expect(await screen.findByTestId('ziel')).toHaveTextContent(
      `/betrieb/flotte/rad/${RAD.id}?bereich=stellen`,
    );
    expect(screen.getByTestId('ziel-meldung')).toHaveTextContent(
      'Panne gemeldet. Lastenrad 1 bleibt in der Planung.',
    );
  });

  it('meldet ohne Text nicht: „Melden“ wartet auf die Beschreibung', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(
      within(await fenster('Wo ist der Schaden?')).getByRole('button', { name: 'Weiter' }),
    );
    await fenster('Ist die Weiterfahrt gehindert?');
    await antworte(nutzer, 'Nein');
    const auffaellig = within(await fenster(/Was genau ist auffällig\?/));
    expect(auffaellig.getByLabelText('Was ist auffällig?')).toHaveValue('');
    expect(auffaellig.getByLabelText('Was ist auffällig?')).toHaveFocus();
    expect(auffaellig.getByRole('button', { name: 'Melden' })).toBeDisabled();
    await nutzer.type(auffaellig.getByLabelText('Was ist auffällig?'), 'Klingel klemmt');
    expect(auffaellig.getByRole('button', { name: 'Melden' })).toBeEnabled();
  });

  it('nennt beim Load 60 den Riemenriss, nicht den Kettenriss (Vorschlag 8)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(
      within(await fenster('Wo ist der Schaden?')).getByRole('button', { name: 'Weiter' }),
    );
    await fenster('Ist die Weiterfahrt gehindert?');
    await antworte(nutzer, 'Ja');
    const groesse = within(await fenster('Wie groß ist der Schaden?'));
    expect(
      groesse.getByText(
        'Klein: Reifen, Gangschaltung. Groß: Elektronik, Riemenriss, Ausfall beider Bremsen.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Kettenriss/)).toBeNull();
    expect(groesse.getByText('Schritt 3')).toBeInTheDocument();
  });

  it('hält den Ort des zurückgelassenen Rads aus dem Abschluss heraus (ANN-558)', async () => {
    // Mittwoch, der Ruhetag der Vorlage: Die Panne fragt nicht danach.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    const nutzer = userEvent.setup();
    recordBreakdown.mockResolvedValue({ breakdownId: 'p', spotIds: [], blocked: true });
    oeffne();
    await nutzer.click(
      within(await fenster('Wo ist der Schaden?')).getByRole('button', { name: 'Weiter' }),
    );
    await fenster('Ist die Weiterfahrt gehindert?');
    // gehindert, groß - der Ruhetag kommt aus dem Datum (BEF-176)
    await antworte(nutzer, 'Ja', 'Groß');
    const letzte = within(await fenster('War das die letzte Behandlung am Tag?'));
    expect(letzte.getByText('Heute ist Mittwoch: Ruhetag der Vertragswerkstatt.')).toBeVisible();
    // letzte Behandlung, Depot nicht erreichbar
    await antworte(nutzer, 'Ja', 'Nein');
    const zuruecklassen = within(await fenster('Fahrrad zurücklassen. Wo genau steht es?'));
    // Ohne hinterlegte Rufnummer kein Anruf, der nicht geht, und kein
    // Team-Kanal, den es nicht gibt (BEF-176).
    expect(
      zuruecklassen.getByText(
        'Rufnummern von Vertragswerkstatt und Teamleitung noch nicht hinterlegt.',
      ),
    ).toBeVisible();
    expect(zuruecklassen.queryByRole('link', { name: /anrufen/ })).not.toBeInTheDocument();
    expect(zuruecklassen.queryByText(/Team-Kanal/)).not.toBeInTheDocument();
    await nutzer.type(
      zuruecklassen.getByLabelText('Standort / Adresse'),
      'Hinterhof Beispielweg 3',
    );
    await nutzer.click(zuruecklassen.getByRole('button', { name: 'Weiter' }));
    await antworte(nutzer, 'Nein'); // kein Führerschein
    // Die Zusammenfassung zeigt den Ort - zum Prüfen vor dem Bestätigen.
    const zusammenfassung = within(await fenster('Zusammenfassung – bitte prüfen:'));
    expect(zusammenfassung.getByRole('list', { name: 'Zusammenfassung' })).toHaveTextContent(
      'Standort: Hinterhof Beispielweg 3',
    );
    // Der Fokus beginnt oben in der Zusammenfassung, nicht auf dem Knopf -
    // beim Schaden, der ersten Angabe mit „Ändern“ (Design-Review Überholung 6).
    expect(zusammenfassung.getByText(/^Schaden: /)).toHaveFocus();
    expect(zusammenfassung.getByRole('button', { name: 'Standort ändern' })).toBeInTheDocument();
    expect(zusammenfassung.getByRole('button', { name: 'Weiterfahrt ändern' })).toBeInTheDocument();
    // „Ändern“ am Schaden führt ans Rad, „Weiter“ von dort zurück zur
    // Zusammenfassung - mit allen Angaben.
    await nutzer.click(zusammenfassung.getByRole('button', { name: 'Schaden ändern' }));
    await nutzer.click(
      within(await fenster('Wo ist der Schaden?')).getByRole('button', { name: 'Weiter' }),
    );
    const wieder = within(await fenster('Zusammenfassung – bitte prüfen:'));
    expect(wieder.getByText('Standort: Hinterhof Beispielweg 3')).toBeInTheDocument();
    await nutzer.click(wieder.getByRole('button', { name: /Bestätigen/ }));

    const eingabe = recordBreakdown.mock.calls[0]![0];
    expect(eingabe.outcome).toBe('transportFortsetzung');
    expect(eingabe.summary).not.toContain('Hinterhof');
    expect(eingabe.locationNote).toBe('Hinterhof Beispielweg 3');
    expect(eingabe.transport).toBe('fahrdienst');
    expect(eingabe.summary).not.toMatch(/informiert|durchgegeben/);
    // Das Ersatzrad steht auch in der Meldung danach (BEF-176).
    expect(await screen.findByTestId('ziel-meldung')).toHaveTextContent(
      'Panne gemeldet. Lastenrad 1 ist in Reparatur und steht nicht mehr in der Planung. ' +
        'Bis zur Freigabe Lastenrad 5 (Ersatz) nutzen.',
    );
  });

  it('geht an einem anderen Tag ohne Frage zur Vertragswerkstatt (BEF-176)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(
      within(await fenster('Wo ist der Schaden?')).getByRole('button', { name: 'Weiter' }),
    );
    await fenster('Ist die Weiterfahrt gehindert?');
    await antworte(nutzer, 'Ja', 'Groß');
    const nah = within(await fenster('Vertragswerkstatt in der Nähe (15–30 Minuten Fußweg)?'));
    // „← Zurück“ führt zur Frage davor, nicht zu einer Weiche.
    await nutzer.click(nah.getByRole('button', { name: /Zurück/ }));
    expect(await fenster('Wie groß ist der Schaden?')).toBeInTheDocument();
  });

  it('meldet „Reparatur vor Ort nicht möglich“ gleich mit der Antwort', async () => {
    const nutzer = userEvent.setup();
    recordBreakdown.mockResolvedValue({ breakdownId: 'p', spotIds: [], blocked: true });
    oeffne();
    await nutzer.click(
      within(await fenster('Wo ist der Schaden?')).getByRole('button', { name: 'Weiter' }),
    );
    await fenster('Ist die Weiterfahrt gehindert?');
    await antworte(nutzer, 'Ja', 'Klein', 'Ja');
    await fenster('Anruf Werkstatt: Reparatur direkt vor Ort möglich?');
    await antworte(nutzer, 'Nein');
    expect(recordBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'lokalNichtMoeglich',
        summary: 'Lokale Werkstatt: Reparatur vor Ort nicht möglich.',
      }),
    );
    expect(await screen.findByTestId('ziel-meldung')).toHaveTextContent(
      'Panne gemeldet. Lastenrad 1 ist in Reparatur und steht nicht mehr in der Planung.',
    );
  });

  it('sagt einen Fehler des Servers im Fuß und bleibt auf der Seite', async () => {
    // Mittwoch, der Ruhetag der Vorlage: „Groß“ führt ins Raddepot (BEF-176).
    // Ohne festes Datum lief der Test nur mittwochs grün.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    const nutzer = userEvent.setup();
    recordBreakdown.mockRejectedValue(new Error('Das Rad ist schon gesperrt.'));
    oeffne();
    await nutzer.click(
      within(await fenster('Wo ist der Schaden?')).getByRole('button', { name: 'Weiter' }),
    );
    await fenster('Ist die Weiterfahrt gehindert?');
    await antworte(nutzer, 'Ja', 'Groß', 'Ja', 'Ja');
    const depot = within(await fenster('Lastenrad ins Raddepot bringen.'));
    await nutzer.click(depot.getByRole('button', { name: 'Rad als „In Reparatur“ markieren' }));
    expect(await depot.findByRole('alert')).toHaveTextContent('Das Rad ist schon gesperrt.');
    expect(screen.getByRole('dialog', { name: 'Lastenrad ins Raddepot bringen.' })).toBeVisible();
  });

  it('hängt die Fotos an und lässt ein gescheitertes erneut versuchen', async () => {
    const nutzer = userEvent.setup();
    uploadFleetPhoto.mockRejectedValueOnce(new Error('Keine Verbindung.'));
    oeffne();
    await waehleBauteil(nutzer, 'bremse-vorne');
    await nutzer.type(screen.getByLabelText('Was ist passiert?'), 'schleift');
    await nutzer.click(screen.getByRole('button', { name: /Foto hinzufügen/ }));
    await nutzer.click(
      within(screen.getByRole('group', { name: 'Kamera: Foto zu Bremse vorne' })).getByRole(
        'button',
        { name: 'Auslösen' },
      ),
    );
    await nutzer.click(screen.getByRole('button', { name: 'Stelle setzen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await fenster('Ist die Weiterfahrt gehindert?');
    await antworte(nutzer, 'Nein', 'Melden');

    const ausstehend = within(await fenster('Panne gemeldet'));
    expect(
      ausstehend.getByText('Panne gemeldet. Lastenrad 1 bleibt in der Planung.'),
    ).toBeVisible();
    expect(ausstehend.getByRole('alert')).toHaveTextContent(
      'ein Foto konnte nicht übertragen werden. Keine Verbindung.',
    );
    expect(ausstehend.queryByRole('button', { name: '← Zurück' })).toBeNull();
    await nutzer.click(ausstehend.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByTestId('ziel-meldung')).toHaveTextContent(
      'Panne gemeldet. Lastenrad 1 bleibt in der Planung. Fotos übertragen.',
    );
    expect(uploadFleetPhoto).toHaveBeenCalledTimes(2);
    expect(uploadFleetPhoto).toHaveBeenLastCalledWith(
      expect.objectContaining({ spotId: 'stelle-neu', checkupId: null }),
    );
  });

  it('geht mit dem Zurück des Browsers einen Schritt zurück und fragt erst auf der ersten Seite', async () => {
    const nutzer = userEvent.setup();
    const router = oeffneMitVerlauf();
    await nutzer.click(
      within(await fenster('Wo ist der Schaden?')).getByRole('button', { name: 'Weiter' }),
    );
    await fenster('Ist die Weiterfahrt gehindert?');
    await antworte(nutzer, 'Ja');
    await fenster('Wie groß ist der Schaden?');

    await act(() => router.navigate(-1));
    expect(await fenster('Ist die Weiterfahrt gehindert?')).toBeInTheDocument();
    await act(() => router.navigate(-1));
    expect(await fenster('Wo ist der Schaden?')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ungemeldete Panne' })).toBeNull();
    expect(router.state.location.search).toBe(`?rad=${RAD.id}`);

    // Auf der ersten Seite mit einer Stelle: die Rückfrage, in den Worten der Panne.
    await waehleBauteil(nutzer, 'bremse-vorne');
    await act(() => router.navigate(-1));
    const frage = await screen.findByRole('group', { name: 'Ungemeldete Panne' });
    expect(screen.getByRole('dialog', { name: 'Panne noch nicht gemeldet' })).toBeInTheDocument();
    await nutzer.click(within(frage).getByRole('button', { name: 'Weiter melden' }));
    expect(await fenster('Wo ist der Schaden?')).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?rad=${RAD.id}`);
  });

  it('schließt ohne Eingaben gleich', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(
      within(await fenster('Wo ist der Schaden?')).getByRole('button', { name: 'Panne abbrechen' }),
    );
    expect(await screen.findByTestId('ziel')).toHaveTextContent('/betrieb/flotte');
  });

  it('fragt vor dem Abbrechen einer begonnenen Panne', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(
      within(await fenster('Wo ist der Schaden?')).getByRole('button', { name: 'Weiter' }),
    );
    await nutzer.click(
      within(await fenster('Ist die Weiterfahrt gehindert?')).getByRole('button', {
        name: 'Panne abbrechen',
      }),
    );
    const frage = await screen.findByRole('group', { name: 'Ungemeldete Panne' });
    await nutzer.click(within(frage).getByRole('button', { name: 'Verwerfen' }));
    expect(await screen.findByTestId('ziel')).toHaveTextContent('/betrieb/flotte');
    expect(recordBreakdown).not.toHaveBeenCalled();
  });

  it('beginnt ohne Rad mit der Wahl auf einer Seite - das eigene vorbelegt, nie übersprungen', async () => {
    const nutzer = userEvent.setup();
    oeffne('/betrieb/flotte/panne');
    expect(
      await screen.findByRole('heading', { name: 'Welches Rad betrifft es?' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Rad' })).toHaveValue(RAD.id);
    // Vorgewählt ist nicht gewählt: Die Zeile über dem Titel nennt noch kein Rad,
    // und noch ist kein Fenster offen.
    expect(screen.getByText('Panne melden')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(await fenster('Wo ist der Schaden?')).toBeInTheDocument();
  });

  it('nennt ein Rad, das es nicht mehr gibt', async () => {
    oeffne('/betrieb/flotte/panne?rad=rad-weg');
    expect(await screen.findByText('Dieses Rad gibt es nicht mehr.')).toBeInTheDocument();
    expect(fetchBike).not.toHaveBeenCalled();
  });
});
