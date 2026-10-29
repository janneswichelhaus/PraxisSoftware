import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { AUSFALLHONORAR_RECHTZEITIG, AUSFALLHONORAR_SPAET } from '@/lib/ausfallhonorar';
import type * as PlattformApi from './api';
import type { Plattformzugang, Termin } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Termin ändern oder absagen in zwei Schritten ab der Seite des Termins (Handoff „Termine“ 5.4):
 * Ändern mit „Wann passt es Ihnen?“, Absagen mit dem Ausfallhonorar, dann die Zusammenfassung.
 * Beides geht als Wunsch an den Server, nie als Absage.
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

const SEITE = `/p/termine/${TERMIN.id}?bereich=treatment`;
const AENDERN = `${SEITE}&art=change`;
const ABSAGEN = `${SEITE}&art=cancel`;

/** Wo die Anwendung gerade steht - nach dem Senden oder Schließen. */
function Ort() {
  const { pathname, search } = useLocation();
  return <p data-testid="ort">{`${pathname}${search}`}</p>;
}

function zeige(termin: Termin, pfad: string) {
  ladeTermine.mockResolvedValue([termin]);
  return renderWithProviders(
    <>
      <Terminaenderung zugang={ZUGANG} />
      <Ort />
    </>,
    pfad,
  );
}

/** Mit der Seite des Termins davor im Verlauf - für das Zurück des Browsers. */
function zeigeMitVerlauf(termin: Termin, pfad: string) {
  ladeTermine.mockResolvedValue([termin]);
  const router = createMemoryRouter(
    [
      {
        path: '/p/termine/:terminId',
        element: (
          <>
            <Terminaenderung zugang={ZUGANG} />
            <Ort />
          </>
        ),
      },
    ],
    { initialEntries: [SEITE, pfad], initialIndex: 1 },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** Tag und Zeit wie auf der Karte; Testing Library liest das geschützte Leerzeichen als Leerzeichen. */
const TAG_UND_ZEIT = `${tagInWorten(TERMIN.starts_at)}, ${vonBis(TERMIN)}`.replace(/\u00a0/g, ' ');

/** Ein Tag oder eine Tageszeit: ein Schalter mit `aria-pressed`. */
function wahl(name: string, in_: HTMLElement = document.body) {
  return within(in_).getByRole('button', { name });
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

describe('Terminaenderung: Ändern (Handoff „Termine“ 5.4)', () => {
  it('beginnt mit „Wann passt es Ihnen?“ als Schritt 1 von 2, den Termin im Kopf, ohne „← Zurück“', async () => {
    zeige(TERMIN, AENDERN);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    expect(within(wann).getByText('Schritt 1 von 2')).toBeInTheDocument();
    expect(within(wann).getByText(terminKurz(TERMIN))).toBeInTheDocument();
    expect(within(wann).queryByRole('button', { name: '← Zurück' })).not.toBeInTheDocument();
    expect(wahl('Montag', wann)).toHaveFocus();
    for (const name of ['Montag', 'Freitag', 'Vormittag', 'Egal']) {
      expect(wahl(name, wann)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('sendet einen Änderungswunsch: „Ihr Termin“, „Lieber am“ und der Satz zur Freigabe über dem Knopf', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, AENDERN);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await nutzer.click(wahl('Montag', wann));
    await nutzer.click(wahl('Vormittag', wann));
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));

    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Schritt 2 von 2')).toBeInTheDocument();
    expect(within(ende).getByText('Ihr Termin')).toBeInTheDocument();
    expect(within(ende).getByText(TAG_UND_ZEIT)).toBeInTheDocument();
    expect(within(ende).getByText('Hausbesuch · Anna Beispiel')).toBeInTheDocument();
    expect(within(ende).getByText('Lieber am')).toBeInTheDocument();
    expect(within(ende).getByText('Montag, vormittags')).toBeInTheDocument();
    // Den Termin selbst ändert man hier nicht, nur die Wahl.
    expect(within(ende).getAllByRole('button', { name: /^Ändern/ })).toHaveLength(1);
    const freigabe = within(ende).getByRole('status');
    expect(freigabe).toHaveTextContent('es entsteht kein Ausfallhonorar');
    const knopf = within(ende).getByRole('button', { name: 'Änderungswunsch senden' });
    expect(freigabe.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Die Frage ist der Aufklapper; das Feld heißt nach ihr.
    await nutzer.click(within(ende).getByText('Was sollen wir noch wissen? (freiwillig)'));
    expect(within(ende).getByLabelText('Was sollen wir noch wissen?')).toHaveFocus();
    await nutzer.keyboard('Bitte nicht vor 10 Uhr.');
    await nutzer.click(knopf);
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith({
        zugangId: ZUGANG.access_id,
        terminId: TERMIN.id,
        art: 'change',
        tage: tageAm(1),
        zeiten: ['morning'],
        notiz: 'Bitte nicht vor 10 Uhr.',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('ort')).toHaveTextContent(
        /^\/p\/termine\?bereich=treatment&gesendet=1$/,
      ),
    );
  });

  it('warnt beim Ändern unter 24 Stunden vor dem Freigeben', async () => {
    const nutzer = userEvent.setup();
    zeige(KURZFRISTIG, AENDERN);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await nutzer.click(wahl('Dienstag', wann));
    await nutzer.click(wahl('Egal', wann));
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    const hinweis = within(ende).getByRole('status');
    expect(hinweis).toHaveTextContent('wie eine kurzfristige Absage');
    expect(hinweis).toHaveClass('text-warnung');
  });

  it('sagt auf „Wann passt es Ihnen?“, was fehlt; „Egal“ nimmt die einzelnen Tageszeiten zurück', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, AENDERN);
    const wann = await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    expect(within(wann).getByRole('alert')).toHaveTextContent(
      'Bitte wählen Sie mindestens einen Tag.',
    );
    await nutzer.click(wahl('Freitag', wann));
    expect(within(wann).queryByRole('alert')).not.toBeInTheDocument();
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    expect(within(wann).getByRole('alert')).toHaveTextContent(
      'Bitte wählen Sie eine Tageszeit oder „Egal“.',
    );
    await nutzer.click(wahl('Nachmittag', wann));
    await nutzer.click(wahl('Egal', wann));
    expect(wahl('Nachmittag', wann)).toHaveAttribute('aria-pressed', 'false');
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
    await nutzer.click(wahl('Montag', wann));
    await nutzer.click(wahl('Vormittag', wann));
    await nutzer.click(within(wann).getByRole('button', { name: 'Weiter' }));
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'Ist alles richtig?' })).getByRole('button', {
        name: 'Ändern: Lieber am',
      }),
    );
    const wieder = screen.getByRole('dialog', { name: 'Wann passt es Ihnen?' });
    // Die Wahl von vorhin steht noch da.
    expect(wahl('Montag', wieder)).toHaveAttribute('aria-pressed', 'true');
    await nutzer.click(wahl('Mittwoch', wieder));
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

  it('fragt vor dem Schließen, sobald etwas gewählt ist; ✕ führt zur Seite des Termins', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, AENDERN);
    await nutzer.click(await screen.findByRole('button', { name: 'Montag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));
    const rueckfrage = screen.getByRole('dialog', { name: 'Ihr Wunsch ist noch nicht gesendet' });
    await nutzer.click(within(rueckfrage).getByRole('button', { name: 'Weiter ausfüllen' }));
    expect(wahl('Montag')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ort')).toHaveTextContent(AENDERN);

    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'Ihr Wunsch ist noch nicht gesendet' })).getByRole(
        'button',
        { name: 'Verwerfen' },
      ),
    );
    await waitFor(() => expect(screen.getByTestId('ort').textContent).toBe(SEITE));
    expect(await screen.findByRole('link', { name: 'Termin ändern' })).toBeInTheDocument();
    expect(terminAendernWuenschen).not.toHaveBeenCalled();
  });
});

describe('Terminaenderung: Absagen (Handoff „Termine“ 5.4)', () => {
  it('beginnt beim Ausfallhonorar: rechtzeitig als Karte, die Regel auf Abruf', async () => {
    zeige(TERMIN, ABSAGEN);
    const hinweis = await screen.findByRole('dialog', { name: 'Ausfallhonorar' });
    expect(within(hinweis).getByText('Schritt 1 von 2')).toBeInTheDocument();
    expect(within(hinweis).queryByRole('button', { name: '← Zurück' })).not.toBeInTheDocument();
    expect(within(hinweis).getByText(AUSFALLHONORAR_RECHTZEITIG)).toBeInTheDocument();
    expect(within(hinweis).queryByRole('alert')).not.toBeInTheDocument();
    const regel = within(hinweis).getByText('Unsere Regel zum Ausfallhonorar').closest('details');
    expect(regel).not.toHaveAttribute('open');
  });

  it('sendet die Absage aus der Zusammenfassung mit Tag, Zeit, Art und Person', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, ABSAGEN);
    const hinweis = await screen.findByRole('dialog', { name: 'Ausfallhonorar' });
    await nutzer.click(within(hinweis).getByRole('button', { name: 'Verstanden, weiter' }));

    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    expect(within(ende).getByText('Schritt 2 von 2')).toBeInTheDocument();
    expect(within(ende).getByText('Termin absagen')).toBeInTheDocument();
    expect(within(ende).getByText(TAG_UND_ZEIT)).toBeInTheDocument();
    expect(within(ende).getByText('Hausbesuch · Anna Beispiel')).toBeInTheDocument();
    expect(within(ende).queryByRole('button', { name: /^Ändern/ })).not.toBeInTheDocument();
    expect(
      within(ende).getByText(/Als Eingang Ihrer Absage gilt der Zeitpunkt/),
    ).toBeInTheDocument();
    // Rechtzeitig: keine Warnung über dem Knopf.
    expect(within(ende).queryByRole('status')).not.toBeInTheDocument();
    // Die Nachricht ist eingeklappt und freiwillig; die Frage ist der Aufklapper.
    const feld = within(ende).getByLabelText('Möchten Sie der Praxis etwas mitteilen?');
    expect(feld).not.toBeVisible();
    await nutzer.click(
      within(ende).getByText('Möchten Sie der Praxis etwas mitteilen? (freiwillig)'),
    );
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

  it('warnt unter 24 Stunden deutlich, mit offener Regel, und noch einmal vor dem Knopf (ADR-018 Punkt 8)', async () => {
    const nutzer = userEvent.setup();
    zeige(KURZFRISTIG, ABSAGEN);
    const seite = await screen.findByRole('dialog', { name: 'Ausfallhonorar' });
    const warnung = within(seite).getByRole('alert');
    expect(warnung).toHaveTextContent(AUSFALLHONORAR_SPAET);
    expect(warnung).toHaveClass('text-warnung');
    const regel = within(seite).getByText('Unsere Regel zum Ausfallhonorar').closest('details');
    expect(regel).toHaveAttribute('open');
    expect(within(seite).getByText(/Genau 24 Stunden vorher genügt/)).toBeVisible();
    // Der Hinweis steht vor dem Knopf.
    const weiter = within(seite).getByRole('button', { name: 'Verstanden, weiter' });
    expect(warnung.compareDocumentPosition(weiter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await nutzer.click(weiter);
    // Und in der Zusammenfassung noch einmal, direkt über „Absage senden“.
    const ende = screen.getByRole('dialog', { name: 'Ist alles richtig?' });
    const nochmal = within(ende).getByRole('status');
    expect(nochmal).toHaveTextContent('weniger als 24 Stunden');
    expect(nochmal).toHaveClass('text-warnung');
    const senden = within(ende).getByRole('button', { name: 'Absage senden' });
    expect(nochmal.compareDocumentPosition(senden) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('schließt auf der ersten Seite ohne Rückfrage zur Seite des Termins, mit dem Rückweg von dort', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN, `/p/termine/${TERMIN.id}?bereich=treatment&zurueck=%2Fp&art=cancel`);
    await nutzer.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    await waitFor(() =>
      expect(screen.getByTestId('ort').textContent).toBe(
        `/p/termine/${TERMIN.id}?bereich=treatment&zurueck=%2Fp`,
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    expect(await screen.findByRole('link', { name: 'Termin absagen' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    await nutzer.click(screen.getByText('Möchten Sie der Praxis etwas mitteilen? (freiwillig)'));
    const feld = screen.getByLabelText('Möchten Sie der Praxis etwas mitteilen?');
    await nutzer.click(feld);
    await nutzer.paste('a'.repeat(501));
    await nutzer.click(screen.getByRole('button', { name: 'Absage senden' }));
    expect(screen.getByRole('alert')).toHaveTextContent('höchstens 500 Zeichen');
    expect(terminAendernWuenschen).not.toHaveBeenCalled();
  });
});

describe('Terminaenderung: Barrierefreiheit und was sich nicht ändern lässt', () => {
  it('besteht axe auf jeder Seite beider Wege', async () => {
    const nutzer = userEvent.setup();
    const absagen = zeige(KURZFRISTIG, ABSAGEN);
    await screen.findByRole('dialog', { name: 'Ausfallhonorar' });
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(screen.getByRole('button', { name: 'Verstanden, weiter' }));
    await nutzer.click(screen.getByText('Möchten Sie der Praxis etwas mitteilen? (freiwillig)'));
    await pruefeBarrierefreiheit(document.body);
    absagen.unmount();

    zeige(TERMIN, AENDERN);
    await screen.findByRole('dialog', { name: 'Wann passt es Ihnen?' });
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(wahl('Montag'));
    await nutzer.click(wahl('Mittag'));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByRole('dialog', { name: 'Ist alles richtig?' })).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
  });

  it('zeigt ohne gültige Art die Seite des Termins statt eines Ablaufs', async () => {
    zeige(TERMIN, `${SEITE}&art=absagen`);
    expect(await screen.findByRole('link', { name: 'Termin absagen' })).toBeInTheDocument();
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
});
