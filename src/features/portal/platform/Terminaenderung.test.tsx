import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PlattformApi from './api';
import type { Plattformzugang, Termin } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Termin ändern oder absagen (POR-010, DSN-001 4.1, D4), seit Überholung 6
 * als geführter Ablauf im Fenster: „Was möchten Sie?“, beim Absagen der
 * Hinweis zum Ausfallhonorar als eigene Seite - unter 24 Stunden deutlich -,
 * beim Ändern „Wann passt es Ihnen?“, dann die Zusammenfassung. Beides geht
 * als Wunsch an den Server, nie als Absage.
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
const { naechsteWerktage } = await import('./zeit');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
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

/** Wo die Anwendung gerade steht - nach dem Senden oder Schließen. */
function Ort() {
  const { pathname, search } = useLocation();
  return <p data-testid="ort">{`${pathname}${search}`}</p>;
}

function zeige(termin: Termin, pfad = `/p/termine/${termin.id}?bereich=treatment`) {
  ladeTermine.mockResolvedValue([termin]);
  return renderWithProviders(
    <>
      <Terminaenderung zugang={ZUGANG} />
      <Ort />
    </>,
    pfad,
  );
}

/** Mit der Terminliste davor im Verlauf - für das Zurück des Browsers. */
function zeigeMitVerlauf(termin: Termin) {
  ladeTermine.mockResolvedValue([termin]);
  const router = createMemoryRouter(
    [
      { path: '/p/termine/:terminId', element: <Terminaenderung zugang={ZUGANG} /> },
      { path: '*', element: <Ort /> },
    ],
    {
      initialEntries: ['/p/termine?bereich=treatment', `/p/termine/${termin.id}?bereich=treatment`],
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

/** Die Kalendertage der gewählten Wochentage, wie der Server sie bekommt. */
function tageAm(...wochentage: number[]): string[] {
  return naechsteWerktage(WUNSCHTAGE).filter((tag) =>
    wochentage.includes(new Date(`${tag}T12:00:00`).getDay()),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  terminAendernWuenschen.mockResolvedValue('dddddddd-dddd-4ddd-8ddd-000000000001');
});

describe('Terminaenderung (POR-010, Überholung 6)', () => {
  it('fragt im Fenster „Was möchten Sie?“, mit dem Termin im Kopf und zwei Antworten', async () => {
    zeige(TERMIN);
    const fenster = await screen.findByRole('dialog', { name: 'Was möchten Sie?' });
    expect(within(fenster).getByText('Schritt 1 von 3')).toBeInTheDocument();
    expect(within(fenster).getByText(terminKurz(TERMIN))).toBeInTheDocument();
    expect(
      within(fenster).getByText('Hausbesuch · Anna Beispiel kommt zu Ihnen'),
    ).toBeInTheDocument();
    expect(within(fenster).getByRole('button', { name: 'Termin ändern' })).toHaveFocus();
    expect(within(fenster).getByRole('button', { name: 'Termin absagen' })).toBeInTheDocument();
    expect(within(fenster).queryByRole('button', { name: '← Zurück' })).not.toBeInTheDocument();
  });

  it('führt mit ✕ „Abbrechen“ zurück zur Terminliste', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN);
    await nutzer.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByTestId('ort')).toHaveTextContent(/^\/p\/termine\?bereich=treatment$/);
  });

  it('sagt beim Absagen auf eigener Seite, dass kein Ausfallhonorar entsteht, und sendet die Absage', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN);
    await nutzer.click(await screen.findByRole('button', { name: 'Termin absagen' }));
    const hinweis = screen.getByRole('dialog', { name: 'Ausfallhonorar' });
    expect(within(hinweis).getByText('Schritt 2 von 3')).toBeInTheDocument();
    expect(within(hinweis).getByRole('status')).toHaveTextContent('kein Ausfallhonorar');
    // Die ganze Regel steht auf Abruf darunter.
    expect(within(hinweis).getByText('Unsere Regel zum Ausfallhonorar')).toBeInTheDocument();
    await nutzer.click(within(hinweis).getByRole('button', { name: 'Verstanden, weiter' }));

    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Schritt 3 von 3')).toBeInTheDocument();
    expect(within(ende).getByText('Termin absagen')).toBeInTheDocument();
    expect(
      within(ende).getByText(/Als Eingang Ihrer Absage gilt der Zeitpunkt/),
    ).toBeInTheDocument();
    // Rechtzeitig: keine zweite Warnung über dem Knopf.
    expect(within(ende).queryByRole('status')).not.toBeInTheDocument();
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
        /^\/p\/termine\?bereich=treatment&gesendet=1$/,
      ),
    );
  });

  it('warnt unter 24 Stunden deutlich vor dem Ausfallhonorar, vor dem Knopf (ADR-018 Punkt 8)', async () => {
    const nutzer = userEvent.setup();
    zeige({ ...TERMIN, starts_at: inStunden(20), ends_at: inStunden(21), late_notice: true });
    await nutzer.click(await screen.findByRole('button', { name: 'Termin absagen' }));
    const seite = screen.getByRole('dialog', { name: 'Ausfallhonorar' });
    const hinweis = within(seite).getByRole('status');
    expect(hinweis).toHaveTextContent('weniger als 24 Stunden');
    expect(hinweis).toHaveTextContent('berechnen wir ein Ausfallhonorar');
    expect(hinweis).toHaveClass('text-warnung');
    // Der Hinweis steht vor dem Knopf (BEF-079 darf hier nicht entstehen).
    const weiter = within(seite).getByRole('button', { name: 'Verstanden, weiter' });
    expect(hinweis.compareDocumentPosition(weiter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await nutzer.click(weiter);
    // Und in der Zusammenfassung noch einmal, direkt über „Absage senden“.
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    const warnung = within(ende).getByRole('status');
    expect(warnung).toHaveTextContent('weniger als 24 Stunden');
    expect(warnung).toHaveClass('text-warnung');
    const senden = within(ende).getByRole('button', { name: 'Absage senden' });
    expect(warnung.compareDocumentPosition(senden) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sendet einen Änderungswunsch mit den Wochentagen als Kalendertage und der Tageszeit', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN);
    await nutzer.click(await screen.findByRole('button', { name: 'Termin ändern' }));
    const wann = screen.getByRole('dialog', { name: 'Wann passt es Ihnen?' });
    expect(within(wann).getByText('Schritt 2 von 3')).toBeInTheDocument();
    expect(within(wann).getByRole('checkbox', { name: 'Montag' })).toHaveFocus();
    // Nichts ist vorbelegt.
    for (const name of ['Montag', 'Freitag', 'Vormittag', 'Egal']) {
      expect(within(wann).getByRole('checkbox', { name })).not.toBeChecked();
    }
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Montag' }));
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Vormittag' }));
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));

    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Termin ändern')).toBeInTheDocument();
    expect(within(ende).getByText('Montag')).toBeInTheDocument();
    expect(within(ende).getByText('Vormittag')).toBeInTheDocument();
    expect(within(ende).getByRole('status')).toHaveTextContent('es entsteht kein Ausfallhonorar');
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
    zeige(
      { ...TERMIN, starts_at: inStunden(20), ends_at: inStunden(21), late_notice: true },
      `/p/termine/${TERMIN.id}?bereich=treatment&art=change`,
    );
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Dienstag' }));
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Egal' }));
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    const hinweis = within(ende).getByRole('status');
    expect(hinweis).toHaveTextContent('wie eine kurzfristige Absage');
    expect(hinweis).toHaveClass('text-warnung');
  });

  it('sagt auf „Wann passt es Ihnen?“, was fehlt; „Egal“ nimmt die einzelnen Tageszeiten zurück', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, `/p/termine/${TERMIN.id}?bereich=treatment&art=change`);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    expect(within(wann).getByRole('alert')).toHaveTextContent(
      'Bitte wählen Sie mindestens einen Tag.',
    );
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Freitag' }));
    expect(within(wann).queryByRole('alert')).not.toBeInTheDocument();
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    expect(within(wann).getByRole('alert')).toHaveTextContent(
      'Bitte wählen Sie eine Tageszeit oder „Egal“.',
    );
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Nachmittag' }));
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Egal' }));
    expect(within(wann).getByRole('checkbox', { name: 'Nachmittag' })).not.toBeChecked();
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));

    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Freitag')).toBeInTheDocument();
    expect(within(ende).getByText('Jede Tageszeit')).toBeInTheDocument();
    await nutzer.click(within(ende).getByRole('button', { name: 'Änderungswunsch senden' }));
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'change', tage: tageAm(5), zeiten: [] }),
      ),
    );
  });

  it('beginnt mit ?art=cancel beim Ausfallhonorar; „← Zurück“ führt zu „Was möchten Sie?“', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, `/p/termine/${TERMIN.id}?bereich=treatment&art=cancel`);
    const hinweis = await screen.findByRole('dialog', { name: 'Ausfallhonorar' });
    expect(within(hinweis).getByText('Schritt 2 von 3')).toBeInTheDocument();
    await nutzer.click(within(hinweis).getByRole('button', { name: '← Zurück' }));
    const art = screen.getByRole('dialog', { name: 'Was möchten Sie?' });
    // Die Wahl aus der Adresse steht als gewählt da.
    expect(within(art).getByRole('button', { name: 'Termin absagen' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(art).getByRole('button', { name: 'Termin ändern' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('kehrt nach „Ändern“ aus der Zusammenfassung gleich dorthin zurück', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, `/p/termine/${TERMIN.id}?bereich=treatment&art=change`);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Montag' }));
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Vormittag' }));
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'Ist alles richtig?' })).getByRole('button', {
        name: 'Ändern: Wann',
      }),
    );
    const wieder = screen.getByRole('dialog', { name: 'Wann passt es Ihnen?' });
    // Die Wahl von vorhin steht noch da.
    expect(within(wieder).getByRole('checkbox', { name: 'Montag' })).toBeChecked();
    await nutzer.click(within(wieder).getByRole('checkbox', { name: 'Mittwoch' }));
    await nutzer.click(within(wieder).getByRole('button', { name: 'Weiter' }));
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Montag und Mittwoch')).toBeInTheDocument();
    await nutzer.click(within(ende).getByRole('button', { name: 'Änderungswunsch senden' }));
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith(
        expect.objectContaining({ tage: tageAm(1, 3), zeiten: ['morning'] }),
      ),
    );
  });

  it('wechselt aus der Zusammenfassung vom Ändern zum Absagen - über den Hinweis', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, `/p/termine/${TERMIN.id}?bereich=treatment&art=change`);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Montag' }));
    await nutzer.click(within(wann).getByRole('checkbox', { name: 'Egal' }));
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'Ist alles richtig?' })).getByRole('button', {
        name: 'Ändern: Termin ändern',
      }),
    );
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'Was möchten Sie?' })).getByRole('button', {
        name: 'Termin absagen',
      }),
    );
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'Ausfallhonorar' })).getByRole('button', {
        name: 'Verstanden, weiter',
      }),
    );
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Termin absagen')).toBeInTheDocument();
    expect(within(ende).queryByText('Wann')).not.toBeInTheDocument();
    // „← Zurück“ führt auf den Hinweis dieses Wegs, nicht auf „Wann passt es Ihnen?“.
    await nutzer.click(within(ende).getByRole('button', { name: '← Zurück' }));
    expect(screen.getByRole('dialog', { name: 'Ausfallhonorar' })).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Verstanden, weiter' }));
    await nutzer.click(screen.getByRole('button', { name: 'Absage senden' }));
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'cancel', tage: [], zeiten: [] }),
      ),
    );
  });

  it('fragt vor dem Schließen, sobald etwas gewählt ist', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN);
    await nutzer.click(await screen.findByRole('button', { name: 'Termin ändern' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Montag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));
    const rueckfrage = screen.getByRole('dialog', { name: 'Ihr Wunsch ist noch nicht gesendet' });
    await nutzer.click(within(rueckfrage).getByRole('button', { name: 'Weiter ausfüllen' }));
    expect(screen.getByRole('checkbox', { name: 'Montag' })).toBeChecked();
    expect(screen.getByTestId('ort')).toHaveTextContent(`/p/termine/${TERMIN.id}`);

    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'Ihr Wunsch ist noch nicht gesendet' })).getByRole(
        'button',
        { name: 'Verwerfen' },
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('ort')).toHaveTextContent(/^\/p\/termine\?bereich=treatment$/),
    );
    expect(terminAendernWuenschen).not.toHaveBeenCalled();
  });

  it('besteht axe auf jeder Seite beider Wege', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN);
    await screen.findByRole('dialog', { name: 'Was möchten Sie?' });
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(screen.getByRole('button', { name: 'Termin absagen' }));
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(screen.getByRole('button', { name: 'Verstanden, weiter' }));
    await nutzer.click(screen.getByText('Nachricht an die Praxis (freiwillig)'));
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(screen.getByRole('button', { name: 'Ändern: Termin absagen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Termin ändern' }));
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(screen.getByRole('checkbox', { name: 'Montag' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Mittag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByRole('dialog', { name: 'Ist alles richtig?' })).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
  });

  it('geht mit dem Zurück des Browsers einen Schritt zurück, auf der ersten Seite hinaus', async () => {
    const nutzer = userEvent.setup();
    const router = zeigeMitVerlauf(TERMIN);
    await nutzer.click(await screen.findByRole('button', { name: 'Termin absagen' }));
    expect(await screen.findByRole('dialog', { name: 'Ausfallhonorar' })).toBeInTheDocument();
    // Die Zurückgeste des Telefons: ein Schritt zurück, nicht aus dem Ablauf.
    await act(() => router.navigate(-1));
    expect(await screen.findByRole('dialog', { name: 'Was möchten Sie?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/p/termine/${TERMIN.id}`);
    // Auf der ersten Seite ist nichts zu verlieren: Die Geste führt zur Liste.
    await act(() => router.navigate(-1));
    expect(await screen.findByTestId('ort')).toHaveTextContent(/^\/p\/termine\?bereich=treatment$/);
  });

  // Was sich nicht ändern lässt, zeigt die Seite des Termins.
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
    zeige(TERMIN, '/p/termine/aaaaaaaa-aaaa-4aaa-8aaa-0000000000ff?bereich=treatment');
    expect(await screen.findByText('Dieser Termin wurde nicht gefunden.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Termine' })).toHaveAttribute(
      'href',
      '/p/termine?bereich=treatment',
    );
  });

  it('zeigt die Abweisung des Servers als Satz und bleibt in der Zusammenfassung', async () => {
    const nutzer = userEvent.setup();
    terminAendernWuenschen.mockRejectedValue(
      new Error('Zu diesem Termin liegt schon ein Wunsch vor. Die Praxis meldet sich.'),
    );
    zeige(TERMIN, `/p/termine/${TERMIN.id}?bereich=treatment&art=cancel`);
    await nutzer.click(await screen.findByRole('button', { name: 'Verstanden, weiter' }));
    await nutzer.click(screen.getByRole('button', { name: 'Absage senden' }));
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(await within(ende).findByRole('alert')).toHaveTextContent('schon ein Wunsch vor');
  });

  it('sendet keine Nachricht über 500 Zeichen', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, `/p/termine/${TERMIN.id}?bereich=treatment&art=cancel`);
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
