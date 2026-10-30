import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import {
  AUSFALLHONORAR_RECHTZEITIG,
  AUSFALLHONORAR_REGEL,
  AUSFALLHONORAR_SPAET,
  AUSFALLHONORAR_ANDERER_TAG,
} from '@/lib/ausfallhonorar';
import type * as PlattformApi from './api';
import type { Plattformzugang, Termin } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Ändern und Absagen in je zwei Schritten ab der Seite des Termins: beim Absagen der Hinweis zum
 * Ausfallhonorar, beim Ändern „Wann passt es Ihnen?“, dann die Karte der Zusammenfassung. Beides
 * geht als Wunsch an den Server, nie als Absage; ✕ führt zur Seite des Termins.
 */

const ladeTermine = vi.fn();
const terminAendernWuenschen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<Termin[]>,
  // Die Seite des Termins fragt die Wünsche nach dem offenen.
  ladeWuensche: () => Promise.resolve([]),
  terminAendernWuenschen: (...args: unknown[]) =>
    terminAendernWuenschen(...args) as Promise<string>,
}));

const { Terminaenderung } = await import('./Terminaenderung');
const { WUNSCHTAGE } = await import('./terminablauf');
const { terminKurz } = await import('./terminbeschreibung');
const { tagInWorten, vonBis } = await import('./termintexte');
const { naechsteWerktage } = await import('./zeit');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  writable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};

function inStunden(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

const TERMIN: Termin = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  starts_at: inStunden(72),
  ends_at: inStunden(73),
  appointment_type: 'home_visit',
  status: 'confirmed',
  staff_name: 'Anna Beispiel',
  location_name: null,
  visit_street: 'Testweg',
  visit_house_number: '7',
  visit_postal_code: '72072',
  visit_city: 'Tuebingen',
  late_notice: false,
  open_request_kind: null,
};

const KURZFRISTIG: Termin = {
  ...TERMIN,
  starts_at: inStunden(20),
  ends_at: inStunden(21),
  late_notice: true,
};

const SEITE_DES_TERMINS = `/p/termine/${TERMIN.id}?bereich=treatment`;
const ABSAGEN = `${SEITE_DES_TERMINS}&art=cancel`;
const AENDERN = `${SEITE_DES_TERMINS}&art=change`;

/** Tag und Zeit des Termins, wie die Karte sie nennt; der Vergleich liest Leerraum als Leerzeichen. */
function tagUndZeit(termin: Termin): string {
  return `${tagInWorten(termin.starts_at)}, ${vonBis(termin)}`.replace(/\s+/g, ' ');
}

/** Wo die Anwendung gerade steht - nach dem Senden oder Schließen. */
function Ort() {
  const { pathname, search } = useLocation();
  return <p data-testid="ort">{`${pathname}${search}`}</p>;
}

function zeige(termin: Termin, pfad: string, zugang: Plattformzugang = ZUGANG) {
  ladeTermine.mockResolvedValue([termin]);
  return renderWithProviders(
    <>
      <Terminaenderung zugang={zugang} />
      <Ort />
    </>,
    pfad,
  );
}

const MIT_NUMMER: Plattformzugang = { ...ZUGANG, practice_phone: '+49 7071 0000000' };

/** Mit der Liste und der Seite des Termins davor im Verlauf - für ✕ und das Zurück des Browsers. */
function zeigeMitVerlauf(termin: Termin, pfad: string) {
  ladeTermine.mockResolvedValue([termin]);
  const router = createMemoryRouter(
    [
      { path: '/p/termine/:terminId', element: <Terminaenderung zugang={ZUGANG} /> },
      { path: '*', element: <Ort /> },
    ],
    { initialEntries: ['/p/termine?bereich=treatment', SEITE_DES_TERMINS, pfad], initialIndex: 2 },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** Die Kalendertage der gewählten Wochentage, wie der Server sie bekommt. */
function tageAm(...wochentage: number[]): string[] {
  return naechsteWerktage(WUNSCHTAGE).filter((tag) =>
    wochentage.includes(new Date(`${tag}T12:00:00`).getDay()),
  );
}

function folgt(vorher: Element, nachher: Element): boolean {
  return (vorher.compareDocumentPosition(nachher) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  terminAendernWuenschen.mockResolvedValue('dddddddd-dddd-4ddd-8ddd-000000000001');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Terminaenderung (POR-010, Schritt 3d)', () => {
  it('beginnt mit ?art=cancel beim Ausfallhonorar: Schritt 1 von 2, ohne „Zurück“, die Regel zu', async () => {
    zeige(TERMIN, ABSAGEN);
    const seite = await screen.findByRole('dialog', { name: 'Ausfallhonorar' });
    expect(within(seite).getByText('Schritt 1 von 2')).toBeInTheDocument();
    expect(within(seite).getByText(terminKurz(TERMIN))).toBeInTheDocument();
    expect(within(seite).queryByRole('button', { name: '← Zurück' })).not.toBeInTheDocument();
    expect(within(seite).getByText(AUSFALLHONORAR_RECHTZEITIG)).toBeInTheDocument();
    // Rechtzeitig ist keine Warnung: nichts, was Vorlesesoftware unterbricht.
    expect(within(seite).queryByRole('alert')).not.toBeInTheDocument();
    // Die ganze Regel steht auf Abruf darunter.
    expect(within(seite).getByText('Unsere Regel zum Ausfallhonorar')).toBeInTheDocument();
    expect(within(seite).getByText(AUSFALLHONORAR_REGEL[0]!)).not.toBeVisible();
  });

  it('sendet die Absage: die Karte mit Tag, Zeit, Art und Person, der Satz zum Eingang', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, ABSAGEN);
    await nutzer.click(await screen.findByRole('button', { name: 'Verstanden, weiter' }));

    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Schritt 2 von 2')).toBeInTheDocument();
    expect(within(ende).getByText('Termin absagen')).toBeInTheDocument();
    expect(within(ende).getByText(tagUndZeit(TERMIN))).toBeInTheDocument();
    expect(within(ende).getByText('Hausbesuch · Anna Beispiel')).toBeInTheDocument();
    // An der Absage gibt es nichts zu wählen, also auch nichts zu ändern.
    expect(within(ende).queryByRole('button', { name: /^Ändern/ })).not.toBeInTheDocument();
    expect(
      within(ende).getByText(/Als Eingang Ihrer Absage gilt der Zeitpunkt/),
    ).toBeInTheDocument();
    // Rechtzeitig: keine zweite Warnung über dem Knopf.
    expect(within(ende).queryByText(AUSFALLHONORAR_SPAET)).not.toBeInTheDocument();
    // Die Nachricht ist eingeklappt und freiwillig.
    const feld = within(ende).getByLabelText('Möchten Sie der Praxis etwas mitteilen?');
    expect(feld).not.toBeVisible();
    await nutzer.click(within(ende).getByText('Nachricht an die Praxis (freiwillig)'));
    expect(feld).toBeVisible();
    await nutzer.type(feld, 'Bin verreist.');
    await nutzer.click(within(ende).getByRole('button', { name: 'Absage senden' }));
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith({
        zugangId: ZUGANG.access_id,
        terminId: TERMIN.id,
        art: 'cancel',
        tage: [],
        zeiten: [],
        notiz: 'Bin verreist.',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('ort')).toHaveTextContent(
        // Die Kennung der Absage reist mit: Die Liste nennt deren Eingang am Server (ANN-811).
        /^\/p\/termine\?bereich=treatment&absage=dddddddd-dddd-4ddd-8ddd-000000000001$/,
      ),
    );
  });

  it('lädt nach dem Senden erst neu und geht dann zur Liste: der Wunsch steht dort schon (ANN-811)', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, ABSAGEN);
    await nutzer.click(await screen.findByRole('button', { name: 'Verstanden, weiter' }));
    let geladen: (termine: Termin[]) => void = () => undefined;
    ladeTermine.mockImplementationOnce(
      () =>
        new Promise<Termin[]>((aufloesen) => {
          geladen = aufloesen;
        }),
    );
    await nutzer.click(await screen.findByRole('button', { name: 'Absage senden' }));
    await waitFor(() => expect(ladeTermine).toHaveBeenCalledTimes(2));
    // Solange die Liste lädt, bleibt der Ablauf beim Senden stehen.
    expect(screen.getByRole('button', { name: /Wird gesendet/ })).toBeInTheDocument();
    expect(screen.getByTestId('ort')).toHaveTextContent(ABSAGEN);
    act(() => geladen([{ ...TERMIN, open_request_kind: 'cancel' }]));
    await waitFor(() =>
      expect(screen.getByTestId('ort')).toHaveTextContent(
        /^\/p\/termine\?bereich=treatment&absage=dddddddd-dddd-4ddd-8ddd-000000000001$/,
      ),
    );
  });

  it('warnt unter 24 Stunden mit offener Regel und noch einmal über „Absage senden“ (ADR-018 Punkt 8)', async () => {
    const nutzer = userEvent.setup();
    zeige(KURZFRISTIG, ABSAGEN);
    const seite = await screen.findByRole('dialog', { name: 'Ausfallhonorar' });
    const warnung = within(seite).getByRole('alert');
    expect(warnung).toHaveTextContent('weniger als 24 Stunden');
    expect(warnung).toHaveTextContent('berechnen wir ein Ausfallhonorar');
    expect(within(warnung).getByText(AUSFALLHONORAR_SPAET)).toHaveClass('text-warnung');
    expect(within(seite).getByText(AUSFALLHONORAR_REGEL[0]!)).toBeVisible();
    await pruefeBarrierefreiheit(document.body);
    // Die Frist steht vor dem Knopf, nicht dahinter.
    const weiter = within(seite).getByRole('button', { name: 'Verstanden, weiter' });
    expect(folgt(warnung, weiter)).toBe(true);
    await nutzer.click(weiter);

    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    const nochmal = within(ende).getByText(AUSFALLHONORAR_SPAET);
    expect(nochmal.closest('[role="status"]')).toHaveClass('text-warnung');
    expect(folgt(nochmal, within(ende).getByRole('button', { name: 'Absage senden' }))).toBe(true);
  });

  it('sendet einen Änderungswunsch: nichts vorbelegt, die Karte mit „Lieber am“', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, AENDERN);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    expect(within(wann).getByText('Schritt 1 von 2')).toBeInTheDocument();
    expect(within(wann).getByText(terminKurz(TERMIN))).toBeInTheDocument();
    expect(within(wann).queryByRole('button', { name: '← Zurück' })).not.toBeInTheDocument();
    expect(within(wann).getByRole('button', { name: 'Montag' })).toHaveFocus();
    for (const name of ['Montag', 'Freitag', 'Vormittag', 'Egal']) {
      expect(within(wann).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    await nutzer.click(within(wann).getByRole('button', { name: 'Montag' }));
    expect(within(wann).getByText(/^Montag – bis Montag, /)).toHaveAttribute('role', 'status');
    await nutzer.click(within(wann).getByRole('button', { name: 'Vormittag' }));
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));

    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Schritt 2 von 2')).toBeInTheDocument();
    // Der Termin selbst steht im Kopf, die Karte nennt die Wahl.
    expect(within(ende).getByText(terminKurz(TERMIN))).toBeInTheDocument();
    expect(within(ende).getByText('Lieber am')).toBeInTheDocument();
    expect(within(ende).getByText('Montag, vormittags')).toBeInTheDocument();
    expect(within(ende).getByText(/^bis Montag, /)).toBeInTheDocument();
    // Zu ändern ist nur die Wahl, nicht der Termin selbst.
    expect(
      within(ende)
        .getAllByRole('button', { name: /^Ändern/ })
        .map((knopf) => knopf.getAttribute('aria-label')),
    ).toEqual(['Ändern: Lieber am']);
    expect(within(ende).getByText(/es entsteht kein Ausfallhonorar/)).toHaveAttribute(
      'role',
      'status',
    );
    await nutzer.click(within(ende).getByRole('button', { name: 'Änderungswunsch senden' }));
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith({
        zugangId: ZUGANG.access_id,
        terminId: TERMIN.id,
        art: 'change',
        tage: tageAm(1),
        zeiten: ['morning'],
        notiz: '',
      }),
    );
  });

  it('warnt beim Ändern unter 24 Stunden vor dem Freigeben', async () => {
    const nutzer = userEvent.setup();
    zeige(KURZFRISTIG, AENDERN);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    // Schon auf Schritt 1, was eine Verlegung kostet; der Fokus beginnt dort (ANN-805).
    const verlegen = within(wann).getByText(AUSFALLHONORAR_ANDERER_TAG);
    expect(verlegen).toHaveClass('text-warnung');
    await waitFor(() => expect(verlegen.parentElement).toHaveFocus());
    await nutzer.click(within(wann).getByRole('button', { name: 'Dienstag' }));
    await nutzer.click(within(wann).getByRole('button', { name: 'Egal' }));
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    // Derselbe kurze Satz wie auf Schritt 1 (ANN-811).
    expect(within(ende).getByText(AUSFALLHONORAR_ANDERER_TAG)).toHaveClass('text-warnung');
    expect(within(ende).queryByText(/wie eine kurzfristige Absage/)).toBeNull();
  });

  it('sagt auf „Wann passt es Ihnen?“, was fehlt; „Egal“ nimmt die einzelnen Tageszeiten zurück', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, AENDERN);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    expect(within(wann).getByRole('alert')).toHaveTextContent(
      'Bitte wählen Sie mindestens einen Tag.',
    );
    await nutzer.click(within(wann).getByRole('button', { name: 'Freitag' }));
    expect(within(wann).queryByRole('alert')).not.toBeInTheDocument();
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    expect(within(wann).getByRole('alert')).toHaveTextContent(
      'Bitte wählen Sie eine Tageszeit oder „Egal“.',
    );
    await nutzer.click(within(wann).getByRole('button', { name: 'Nachmittag' }));
    await nutzer.click(within(wann).getByRole('button', { name: 'Egal' }));
    expect(within(wann).getByRole('button', { name: 'Nachmittag' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));

    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Freitag, zu jeder Tageszeit')).toBeInTheDocument();
    await nutzer.click(within(ende).getByRole('button', { name: 'Änderungswunsch senden' }));
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'change', tage: tageAm(5), zeiten: [] }),
      ),
    );
  });

  it('kehrt nach „Ändern“ aus der Zusammenfassung gleich dorthin zurück', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, AENDERN);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await nutzer.click(within(wann).getByRole('button', { name: 'Montag' }));
    await nutzer.click(within(wann).getByRole('button', { name: 'Vormittag' }));
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'Ist alles richtig?' })).getByRole('button', {
        name: 'Ändern: Lieber am',
      }),
    );
    const wieder = screen.getByRole('dialog', { name: 'Wann passt es Ihnen?' });
    // Die Wahl von vorhin steht noch da.
    expect(within(wieder).getByRole('button', { name: 'Montag' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await nutzer.click(within(wieder).getByRole('button', { name: 'Mittwoch' }));
    await nutzer.click(within(wieder).getByRole('button', { name: 'Weiter' }));
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Montag oder Mittwoch, vormittags')).toBeInTheDocument();
    await nutzer.click(within(ende).getByRole('button', { name: 'Änderungswunsch senden' }));
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith(
        expect.objectContaining({ tage: tageAm(1, 3), zeiten: ['morning'] }),
      ),
    );
  });

  it('führt beim Absagen mit „← Zurück“ zum Hinweis, der wieder Schritt 1 ist', async () => {
    const nutzer = userEvent.setup();
    zeige(KURZFRISTIG, ABSAGEN);
    await nutzer.click(await screen.findByRole('button', { name: 'Verstanden, weiter' }));
    await nutzer.click(screen.getByRole('button', { name: '← Zurück' }));
    const seite = screen.getByRole('dialog', { name: 'Ausfallhonorar' });
    expect(within(seite).getByText('Schritt 1 von 2')).toBeInTheDocument();
    expect(within(seite).queryByRole('button', { name: '← Zurück' })).not.toBeInTheDocument();
    await nutzer.click(within(seite).getByRole('button', { name: 'Verstanden, weiter' }));
    await nutzer.click(screen.getByRole('button', { name: 'Absage senden' }));
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'cancel', tage: [], zeiten: [] }),
      ),
    );
  });

  it('führt mit ✕ „Abbrechen“ zur Seite des Termins und lässt den Ablauf nicht im Verlauf (ANN-782)', async () => {
    const nutzer = userEvent.setup();
    const router = zeigeMitVerlauf(TERMIN, ABSAGEN);
    await nutzer.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(router.state.location.search).toBe('?bereich=treatment'));
    expect(router.state.location.pathname).toBe(`/p/termine/${TERMIN.id}`);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fragt vor dem Schließen, sobald etwas gewählt ist; „Verwerfen“ führt zur Seite des Termins', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, AENDERN);
    await nutzer.click(await screen.findByRole('button', { name: 'Montag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));
    const rueckfrage = screen.getByRole('dialog', { name: 'Ihr Wunsch ist noch nicht gesendet' });
    await nutzer.click(within(rueckfrage).getByRole('button', { name: 'Weiter ausfüllen' }));
    expect(screen.getByRole('button', { name: 'Montag' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ort')).toHaveTextContent(AENDERN);

    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'Ihr Wunsch ist noch nicht gesendet' })).getByRole(
        'button',
        { name: 'Verwerfen' },
      ),
    );
    await waitFor(() => expect(screen.getByTestId('ort').textContent).toBe(SEITE_DES_TERMINS));
    expect(terminAendernWuenschen).not.toHaveBeenCalled();
  });

  it('geht mit dem Zurück des Browsers einen Schritt zurück, auf der ersten Seite zur Seite des Termins', async () => {
    const nutzer = userEvent.setup();
    const router = zeigeMitVerlauf(TERMIN, ABSAGEN);
    await nutzer.click(await screen.findByRole('button', { name: 'Verstanden, weiter' }));
    expect(await screen.findByRole('dialog', { name: 'Ist alles richtig?' })).toBeInTheDocument();
    // Die Zurückgeste des Telefons: ein Schritt zurück, nicht aus dem Ablauf.
    await act(() => router.navigate(-1));
    expect(await screen.findByRole('dialog', { name: 'Ausfallhonorar' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?bereich=treatment&art=cancel');
    // Auf der ersten Seite ist nichts zu verlieren: Die Geste führt zur Seite des Termins.
    await act(() => router.navigate(-1));
    await waitFor(() => expect(router.state.location.search).toBe('?bereich=treatment'));
    expect(router.state.location.pathname).toBe(`/p/termine/${TERMIN.id}`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ohne Netz wartet das Senden mit dem Satz über dem Knopf; die Angaben bleiben (ANN-783)', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, AENDERN, MIT_NUMMER);
    await nutzer.click(await screen.findByRole('button', { name: 'Donnerstag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Mittag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });

    // Die Verbindung reißt in der Zusammenfassung ab.
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    const senden = within(ende).getByRole('button', { name: 'Änderungswunsch senden' });
    expect(senden).toBeDisabled();
    expect(senden).toHaveAccessibleDescription(
      /Ohne Verbindung lässt sich Ihr Wunsch gerade nicht/,
    );
    // Der Satz steht einmal, ruhig und nicht als Fehler.
    expect(screen.getAllByText(/Ohne Verbindung lässt sich Ihr Wunsch/)).toHaveLength(1);
    expect(within(ende).queryByRole('alert')).not.toBeInTheDocument();
    // Ein Änderungswunsch kann warten; den Anruf bietet nur die Absage an.
    expect(within(ende).queryByRole('link', { name: /Praxis anrufen/ })).not.toBeInTheDocument();

    // Ist sie zurück, geht es ohne neue Eingabe weiter.
    online.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(within(ende).queryByText(/Ohne Verbindung/)).not.toBeInTheDocument();
    await nutzer.click(senden);
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith(
        expect.objectContaining({ tage: tageAm(4), zeiten: ['midday'] }),
      ),
    );
  });

  it('ohne Netz bietet die Absage „Praxis anrufen“ an, denn die Frist läuft weiter (ANN-783)', async () => {
    const nutzer = userEvent.setup();
    zeige(KURZFRISTIG, ABSAGEN, MIT_NUMMER);
    await nutzer.click(await screen.findByRole('button', { name: 'Verstanden, weiter' }));
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).queryByRole('link', { name: /Praxis anrufen/ })).not.toBeInTheDocument();

    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(within(ende).getByRole('button', { name: 'Absage senden' })).toBeDisabled();
    expect(within(ende).getByRole('link', { name: /Praxis anrufen/ })).toHaveAttribute(
      'href',
      'tel:+4970710000000',
    );
    await pruefeBarrierefreiheit(document.body);
    // Die Abfragen merken sich „offline“ über das Ereignis: Der nächste Test beginnt verbunden.
    online.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
  });

  it('besteht axe auf jeder Seite beider Wege', async () => {
    const nutzer = userEvent.setup();
    const { unmount } = zeige(TERMIN, ABSAGEN);
    await screen.findByRole('dialog', { name: 'Ausfallhonorar' });
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(screen.getByRole('button', { name: 'Verstanden, weiter' }));
    await nutzer.click(screen.getByText('Nachricht an die Praxis (freiwillig)'));
    await pruefeBarrierefreiheit(document.body);
    unmount();

    zeige(TERMIN, AENDERN);
    await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(screen.getByRole('button', { name: 'Montag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Mittag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByRole('dialog', { name: 'Ist alles richtig?' })).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
  });

  // Was sich nicht ändern lässt, zeigt die Seite des Termins.
  it('zeigt ohne ?art= die Seite des Termins, keinen Ablauf', async () => {
    zeige(TERMIN, SEITE_DES_TERMINS);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Passt der Termin nicht?' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('zeigt bei offenem Wunsch keinen Ablauf, sondern die Seite mit dem Wunsch', async () => {
    zeige({ ...TERMIN, open_request_kind: 'cancel' }, `/p/termine/${TERMIN.id}?art=cancel`);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ihr Absagewunsch' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Termin absagen' })).not.toBeInTheDocument();
  });

  it('laesst einen abgesagten Termin nicht aendern: die Seite bietet einen neuen Wunsch an', async () => {
    zeige(
      { ...TERMIN, status: 'cancelled', late_notice: null },
      `/p/termine/${TERMIN.id}?art=change`,
    );
    expect(await screen.findByRole('link', { name: 'Neuen Termin wünschen' })).toBeInTheDocument();
    expect(screen.queryByText(/lässt sich hier nicht mehr ändern/)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sagt, wenn der Termin nicht gefunden wurde', async () => {
    zeige(TERMIN, '/p/termine/aaaaaaaa-aaaa-4aaa-8aaa-0000000000ff?bereich=treatment&art=cancel');
    expect(await screen.findByText('Dieser Termin wurde nicht gefunden.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Termine' })).toHaveAttribute(
      'href',
      '/p/termine?bereich=treatment',
    );
  });

  it('zeigt die Abweisung des Servers als Satz und bleibt in der Zusammenfassung', async () => {
    const nutzer = userEvent.setup();
    terminAendernWuenschen.mockRejectedValue(
      new Error('Zu diesem Termin liegt schon ein Wunsch vor. Die Praxis meldet sich.'),
    );
    zeige(TERMIN, ABSAGEN);
    await nutzer.click(await screen.findByRole('button', { name: 'Verstanden, weiter' }));
    await nutzer.click(screen.getByRole('button', { name: 'Absage senden' }));
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(await within(ende).findByRole('alert')).toHaveTextContent('schon ein Wunsch vor');
  });

  it('sendet keine Nachricht über 500 Zeichen', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, ABSAGEN);
    await nutzer.click(await screen.findByRole('button', { name: 'Verstanden, weiter' }));
    await nutzer.click(screen.getByText('Nachricht an die Praxis (freiwillig)'));
    const feld = screen.getByLabelText('Möchten Sie der Praxis etwas mitteilen?');
    await nutzer.click(feld);
    await nutzer.paste('a'.repeat(501));
    await nutzer.click(screen.getByRole('button', { name: 'Absage senden' }));
    expect(screen.getByRole('alert')).toHaveTextContent('höchstens 500 Zeichen');
    expect(terminAendernWuenschen).not.toHaveBeenCalled();
  });
});
