import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import * as api from './api';
import { CHECK_ITEMS } from './bike3d/zones';
import { CheckupPage } from './CheckupPage';
import { Zielanzeige } from './Testbausteine';
import { testDetail, testFlotte, testRad, testStelle } from './testdaten';
import { rendereSeite } from './testseite';

vi.mock('./bike3d/BikeModel3D', async () => ({
  BikeModel3D: (await import('./Testbausteine')).RadStellvertreter,
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleet: vi.fn(),
  fetchBike: vi.fn(),
  recordCheckup: vi.fn(),
}));

const fetchFleet = vi.mocked(api.fetchFleet);
const fetchBike = vi.mocked(api.fetchBike);
const recordCheckup = vi.mocked(api.recordCheckup);

const RAD = testRad();

function oeffne(pfad = `/betrieb/flotte/checkup?rad=${RAD.id}`) {
  return rendereSeite(
    '/betrieb/flotte/checkup',
    <CheckupPage user={testUser(['therapist'])} />,
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
      { path: '/betrieb/flotte/checkup', element: <CheckupPage user={testUser(['therapist'])} /> },
      { path: '*', element: <Zielanzeige /> },
    ],
    {
      initialEntries: ['/betrieb/flotte/checkup', `/betrieb/flotte/checkup?rad=${RAD.id}`],
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

/** Das Fenster des geführten Check-Ups; sein Name ist die Frage der Seite. */
async function fenster(name: string | RegExp) {
  return screen.findByRole('dialog', { name });
}

/** Beantwortet die Punkte von `von` bis vor `bis` mit „In Ordnung“. */
async function inOrdnungBis(nutzer: ReturnType<typeof userEvent.setup>, bis: number, von = 0) {
  for (const item of CHECK_ITEMS.slice(von, bis)) {
    const seite = await fenster(item.label);
    await nutzer.click(within(seite).getByRole('button', { name: 'In Ordnung' }));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchFleet.mockResolvedValue(testFlotte());
  fetchBike.mockResolvedValue(
    testDetail({ bike: RAD, spots: [], checkups: [], breakdowns: [], blocks: [] }),
  );
  recordCheckup.mockResolvedValue({ checkupId: 'checkup-neu', spotIds: ['stelle-neu'] });
});

/**
 * Der geführte Check-Up (FLT-005, ANN-563): ein Fenster, eine Seite je
 * Prüfpunkt am 3D-Rad, „In Ordnung“ führt weiter, „Beobachten“ und „Problem“
 * fragen nach Stelle und Befund. Gespeichert wird wie bisher (ANN-553, 555).
 */
describe('Geführter Check-Up', () => {
  it('führt Punkt für Punkt durch die zwölf Prüfpunkte; „In Ordnung“ geht gleich weiter', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    const erste = await fenster('Reifen und Luftdruck');
    expect(within(erste).getByText('Prüfpunkt 1 von 12')).toBeInTheDocument();
    // Unter dem Titel das Rad mit Bauart (Regel 6), wie vorher im Seitenkopf.
    expect(within(erste).getByText(`${RAD.name} · Load 60 · Riemenantrieb`)).toBeInTheDocument();
    // Das Rad schaut auf die Bauteile des Punkts und hebt sie hervor.
    expect(screen.getByTestId('fokus')).toHaveTextContent('reifen-vorne reifen-hinten');
    expect(screen.getByTestId('hervorgehoben')).toHaveTextContent('reifen-vorne reifen-hinten');
    expect(within(erste).getByText('Reifen vorne · Reifen hinten')).toBeInTheDocument();
    // Auf der ersten Seite gibt es kein Zurück.
    expect(within(erste).queryByRole('button', { name: '← Zurück' })).not.toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);

    await inOrdnungBis(nutzer, 12);
    const abschluss = await fenster('Alles geprüft?');
    expect(
      within(abschluss).getByText('0 Probleme · 0 zu beobachten · 0 Stellen am Rad markiert'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('fokus')).toHaveTextContent('schraeg');
    await pruefeBarrierefreiheit(document.body);
  });

  it('fragt bei „Problem“ nach der Stelle und dem Befund und geht dann weiter', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await inOrdnungBis(nutzer, 2);
    const bremsen = await fenster('Bremsen');
    await nutzer.click(within(bremsen).getByRole('button', { name: 'Problem' }));

    // „Wo genau?“: die Bauteile des Punkts als Knöpfe, auch ohne 3D-Rad.
    const wo = within(await fenster('Bremsen'));
    expect(wo.getByRole('group', { name: /Wo genau\?/ })).toBeInTheDocument();
    await nutzer.click(wo.getByRole('button', { name: 'Bremse hinten' }));

    const was = within(await fenster('Bremsen'));
    expect(screen.getByTestId('neue-nadel')).toHaveTextContent('1:bremse-hinten');
    expect(was.getByRole('radio', { name: 'Problem' })).toBeChecked();
    await nutzer.type(was.getByLabelText('Was ist aufgefallen?'), 'schleift');
    await nutzer.click(was.getByRole('button', { name: 'Weiter' }));

    expect(await fenster('Riemen und Antrieb')).toBeInTheDocument();
    expect(screen.getByTestId('nadeln')).toHaveTextContent('1:bremse-hinten:problem');
  });

  it('nimmt einen Tipp aufs Rad gleich auf der Frage als Problem an dieser Stelle', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    // Ein Bauteil eines anderen Punkts gilt nicht.
    await nutzer.click(await screen.findByRole('button', { name: 'Bremse vorne antippen' }));
    expect(screen.getByTestId('hinweis')).toHaveTextContent('Bremse vorne: anderer Prüfpunkt');
    expect(await fenster('Reifen und Luftdruck')).toBeInTheDocument();

    await inOrdnungBis(nutzer, 2);
    await fenster('Bremsen');
    await nutzer.click(screen.getByRole('button', { name: 'Bremse vorne antippen' }));
    const was = within(await fenster('Bremsen'));
    expect(was.getByText('Bremse vorne')).toBeInTheDocument();
    expect(was.getByRole('radio', { name: 'Problem' })).toBeChecked();
    await nutzer.click(was.getByRole('radio', { name: 'Beobachten' }));
    await nutzer.click(was.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByTestId('nadeln')).toHaveTextContent('1:bremse-vorne:beobachten');
  });

  it('ersetzt beim neuen Bewerten die Stelle des Punkts und kehrt aus „Ändern“ zum Abschluss zurück', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await inOrdnungBis(nutzer, 2);
    await nutzer.click(screen.getByRole('button', { name: 'Bremse vorne antippen' }));
    await nutzer.click(within(await fenster('Bremsen')).getByRole('button', { name: 'Weiter' }));
    await inOrdnungBis(nutzer, 12, 3);
    const abschluss = within(await fenster('Alles geprüft?'));
    expect(
      abschluss.getByText('1 Problem · 0 zu beobachten · 1 Stelle am Rad markiert'),
    ).toBeInTheDocument();

    await nutzer.click(abschluss.getByRole('button', { name: 'Bremsen ändern' }));
    const bremsen = within(await fenster('Bremsen'));
    expect(bremsen.getByRole('button', { name: 'Problem' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await nutzer.click(bremsen.getByRole('button', { name: 'In Ordnung' }));

    // Zurück im Abschluss, ohne die Stelle.
    const danach = within(await fenster('Alles geprüft?'));
    expect(
      danach.getByText('0 Probleme · 0 zu beobachten · 0 Stellen am Rad markiert'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('nadeln')).toHaveTextContent('');
  });

  it('führt mit „← Zurück“ dorthin, woher man kam; erst „Weiter“ macht die Antwort gültig', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await inOrdnungBis(nutzer, 1);
    const speichen = within(await fenster('Speichen'));
    await nutzer.click(speichen.getByRole('button', { name: 'Beobachten' }));
    await nutzer.click(
      within(await fenster('Speichen')).getByRole('button', { name: 'Ohne genaue Stelle' }),
    );
    const was = within(await fenster('Speichen'));
    expect(was.getByText('Ohne genaue Stelle am Rad')).toBeInTheDocument();
    await nutzer.click(was.getByRole('button', { name: '← Zurück' }));
    expect(
      within(await fenster('Speichen')).getByRole('group', { name: /Wo genau\?/ }),
    ).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: '← Zurück' }));
    // Ohne „Weiter“ gilt „Beobachten“ nicht.
    expect(
      within(await fenster('Speichen')).getByRole('button', { name: 'Beobachten' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await nutzer.click(screen.getByRole('button', { name: '← Zurück' }));
    const reifen = within(await fenster('Reifen und Luftdruck'));
    expect(reifen.getByRole('button', { name: 'In Ordnung' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('führt nach einem Tipp aufs Rad mit „← Zurück“ zur Frage, ohne Stelle und ohne Antwort', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await inOrdnungBis(nutzer, 2);
    await fenster('Bremsen');
    await nutzer.click(screen.getByRole('button', { name: 'Bremse vorne antippen' }));
    expect(screen.getByTestId('neue-nadel')).toHaveTextContent('1:bremse-vorne');
    await nutzer.click(within(await fenster('Bremsen')).getByRole('button', { name: '← Zurück' }));
    const bremsen = within(await fenster('Bremsen'));
    expect(bremsen.queryByRole('group', { name: /Wo genau\?/ })).not.toBeInTheDocument();
    expect(bremsen.getByRole('button', { name: 'Problem' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('neue-nadel')).toHaveTextContent('');
  });

  it('fragt bei einem Punkt mit nur einem Bauteil nicht „Wo genau?“', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await inOrdnungBis(nutzer, 4);
    await nutzer.click(
      within(await fenster('Licht vorne')).getByRole('button', { name: 'Problem' }),
    );
    const was = within(await fenster('Licht vorne'));
    expect(was.queryByRole('group', { name: /Wo genau\?/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('neue-nadel')).toHaveTextContent('1:licht-vorne');
    // Das Beispiel passt zum Punkt.
    expect(was.getByLabelText('Was ist aufgefallen?')).toHaveAttribute(
      'placeholder',
      'z. B. Licht flackert',
    );
    await nutzer.click(was.getByRole('button', { name: '← Zurück' }));
    expect(
      within(await fenster('Licht vorne')).getByRole('button', { name: 'In Ordnung' }),
    ).toBeInTheDocument();
  });

  it('bietet auf „Wo genau?“ „Doch in Ordnung“ und sagt auf der nächsten Seite, was notiert ist', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await inOrdnungBis(nutzer, 2);
    await nutzer.click(within(await fenster('Bremsen')).getByRole('button', { name: 'Problem' }));
    await nutzer.click(
      within(await fenster('Bremsen')).getByRole('button', { name: 'Doch in Ordnung' }),
    );
    const antrieb = within(await fenster('Riemen und Antrieb'));
    expect(antrieb.getByRole('status')).toHaveTextContent('Bremsen: ✓ In Ordnung');
  });

  it('fragt, bevor „In Ordnung“ eine Stelle mit Notiz verwirft, und zeigt sie an ihrem Punkt', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await inOrdnungBis(nutzer, 2);
    await nutzer.click(screen.getByRole('button', { name: 'Bremse vorne antippen' }));
    await nutzer.type(screen.getByLabelText('Was ist aufgefallen?'), 'Belag schleift');
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(
      within(await fenster('Riemen und Antrieb')).getByRole('button', { name: '← Zurück' }),
    );

    const bremsen = within(await fenster('Bremsen'));
    expect(bremsen.getByText(/Neu: Belag schleift/).closest('p')).toHaveTextContent(
      '× Problem · Neu: Belag schleift',
    );
    await nutzer.click(bremsen.getByRole('button', { name: 'In Ordnung' }));
    expect(bremsen.getByText('Stelle 1 „Belag schleift“ verwerfen?')).toBeInTheDocument();
    await nutzer.click(bremsen.getByRole('button', { name: 'Behalten' }));
    expect(screen.getByTestId('nadeln')).toHaveTextContent('1:bremse-vorne:problem');

    await nutzer.click(bremsen.getByRole('button', { name: 'In Ordnung' }));
    await nutzer.click(bremsen.getByRole('button', { name: 'Verwerfen' }));
    expect(await fenster('Riemen und Antrieb')).toBeInTheDocument();
    expect(screen.getByTestId('nadeln')).toHaveTextContent('');
  });

  it('nimmt nach jedem Seitenwechsel kurz keinen Tipp an (Doppeltipp)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await inOrdnungBis(nutzer, 1);
    const knopf = within(await fenster('Speichen')).getByRole('button', { name: 'In Ordnung' });
    expect(knopf.closest('.pointer-events-none')).not.toBeNull();
    await waitFor(() => expect(knopf.closest('.pointer-events-none')).toBeNull(), {
      timeout: 2000,
    });
  });

  it('geht mit dem Zurück des Browsers einen Schritt zurück und fragt erst auf dem ersten', async () => {
    const nutzer = userEvent.setup();
    const router = oeffneMitVerlauf();
    await nutzer.click(
      within(await fenster('Reifen und Luftdruck')).getByRole('button', { name: 'In Ordnung' }),
    );
    await fenster('Speichen');

    await act(() => router.navigate(-1));
    const reifen = within(await fenster('Reifen und Luftdruck'));
    expect(reifen.getByRole('button', { name: 'In Ordnung' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('group', { name: 'Ungespeicherter Check-Up' })).toBeNull();

    // Auf dem ersten Schritt: die Rückfrage, in den Worten des Check-Ups.
    await act(() => router.navigate(-1));
    const frage = await screen.findByRole('group', { name: 'Ungespeicherter Check-Up' });
    expect(
      screen.getByRole('dialog', { name: 'Check-Up noch nicht gespeichert.' }),
    ).toBeInTheDocument();
    await nutzer.click(within(frage).getByRole('button', { name: 'Weiter prüfen' }));
    expect(await fenster('Reifen und Luftdruck')).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?rad=${RAD.id}`);
  });

  it('zeigt schon offene Stellen am Punkt und zählt neue danach weiter (ANN-555)', async () => {
    const nutzer = userEvent.setup();
    fetchBike.mockResolvedValue(
      testDetail({
        bike: RAD,
        spots: [testStelle({ id: 'alt', number: 1, zone: 'riemen', note: 'springt über' })],
      }),
    );
    oeffne();
    expect(await screen.findByTestId('nadeln')).toHaveTextContent('1:riemen:problem');
    await inOrdnungBis(nutzer, 3);
    const antrieb = within(await fenster('Riemen und Antrieb'));
    // Mit Nadel und Wort (Regel 5).
    expect(antrieb.getByText(/Schon offen: springt über/).closest('p')).toHaveTextContent(
      '× Problem · Schon offen: springt über',
    );
    await nutzer.click(antrieb.getByRole('button', { name: 'Problem' }));
    await nutzer.click(
      within(await fenster('Riemen und Antrieb')).getByRole('button', { name: 'Motor' }),
    );
    expect(screen.getByTestId('neue-nadel')).toHaveTextContent('2:motor');
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await inOrdnungBis(nutzer, 12, 4);

    // Im Abschluss stehen die schon offenen eingeklappt, auch ohne 3D-Rad.
    const abschluss = within(await fenster('Alles geprüft?'));
    await nutzer.click(abschluss.getByText('Schon offen am Rad'));
    expect(abschluss.getByRole('list', { name: 'Schon offen am Rad' })).toHaveTextContent(
      'springt über',
    );
  });

  it('markiert im Abschluss eine weitere Stelle ohne Prüfpunkt', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await inOrdnungBis(nutzer, 12);
    const abschluss0 = within(await fenster('Alles geprüft?'));
    await nutzer.click(abschluss0.getByText('Notiz, Fotos, weitere Stelle'));
    await nutzer.click(abschluss0.getByRole('button', { name: 'Weitere Stelle markieren' }));
    await fenster('Weitere Stelle');
    await nutzer.click(screen.getByRole('button', { name: 'Rahmen antippen' }));
    const stelle = screen.getByRole('group', { name: 'Rahmen' });
    expect(
      within(stelle).getByText('Kein eigener Prüfpunkt. Wird als weitere Stelle festgehalten.'),
    ).toBeInTheDocument();
    await nutzer.click(within(stelle).getByRole('button', { name: 'Stelle setzen' }));
    const abschluss = within(await fenster('Alles geprüft?'));
    expect(
      abschluss.getByText('1 Problem · 0 zu beobachten · 1 Stelle am Rad markiert'),
    ).toBeInTheDocument();
    expect(abschluss.getByText(/^· weitere Stelle$/)).toBeInTheDocument();
  });

  it('speichert erst mit dem Haken, mit denselben Angaben wie bisher', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await inOrdnungBis(nutzer, 2);
    await nutzer.click(screen.getByRole('button', { name: 'Bremse vorne antippen' }));
    await nutzer.type(screen.getByLabelText('Was ist aufgefallen?'), 'schleift');
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await inOrdnungBis(nutzer, 12, 3);

    const abschluss = within(await fenster('Alles geprüft?'));
    const speichern = abschluss.getByRole('button', { name: 'Check-Up speichern' });
    expect(speichern).toBeDisabled();
    expect(abschluss.getByText('Die Bestätigung fehlt noch.')).toBeInTheDocument();
    await nutzer.click(
      abschluss.getByRole('checkbox', { name: /Ich, Anna Beispiel, habe das ganze Rad/ }),
    );
    await nutzer.click(speichern);

    expect(recordCheckup).toHaveBeenCalledTimes(1);
    const eingabe = recordCheckup.mock.calls[0]![0];
    expect(eingabe.bikeId).toBe(RAD.id);
    expect(eingabe.items).toHaveLength(12);
    expect(eingabe.items.find((item) => item.key === 'bremsen')).toEqual({
      key: 'bremsen',
      rating: 'problem',
      note: 'schleift',
    });
    expect(eingabe.items.filter((item) => item.rating === 'ok')).toHaveLength(11);
    expect(eingabe.spots).toEqual([
      { zone: 'bremse-vorne', severity: 'problem', point: [1.05, 0.31, -0.06], note: 'schleift' },
    ]);
    expect(await screen.findByTestId('ziel')).toHaveTextContent(
      `/betrieb/flotte/rad/${RAD.id}?bereich=stellen`,
    );
    expect(screen.getByTestId('ziel-meldung')).toHaveTextContent('Check-Up gespeichert.');
  });

  it('schließt ohne Eingaben gleich und fragt mit Eingaben nach', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await fenster('Reifen und Luftdruck');
    await nutzer.click(screen.getByRole('button', { name: 'In Ordnung' }));
    await nutzer.click(screen.getByRole('button', { name: 'Check-Up abbrechen' }));
    const frage = await screen.findByRole('group', { name: 'Ungespeicherter Check-Up' });
    expect(
      screen.getByRole('dialog', { name: 'Check-Up noch nicht gespeichert.' }),
    ).toBeInTheDocument();
    expect(within(frage).getByRole('button', { name: 'Weiter prüfen' })).toBeInTheDocument();
    await nutzer.click(within(frage).getByRole('button', { name: 'Verwerfen' }));
    expect(await screen.findByTestId('ziel')).toHaveTextContent('/betrieb/flotte');
  });

  it('beginnt ohne Rad mit der Wahl, das eigene vorbelegt, nie übersprungen (VOR-18)', async () => {
    const nutzer = userEvent.setup();
    oeffne('/betrieb/flotte/checkup');
    const rad = await screen.findByRole('combobox', { name: 'Rad' });
    expect(rad).toHaveValue(RAD.id);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(await fenster('Reifen und Luftdruck')).toBeInTheDocument();
  });
});
