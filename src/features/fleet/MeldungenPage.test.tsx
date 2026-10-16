import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import * as api from './api';
import { MeldungenPage, MeldungPage } from './MeldungenPage';
import { testMeldungCheckup, testMeldungPanne } from './testdaten';
import { rendereSeite } from './testseite';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleetReports: vi.fn(),
}));

const fetchFleetReports = vi.mocked(api.fetchFleetReports);

const ALT = testMeldungCheckup({
  id: 'checkup-alt',
  bike_id: 'rad-3',
  bike_name: 'Lastenrad 3',
  at: '2026-10-10T06:10:00+00:00',
  by_name: 'Tim Teamleitung',
  ad_surfaces: null,
  items: testMeldungCheckup().items.map((item) => ({ ...item, rating: 'ok', note: null })),
  spots: [],
  photos: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchFleetReports.mockResolvedValue([
    testMeldungCheckup({
      ad_surfaces: 'not_possible',
      ad_surfaces_note: 'Kein Tuch im Depot',
      photos: testMeldungCheckup().photos.filter((foto) => foto.side !== 'back'),
    }),
    testMeldungPanne(),
    ALT,
  ]);
});

/** Ein Abschnitt der Seite über seine Überschrift. */
function abschnitt(titel: string): HTMLElement {
  return screen.getByRole('heading', { name: titel }).closest('section')!;
}

function oeffneListe(pfad = '/betrieb/flotte/meldungen') {
  return rendereSeite(
    '/betrieb/flotte/meldungen',
    <MeldungenPage user={testUser(['owner'])} />,
    pfad,
  );
}

function oeffneMeldung(pfad: string) {
  return rendereSeite(
    '/betrieb/flotte/meldungen/:art/:meldungId',
    <MeldungPage user={testUser(['owner'])} />,
    pfad,
  );
}

/** Die Meldungen für den Arbeitgeber (FLT-008, ANN-569). */
describe('Meldungen der Flotte', () => {
  it('listet Check-Ups und Pannen aller Räder mit Ergebnis, Werbeflächen und Seitenfotos', async () => {
    oeffneListe();
    const liste = await screen.findByRole('list', { name: 'Meldungen' });
    const zeilen = within(liste).getAllByRole('listitem');
    expect(zeilen.map((zeile) => within(zeile).getByRole('link').textContent)).toEqual([
      expect.stringContaining('Check-Up · Lastenrad 1'),
      expect.stringContaining('Panne · Lastenrad 3'),
      expect.stringContaining('Check-Up · Lastenrad 3'),
    ]);
    expect(zeilen[0]).toHaveTextContent('Anna Beispiel');
    expect(zeilen[0]).toHaveTextContent('× Problem: Bremsen');
    expect(zeilen[0]).toHaveTextContent('! Werbeflächen nicht abgewischt: Kein Tuch im Depot');
    expect(zeilen[0]).toHaveTextContent('! Seitenfotos: 3 von 4');
    expect(zeilen[1]).toHaveTextContent('! Rad gesperrt');
    // Vor der Einführung: weder Werbeflächen noch Seitenfotos verlangt.
    expect(zeilen[2]).toHaveTextContent('Alles in Ordnung');
    expect(zeilen[2]).not.toHaveTextContent('Seitenfotos');
    expect(fetchFleetReports).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    await pruefeBarrierefreiheit(document.body);
  });

  it('filtert nach Art und Rad, nie nach Person (§20)', async () => {
    const nutzer = userEvent.setup();
    oeffneListe();
    await screen.findByRole('list', { name: 'Meldungen' });
    expect(screen.queryByRole('combobox', { name: /Person|Mitarbeit/ })).not.toBeInTheDocument();
    await nutzer.selectOptions(screen.getByRole('combobox', { name: 'Art' }), 'breakdown');
    expect(
      within(screen.getByRole('list', { name: 'Meldungen' })).getAllByRole('listitem'),
    ).toHaveLength(1);
    await nutzer.selectOptions(screen.getByRole('combobox', { name: 'Art' }), 'alle');
    await nutzer.selectOptions(screen.getByRole('combobox', { name: 'Rad' }), 'rad-3');
    expect(
      within(screen.getByRole('list', { name: 'Meldungen' })).getAllByRole('listitem'),
    ).toHaveLength(2);
  });

  it('zeigt einen Check-Up mit allen Prüfpunkten, Werbeflächen, Seitenfotos und Stellen', async () => {
    oeffneMeldung('/betrieb/flotte/meldungen/checkup/checkup-neu');
    expect(
      await screen.findByRole('heading', { name: 'Check-Up · Lastenrad 1' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Anna Beispiel/)).toBeInTheDocument();
    const pruefpunkte = abschnitt('Prüfpunkte (12)');
    expect(within(pruefpunkte).getAllByRole('listitem')).toHaveLength(12);
    expect(pruefpunkte).toHaveTextContent('Belag schleift');
    expect(screen.getByText('Nicht abgewischt: Kein Tuch im Depot')).toBeInTheDocument();
    for (const name of ['Linke Seite', 'Vorne', 'Rechte Seite']) {
      expect(screen.getByRole('button', { name: `${name} vom Check-Up` })).toBeInTheDocument();
    }
    expect(screen.getByText('Fehlt: Hinten')).toBeInTheDocument();
    const stellen = abschnitt('Stellen am Rad (1)');
    expect(
      within(stellen).getByRole('button', { name: /Foto 1 zu Bremse vorne/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Rad' })).toHaveAttribute(
      'href',
      '/betrieb/flotte/rad/rad-1',
    );
    await pruefeBarrierefreiheit(document.body);
  });

  it('zeigt eine Panne mit Abschluss, Standort und Stellen', async () => {
    oeffneMeldung('/betrieb/flotte/meldungen/panne/panne-3');
    expect(await screen.findByRole('heading', { name: 'Panne · Lastenrad 3' })).toBeInTheDocument();
    expect(screen.getByText('Ins Raddepot gebracht.')).toBeInTheDocument();
    expect(screen.getByText('Gesperrt')).toBeInTheDocument();
    expect(screen.getByText('Vor dem Raddepot Nord')).toBeInTheDocument();
    expect(abschnitt('Stellen am Rad (1)')).toHaveTextContent('Riemen springt über');
  });

  it('sagt es, wenn die Meldung nicht (mehr) in der Liste steht', async () => {
    oeffneMeldung('/betrieb/flotte/meldungen/panne/checkup-neu');
    expect(await screen.findByText('Diese Meldung gibt es hier nicht.')).toBeInTheDocument();
  });

  it('nennt die abgewiesene Berechtigung', async () => {
    fetchFleetReports.mockRejectedValue(new Error('Dafür fehlt die Berechtigung.'));
    oeffneListe();
    expect(
      await screen.findByText(/Die Meldungen konnten nicht geladen werden/),
    ).toBeInTheDocument();
  });
});
