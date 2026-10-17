import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import * as api from './api';
import { KeyPage } from './KeyPage';
import { Zielanzeige } from './Testbausteine';
import { NINA, TIM, testFlotte, testRad } from './testdaten';
import { rendereSeite } from './testseite';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleet: vi.fn(),
  takeKey: vi.fn(),
  handOverKey: vi.fn(),
}));

const fetchFleet = vi.mocked(api.fetchFleet);
const takeKey = vi.mocked(api.takeKey);
const handOverKey = vi.mocked(api.handOverKey);

function oeffne(pfad = '/betrieb/flotte/schluessel') {
  return rendereSeite(
    '/betrieb/flotte/schluessel',
    <KeyPage user={testUser(['therapist'])} />,
    pfad,
  );
}

/** Mit der Radflotte davor im Verlauf: So drückt ein Test das Zurück des Browsers. */
function oeffneMitVerlauf() {
  const router = createMemoryRouter(
    [
      { path: '/betrieb/flotte/schluessel', element: <KeyPage user={testUser(['therapist'])} /> },
      { path: '*', element: <Zielanzeige /> },
    ],
    { initialEntries: ['/betrieb/flotte', '/betrieb/flotte/schluessel'], initialIndex: 1 },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** Das Fenster des Ablaufs; sein Name ist die Frage der Seite. */
function fenster(name: string) {
  return screen.findByRole('dialog', { name });
}

/** Die Zeilen einer Liste im Fenster, als Text. */
function zeilen(liste: HTMLElement) {
  return within(liste)
    .getAllByRole('listitem')
    .map((zeile) => zeile.textContent);
}

beforeEach(() => {
  vi.clearAllMocks();
  const flotte = testFlotte();
  fetchFleet.mockResolvedValue({
    ...flotte,
    bikes: [
      ...flotte.bikes,
      testRad({
        id: 'rad-2',
        name: 'Lastenrad 2',
        key: { holder_staff_id: TIM.id, holder_name: TIM.name, taken_at: '2026-10-15T05:40:00Z' },
      }),
    ],
  });
  takeKey.mockResolvedValue();
  handOverKey.mockResolvedValue();
});

/**
 * Schlüssel übergeben (FLT-EPIC-001; geführt seit Überholung 6, G4): Räder
 * mit Schlüssel im Tresor und bei jemandem, ohne Sperre; die Person aus dem
 * Mitarbeiterstamm, die eigene zuerst; nichts vorgewählt außer dem Rad aus der
 * Adresszeile (VOR-18). Aus dem Tresor `takeKey`, von Hand zu Hand
 * `handOverKey` (ANN-575).
 */
describe('Schlüssel übergeben', () => {
  it('bietet Räder mit Schlüssel im Tresor und bei jemandem an, kein gesperrtes, nichts vorgewählt', async () => {
    oeffne();
    const rad = await fenster('Welches Rad?');
    expect(within(rad).getByText('Schritt 1 von 3')).toBeInTheDocument();
    expect(within(rad).queryByRole('button', { name: '← Zurück' })).toBeNull();
    expect(zeilen(within(rad).getByRole('list', { name: 'Räder' }))).toEqual([
      'Lastenrad 1Schlüssel im Tresor · Raddepot Nord',
      'Lastenrad 4Schlüssel im Tresor · Raddepot Nord',
      'Lastenrad 5 (Ersatz)Schlüssel im Tresor · Raddepot Süd',
      'Lastenrad 2Schlüssel bei Tim Teamleitung · Raddepot Nord',
    ]);
    expect(within(rad).queryByText('Gewählt')).toBeNull();
    await pruefeBarrierefreiheit(document.body);
  });

  it('trägt den Schlüssel aus dem Tresor für sich selbst ein, ohne Personenangabe', async () => {
    const nutzer = userEvent.setup();
    oeffne('/betrieb/flotte/schluessel?rad=rad-4');
    // Mit dem Rad aus der Adresse beginnt der Ablauf bei „An wen?“.
    const person = await fenster('An wen?');
    expect(within(person).getByText('Schlüssel übergeben · Lastenrad 4')).toBeInTheDocument();
    expect(within(person).getByText('Schritt 2 von 3')).toBeInTheDocument();
    expect(within(person).queryByRole('button', { name: '← Zurück' })).toBeNull();
    expect(zeilen(within(person).getByRole('list', { name: 'Personen' }))).toEqual([
      'Anna Beispiel (Sie)',
      'Nina Neu',
      'Tim Teamleitung',
    ]);
    await nutzer.click(within(person).getByRole('button', { name: 'Anna Beispiel (Sie)' }));

    const abschluss = await fenster('Alles richtig?');
    expect(zeilen(within(abschluss).getByRole('list', { name: 'Übergabe' }))).toEqual([
      'RadLastenrad 4Ändern',
      'VonTresor',
      'AnAnna Beispiel (Sie)Ändern',
    ]);
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(within(abschluss).getByRole('button', { name: 'Schlüssel eintragen' }));
    expect(takeKey).toHaveBeenCalledWith('rad-4', null);
    expect(handOverKey).not.toHaveBeenCalled();
    expect(await screen.findByTestId('ziel')).toHaveTextContent('/betrieb/flotte');
    expect(screen.getByTestId('ziel-meldung')).toHaveTextContent(
      'Schlüssel von Lastenrad 4 bei Ihnen eingetragen.',
    );
  });

  it('trägt den Schlüssel für eine Kollegin aus dem Stamm ein', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(
      within(await fenster('Welches Rad?')).getByRole('button', { name: /Lastenrad 5 \(Ersatz\)/ }),
    );
    await nutzer.click(
      within(await fenster('An wen?')).getByRole('button', { name: 'Tim Teamleitung' }),
    );
    await nutzer.click(
      within(await fenster('Alles richtig?')).getByRole('button', { name: 'Schlüssel eintragen' }),
    );
    expect(takeKey).toHaveBeenCalledWith('rad-5', TIM.id);
    expect(await screen.findByTestId('ziel-meldung')).toHaveTextContent(
      'Schlüssel von Lastenrad 5 (Ersatz) bei Tim Teamleitung eingetragen.',
    );
  });

  it('übergibt einen Schlüssel von Hand zu Hand in einem Vorgang, ohne die heutige Halter:in', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(
      within(await fenster('Welches Rad?')).getByRole('button', { name: /Lastenrad 2/ }),
    );
    const person = await fenster('An wen?');
    // Tim hat den Schlüssel - an ihn geht er nicht noch einmal.
    expect(zeilen(within(person).getByRole('list', { name: 'Personen' }))).toEqual([
      'Anna Beispiel (Sie)',
      'Nina Neu',
    ]);
    await nutzer.click(within(person).getByRole('button', { name: 'Nina Neu' }));

    const abschluss = await fenster('Alles richtig?');
    expect(zeilen(within(abschluss).getByRole('list', { name: 'Übergabe' }))).toEqual([
      'RadLastenrad 2Ändern',
      'VonTim Teamleitung',
      'AnNina NeuÄndern',
    ]);
    // Ein Hauptknopf im festen Fuß, mit Linie darüber.
    const knopf = within(abschluss).getByRole('button', {
      name: 'Schlüssel an Nina Neu übergeben',
    });
    expect(knopf.closest('.border-t')).not.toBeNull();
    await nutzer.click(knopf);
    expect(handOverKey).toHaveBeenCalledWith('rad-2', NINA.id);
    expect(takeKey).not.toHaveBeenCalled();
    expect(await screen.findByTestId('ziel-meldung')).toHaveTextContent(
      'Schlüssel von Lastenrad 2 an Nina Neu übergeben.',
    );
  });

  it('kehrt aus „Ändern“ zum Abschluss zurück und fragt nur, was das neue Rad verlangt', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(
      within(await fenster('Welches Rad?')).getByRole('button', { name: /Lastenrad 1/ }),
    );
    await nutzer.click(
      within(await fenster('An wen?')).getByRole('button', { name: 'Tim Teamleitung' }),
    );

    // Ein anderes Rad, Tim passt noch: gleich wieder der Abschluss.
    await nutzer.click(
      within(await fenster('Alles richtig?')).getByRole('button', { name: 'Rad ändern' }),
    );
    const rad = await fenster('Welches Rad?');
    expect(within(rad).getByRole('button', { name: /Lastenrad 1/ })).toHaveTextContent('Gewählt');
    await nutzer.click(within(rad).getByRole('button', { name: /Lastenrad 4/ }));
    expect(
      zeilen(within(await fenster('Alles richtig?')).getByRole('list', { name: 'Übergabe' })),
    ).toEqual(['RadLastenrad 4Ändern', 'VonTresor', 'AnTim TeamleitungÄndern']);

    // Lastenrad 2 liegt schon bei Tim: „An wen?“ ist neu zu beantworten.
    await nutzer.click(screen.getByRole('button', { name: 'Rad ändern' }));
    await nutzer.click(
      within(await fenster('Welches Rad?')).getByRole('button', { name: /Lastenrad 2/ }),
    );
    await nutzer.click(within(await fenster('An wen?')).getByRole('button', { name: 'Nina Neu' }));
    const abschluss = await fenster('Alles richtig?');
    expect(
      within(abschluss).getByRole('button', { name: 'Schlüssel an Nina Neu übergeben' }),
    ).toBeInTheDocument();

    // „← Zurück“ aus dem Ändern führt zum Abschluss zurück.
    await nutzer.click(within(abschluss).getByRole('button', { name: 'Person ändern' }));
    const person = await fenster('An wen?');
    expect(within(person).getByRole('button', { name: /Nina Neu/ })).toHaveTextContent('Gewählt');
    await nutzer.click(within(person).getByRole('button', { name: '← Zurück' }));
    expect(await fenster('Alles richtig?')).toBeInTheDocument();
  });

  it('geht mit dem Zurück des Browsers einen Schritt zurück, auf der ersten Seite hinaus', async () => {
    const nutzer = userEvent.setup();
    const router = oeffneMitVerlauf();
    await nutzer.click(
      within(await fenster('Welches Rad?')).getByRole('button', { name: /Lastenrad 1/ }),
    );
    await fenster('An wen?');
    await act(() => router.navigate(-1));
    expect(await fenster('Welches Rad?')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/betrieb/flotte/schluessel');
    // Auf der ersten Seite ist nichts zu verlieren: Die Geste verlässt den Ablauf.
    await act(() => router.navigate(-1));
    expect(await screen.findByTestId('ziel')).toHaveTextContent('/betrieb/flotte');
  });

  it('schließt über ✕ ohne Rückfrage - gewählt ist nur, was zwei Tipps wiederherstellen', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(
      within(await fenster('Welches Rad?')).getByRole('button', { name: /Lastenrad 1/ }),
    );
    await nutzer.click(
      within(await fenster('An wen?')).getByRole('button', { name: 'Übergabe abbrechen' }),
    );
    expect(await screen.findByTestId('ziel')).toHaveTextContent('/betrieb/flotte');
    expect(takeKey).not.toHaveBeenCalled();
  });

  it('sagt einen Fehler des Servers im Fuß und bleibt im Abschluss', async () => {
    const nutzer = userEvent.setup();
    handOverKey.mockRejectedValue(new Error('Der Schlüssel liegt schon im Tresor.'));
    oeffne('/betrieb/flotte/schluessel?rad=rad-2');
    await nutzer.click(within(await fenster('An wen?')).getByRole('button', { name: 'Nina Neu' }));
    const abschluss = await fenster('Alles richtig?');
    await nutzer.click(
      within(abschluss).getByRole('button', { name: 'Schlüssel an Nina Neu übergeben' }),
    );
    expect(await within(abschluss).findByRole('alert')).toHaveTextContent(
      'Der Schlüssel liegt schon im Tresor.',
    );
    expect(screen.getByRole('dialog', { name: 'Alles richtig?' })).toBeVisible();
  });

  it('übernimmt kein gesperrtes Rad aus der Adresszeile', async () => {
    oeffne('/betrieb/flotte/schluessel?rad=rad-3');
    const rad = await fenster('Welches Rad?');
    expect(within(rad).queryByRole('button', { name: /Lastenrad 3/ })).toBeNull();
  });

  it('sagt, wenn kein Rad frei ist', async () => {
    fetchFleet.mockResolvedValue(
      testFlotte({ bikes: [testFlotte().bikes.find((rad) => rad.block !== null)!] }),
    );
    oeffne();
    expect(await screen.findByText('Kein Rad frei')).toBeInTheDocument();
    expect(screen.getByText('Alle Räder sind in Reparatur.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
