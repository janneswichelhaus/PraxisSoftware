import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import * as api from './api';
import { montagDerWoche, plusTage } from './format';
import { FleetPage } from './FleetPage';
import { ANNA, TIM, testFlotte, testRad } from './testdaten';
import { todayInTimeZone } from '@/lib/datum';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleet: vi.fn(),
  takeKey: vi.fn(),
  returnKey: vi.fn(),
  setCheckupInterval: vi.fn(),
}));

const fetchFleet = vi.mocked(api.fetchFleet);
const takeKey = vi.mocked(api.takeKey);
const returnKey = vi.mocked(api.returnKey);
const setCheckupInterval = vi.mocked(api.setCheckupInterval);

function oeffne(pfad = '/betrieb/flotte') {
  return renderWithProviders(<FleetPage user={testUser(['therapist'])} />, pfad);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchFleet.mockResolvedValue(testFlotte());
  takeKey.mockResolvedValue();
  returnKey.mockResolvedValue();
});

/**
 * Die Radflotte (FLT-EPIC-001): das eigene Rad zuerst, die Schlüssel mit
 * einem Tipp an der Zeile, die Woche an der Zeile statt in einer Tabelle,
 * Rechte vom Server.
 */
describe('Radflotte', () => {
  it('stellt das eigene Rad vor die Depots und nennt den Bestand', async () => {
    const { container } = oeffne();
    const eigenes = await screen.findByRole('heading', { name: 'Ihr Rad' });
    expect(eigenes).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Raddepot Nord (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Raddepot Süd (1)' })).toBeInTheDocument();
    expect(
      screen.getByText('3 verfügbar · 0 im Einsatz · 1 in Reparatur · 4 Räder'),
    ).toBeInTheDocument();
    // Die Woche an der Zeile: Stammnutzer:in mit ihren Tagen.
    expect(screen.getByText('Anna Beispiel · Mo, Di, Do, Fr')).toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('zeigt die Ausnahmen als Zeichen und Wort, den Regelfall ohne Abzeichen', async () => {
    oeffne();
    await screen.findByRole('heading', { name: 'Ihr Rad' });
    // Ein Abzeichen: das gesperrte Rad (das Wort steht sonst nur im Filter).
    expect(
      screen.getAllByText('In Reparatur').filter((element) => element.tagName !== 'OPTION'),
    ).toHaveLength(1);
    expect(screen.getByText('Gehört zu Raddepot Süd.')).toBeInTheDocument();
  });

  it('nimmt den Schlüssel des eigenen Rads mit einem Tipp und sagt es', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(
      await screen.findByRole('button', { name: 'Schlüssel von Lastenrad 1 nehmen' }),
    );
    expect(takeKey).toHaveBeenCalledWith('rad-1', null);
    expect(
      await screen.findByText('Schlüssel von Lastenrad 1 bei Ihnen eingetragen.'),
    ).toBeInTheDocument();
  });

  it('legt einen entnommenen Schlüssel zurück', async () => {
    const nutzer = userEvent.setup();
    fetchFleet.mockResolvedValue(
      testFlotte({
        bikes: [
          testRad({
            key: {
              holder_staff_id: TIM.id,
              holder_name: TIM.name,
              taken_at: '2026-10-15T05:40:00Z',
            },
          }),
        ],
      }),
    );
    oeffne();
    expect(await screen.findByText(/Schlüssel bei Tim Teamleitung/)).toBeInTheDocument();
    await nutzer.click(
      screen.getByRole('button', { name: 'Schlüssel von Lastenrad 1 zurücklegen' }),
    );
    expect(returnKey).toHaveBeenCalledWith('rad-1');
    expect(await screen.findByText('Schlüssel von Lastenrad 1 zurückgelegt.')).toBeInTheDocument();
  });

  it('bietet an einem gesperrten Rad keinen Schlüssel an', async () => {
    oeffne();
    await screen.findByRole('heading', { name: 'Ihr Rad' });
    expect(screen.queryByRole('button', { name: /Schlüssel von Lastenrad 3/ })).toBeNull();
  });

  it('sagt einen Fehler des Servers in Worten', async () => {
    const nutzer = userEvent.setup();
    takeKey.mockRejectedValue(
      new Error('Der Schlüssel ist schon entnommen. Bitte die Liste neu laden.'),
    );
    oeffne();
    await nutzer.click(
      await screen.findByRole('button', { name: 'Schlüssel von Lastenrad 4 nehmen' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Der Schlüssel ist schon entnommen');
  });

  it('bietet „Rad hinzufügen“ nur an, wo der Server es annimmt (ANN-550)', async () => {
    const { unmount } = oeffne();
    await screen.findByRole('heading', { name: 'Ihr Rad' });
    expect(screen.queryByRole('link', { name: 'Rad hinzufügen' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Depots verwalten' })).toBeNull();
    unmount();

    fetchFleet.mockResolvedValue(testFlotte({ can_manage: true }));
    oeffne();
    expect(await screen.findByRole('link', { name: 'Rad hinzufügen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Depots verwalten' })).toBeInTheDocument();
  });

  it('findet das Rad, das am Donnerstag frei ist - auch weil die Stammnutzer:in abwesend ist', async () => {
    const donnerstag = plusTage(montagDerWoche(todayInTimeZone('Europe/Berlin')), 3);
    fetchFleet.mockResolvedValue(
      testFlotte({ unavailable: [{ staff_member_id: ANNA.id, on_date: donnerstag }] }),
    );
    oeffne('/betrieb/flotte?frei=4');
    // Lastenrad 1 (Anna, Do geplant, aber abwesend) und das Ersatzrad sind
    // frei; Lastenrad 4 (Nina, Mi und Do) fährt, Lastenrad 3 ist gesperrt.
    expect(await screen.findByText('Lastenrad 1')).toBeInTheDocument();
    expect(screen.getByText('Diese Woche frei: Do (abwesend)')).toBeInTheDocument();
    expect(screen.getByText('Lastenrad 5 (Ersatz)')).toBeInTheDocument();
    expect(screen.queryByText('Lastenrad 4')).toBeNull();
    expect(screen.queryByText('Lastenrad 3')).toBeNull();
  });

  it('filtert nach Zustand und sucht in Rad, Person und Notiz', async () => {
    const nutzer = userEvent.setup();
    oeffne('/betrieb/flotte?zustand=reparatur');
    expect(await screen.findByText('Lastenrad 3')).toBeInTheDocument();
    expect(screen.queryByText('Lastenrad 1')).toBeNull();

    await nutzer.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    const suche = screen.getByRole('searchbox');
    await nutzer.type(suche, 'Nina');
    const liste = screen.getByRole('heading', { name: 'Raddepot Nord (1)' }).closest('section');
    expect(liste).not.toBeNull();
    expect(within(liste!).getByText('Lastenrad 4')).toBeInTheDocument();
    expect(screen.queryByText('Lastenrad 1')).toBeNull();
  });

  it('nennt den fälligen Check-Up als Ausnahme an der Zeile (ANN-570)', async () => {
    const heute = todayInTimeZone('Europe/Berlin');
    fetchFleet.mockResolvedValue(
      testFlotte({
        bikes: [
          testRad({ last_checkup_at: `${plusTage(heute, -20)}T08:00:00+00:00` }),
          testRad({
            id: 'rad-4',
            name: 'Lastenrad 4',
            regular_rider: TIM,
            last_checkup_at: `${plusTage(heute, -2)}T08:00:00+00:00`,
          }),
        ],
      }),
    );
    oeffne();
    await screen.findByRole('heading', { name: 'Ihr Rad' });
    expect(screen.getAllByText(/Check-Up fällig seit/)).toHaveLength(1);
  });

  it('lässt owner den Rhythmus wählen und abschalten (ANN-570)', async () => {
    const nutzer = userEvent.setup();
    setCheckupInterval.mockResolvedValue();
    fetchFleet.mockResolvedValue(testFlotte({ can_manage: true }));
    oeffne();
    const rhythmus = await screen.findByRole('combobox', { name: 'Check-Up-Rhythmus' });
    expect(rhythmus).toHaveValue('14');
    await nutzer.selectOptions(rhythmus, '21');
    expect(setCheckupInterval).toHaveBeenCalledWith(21);
    expect(await screen.findByText('Check-Up-Rhythmus: Alle 3 Wochen.')).toBeInTheDocument();
    await nutzer.selectOptions(rhythmus, '');
    expect(setCheckupInterval).toHaveBeenLastCalledWith(null);
  });

  it('bietet Rhythmus und Meldungen nur, wo der Server sie annimmt', async () => {
    oeffne();
    await screen.findByRole('heading', { name: 'Ihr Rad' });
    expect(screen.queryByRole('combobox', { name: 'Check-Up-Rhythmus' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Meldungen' })).not.toBeInTheDocument();
  });

  it('führt Inhaber:in und Teamleitung zu den Meldungen (ANN-569)', async () => {
    fetchFleet.mockResolvedValue(testFlotte({ can_read_reports: true }));
    oeffne();
    expect(await screen.findByRole('link', { name: 'Meldungen' })).toHaveAttribute(
      'href',
      '/betrieb/flotte/meldungen',
    );
  });
});
