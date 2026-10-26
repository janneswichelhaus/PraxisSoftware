import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import * as api from './api';
import { BikePage } from './BikePage';
import { testDetail, testFlotte } from './testdaten';
import { rendereSeite } from './testseite';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleet: vi.fn(),
  fetchBike: vi.fn(),
  fetchFleetPhotos: vi.fn(),
  releaseBike: vi.fn(),
  blockBike: vi.fn(),
  saveBike: vi.fn(),
  removeBike: vi.fn(),
}));

const fetchFleet = vi.mocked(api.fetchFleet);
const fetchBike = vi.mocked(api.fetchBike);
const fetchFleetPhotos = vi.mocked(api.fetchFleetPhotos);
const releaseBike = vi.mocked(api.releaseBike);
const blockBike = vi.mocked(api.blockBike);

const RAD3 = '/betrieb/flotte/rad/rad-3';

function oeffne(pfad = RAD3, rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return rendereSeite('/betrieb/flotte/rad/:radId', <BikePage user={testUser(rollen)} />, pfad);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchFleet.mockResolvedValue(testFlotte());
  fetchBike.mockResolvedValue(testDetail());
  fetchFleetPhotos.mockResolvedValue([]);
  releaseBike.mockResolvedValue({ released: true, resolvedSpots: 3 });
  blockBike.mockResolvedValue();
});

/**
 * Ein Rad (DESIGN.md „Objekt“): Objektkopf mit Zustand, „Stellen am Rad“ mit den Nummern der
 * Unterlage für die Werkstatt, Freigabe mit Rückfrage nur für owner und team_lead (ANN-550).
 */
describe('Rad', () => {
  it('zeigt Zustand, Grund und die Wege des gesperrten Rads', async () => {
    const { container } = oeffne();
    expect(
      await screen.findByRole('heading', { name: 'Lastenrad 3', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('In Reparatur', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/In Reparatur seit .* · nach einer Panne/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unterlage für die Werkstatt' })).toHaveAttribute(
      'href',
      expect.stringContaining('/betrieb/flotte/rad/rad-3/werkstatt'),
    );
    expect(screen.getByRole('link', { name: 'Check-Up' })).toBeInTheDocument();
    // Ohne Recht keine Freigabe - der Server weist sie ohnehin ab.
    expect(screen.queryByRole('button', { name: 'Freigeben' })).toBeNull();
    await pruefeBarrierefreiheit(container);
  });

  it('beginnt Panne und Schlüsselübergabe am freien Rad selbst (BEF-176)', async () => {
    const frei = testFlotte().bikes[0]!;
    fetchBike.mockResolvedValue(testDetail({ bike: frei, spots: [] }));
    oeffne(`/betrieb/flotte/rad/${frei.id}`);
    expect(await screen.findByRole('link', { name: 'Panne melden' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/betrieb/flotte/panne?rad=${frei.id}`),
    );
    expect(screen.getByRole('link', { name: 'Schlüssel übergeben' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/betrieb/flotte/schluessel?rad=${frei.id}`),
    );
  });

  it('listet die Stellen mit Nummer und Bauteil je Ereignis, ohne Modell', async () => {
    oeffne();
    const checkup = (await screen.findByRole('heading', { name: /Check-Up · / })).closest(
      'section',
    );
    const panne = screen.getByRole('heading', { name: /Panne · / }).closest('section');
    const zeilen = within(checkup!).getAllByRole('listitem');
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]).toHaveTextContent(/^Stelle 1\s*Bremse vorne× Problem · Prüfpunkt Bremsen/);
    expect(zeilen[1]).toHaveTextContent(/^Stelle 2\s*Reifen hinten! Beobachten/);
    expect(within(panne!).getByRole('listitem')).toHaveTextContent(
      /^Stelle 3\s*Riemen und Riemenscheiben/,
    );
    expect(screen.queryByRole('img', { name: /3D/ })).toBeNull();
  });

  it('gibt nach Rückfrage frei und sagt, was mit den Stellen geschieht (ANN-555)', async () => {
    const nutzer = userEvent.setup();
    fetchFleet.mockResolvedValue(testFlotte({ can_release: true }));
    oeffne(RAD3, ['therapist', 'team_lead']);
    await nutzer.click(await screen.findByRole('button', { name: 'Freigeben' }));
    expect(
      screen.getByText(
        /steht danach wieder in der Planung. Die 3 offenen Stellen gelten als erledigt/,
      ),
    ).toBeInTheDocument();
    expect(releaseBike).not.toHaveBeenCalled();
    await nutzer.click(screen.getByRole('button', { name: 'Ja, freigeben' }));
    expect(releaseBike).toHaveBeenCalledWith('rad-3');
    expect(
      await screen.findByText('Lastenrad 3 freigegeben. Die 3 Stellen gelten als erledigt.'),
    ).toBeInTheDocument();
  });

  it('zeigt im Verlauf Check-Up und Panne mit der meldenden Person', async () => {
    oeffne(`${RAD3}?bereich=verlauf`);
    const abschnitt = (await screen.findByRole('heading', { name: 'Verlauf (2)' })).closest(
      'section',
    );
    const verlauf = within(abschnitt!);
    expect(verlauf.getByText('Panne, Rad gesperrt')).toBeInTheDocument();
    // „Check-Up“ steht auch als Knopf im Kopf; hier als Zeile des Verlaufs.
    expect(verlauf.getByText('Check-Up')).toBeInTheDocument();
    expect(screen.getByText('Problem: Bremsen')).toBeInTheDocument();
    expect(screen.getByText('Beobachten: Reifen und Luftdruck')).toBeInTheDocument();
    expect(screen.getAllByText(/Tim Teamleitung/).length).toBeGreaterThan(0);
  });

  it('zeigt die Angaben ohne Recht nur zum Lesen, mit Recht als Formular', async () => {
    const { unmount } = oeffne(`${RAD3}?bereich=angaben`);
    expect(
      await screen.findByText('Load 60 · Riemenantrieb mit Nabenschaltung'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rad entfernen' })).toBeNull();
    unmount();

    fetchFleet.mockResolvedValue(testFlotte({ can_manage: true, can_release: true }));
    oeffne(`${RAD3}?bereich=angaben`, ['owner']);
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Lastenrad 3');
    expect(screen.getByRole('button', { name: 'Rad entfernen' })).toBeInTheDocument();
    // Gesperrt: kein zweites Sperren.
    expect(screen.queryByRole('button', { name: 'Rad sperren' })).toBeNull();
  });

  it('sperrt ein Rad von Hand nur mit Grund', async () => {
    const nutzer = userEvent.setup();
    const frei = testDetail();
    fetchBike.mockResolvedValue({ ...frei, bike: { ...frei.bike, block: null }, blocks: [] });
    fetchFleet.mockResolvedValue(testFlotte({ can_release: true }));
    oeffne(`${RAD3}?bereich=angaben`, ['therapist', 'team_lead']);
    await nutzer.click(await screen.findByRole('button', { name: 'Rad sperren' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja, Rad sperren' }));
    expect(await screen.findByText('Bitte einen Grund angeben.')).toBeInTheDocument();
    expect(blockBike).not.toHaveBeenCalled();
    await nutzer.type(screen.getByRole('textbox', { name: 'Grund' }), 'Jahresinspektion');
    await nutzer.click(screen.getByRole('button', { name: 'Ja, Rad sperren' }));
    expect(blockBike).toHaveBeenCalledWith('rad-3', 'Jahresinspektion');
  });
});
