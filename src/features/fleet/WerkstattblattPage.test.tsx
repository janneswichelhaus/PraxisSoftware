import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { testUser } from '@/test-utils';
import * as api from './api';
import { WerkstattblattPage } from './WerkstattblattPage';
import { rendereSeite } from './testseite';

// In jsdom gibt es kein WebGL: Die Bilder kommen als kleine Daten-URLs.
const zeichneWerkstattbilder = vi.hoisted(() => vi.fn());
vi.mock('./bike3d/werkstattbilder', () => ({ zeichneWerkstattbilder }));

const BILDER = {
  rechts: { url: 'data:image/png;base64,cmVjaHRz', punkte: [{ id: 's2', x: 20, y: 70 }] },
  links: { url: 'data:image/png;base64,bGlua3M=', punkte: [{ id: 's1', x: 15, y: 60 }] },
  ausschnitte: {
    s1: { url: 'data:image/png;base64,czE=', punkte: [{ id: 's1', x: 50, y: 40 }] },
    s2: { url: 'data:image/png;base64,czI=', punkte: [{ id: 's2', x: 50, y: 40 }] },
  },
};

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchWorkshopSheet: vi.fn(),
  fetchFleetPhotos: vi.fn(),
  loadFleetPhoto: vi.fn(),
}));

const fetchWorkshopSheet = vi.mocked(api.fetchWorkshopSheet);
const fetchFleetPhotos = vi.mocked(api.fetchFleetPhotos);
const loadFleetPhoto = vi.mocked(api.loadFleetPhoto);

function oeffne() {
  return rendereSeite(
    '/betrieb/flotte/rad/:radId/werkstatt',
    <WerkstattblattPage user={testUser(['therapist'])} />,
    '/betrieb/flotte/rad/rad-3/werkstatt',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchWorkshopSheet.mockResolvedValue({
    name: 'Lastenrad 3',
    bike_type: 'load60_riemen',
    blocked_since: '2026-10-14T14:20:00+00:00',
    spots: [
      {
        id: 's1',
        number: 1,
        zone: 'bremse-vorne',
        severity: 'problem',
        note: 'Scheibe schleift beim Drehen',
        source: 'checkup',
        source_at: '2026-10-13T05:50:00+00:00',
      },
      {
        id: 's2',
        number: 2,
        zone: 'reifen-hinten',
        severity: 'beobachten',
        note: null,
        source: 'breakdown',
        source_at: '2026-10-14T14:20:00+00:00',
      },
    ],
  });
  fetchFleetPhotos.mockResolvedValue([]);
  zeichneWerkstattbilder.mockResolvedValue(BILDER);
});

/**
 * Die Unterlage für die Werkstatt: Übersicht mit den Seiten des Rads und Stellen im Detail mit
 * Ausschnitt am Modell und Fotos,
 * dieselben Nummern, keine Namen aus dem Team, der Dateiname aus Rad, Zweck und Tag.
 */
describe('Unterlage für die Werkstatt', () => {
  it('zeigt Seite 1 mit Zustand, Nummer und Bauteil in der Tabelle zum Abhaken', async () => {
    oeffne();
    expect(
      await screen.findByRole('heading', { name: 'Lastenrad 3', level: 1 }),
    ).toBeInTheDocument();
    const seite1 = screen.getByRole('region', { name: 'Seite 1 von 2' });
    expect(within(seite1).getByText(/Gesperrt seit/)).toBeInTheDocument();
    expect(within(seite1).getByText('2 markiert, davon 1 Problem')).toBeInTheDocument();
    const zeilen = within(within(seite1).getByRole('table')).getAllByRole('row');
    expect(zeilen).toHaveLength(3);
    expect(zeilen[1]).toHaveTextContent(/^1\s*Bremse vorne/);
    expect(zeilen[1]).toHaveTextContent('Check-Up am 13.10.2026');
    expect(zeilen[2]).toHaveTextContent(/^2\s*Reifen hinten/);
    expect(zeilen[2]).toHaveTextContent('Panne am 14.10.2026');
    expect(within(seite1).getAllByRole('img', { name: 'Erledigt, zum Abhaken' })).toHaveLength(2);
    expect(within(zeilen[1]!).getByRole('img', { name: 'Stelle 1, Problem' })).toBeInTheDocument();
    expect(
      within(zeilen[2]!).getByRole('img', { name: 'Stelle 2, Beobachten' }),
    ).toBeInTheDocument();
  });

  it('zeigt rechte und linke Seite des Rads mit den Nadeln an ihrer Stelle', async () => {
    oeffne();
    const seite1 = await screen.findByRole('region', { name: 'Seite 1 von 2' });
    expect(within(seite1).getByRole('heading', { name: 'Wo am Rad' })).toBeInTheDocument();
    const rechts = await within(seite1).findByRole('img', {
      name: 'Lastenrad 3, Rechte Seite mit Antrieb: Stelle 2',
    });
    expect(rechts).toHaveAttribute('src', BILDER.rechts.url);
    expect(within(seite1).getByText('Rechte Seite mit Antrieb: Stelle 2')).toBeInTheDocument();
    expect(within(seite1).getByText('Linke Seite: Stelle 1')).toBeInTheDocument();
    const rahmenRechts = rechts.parentElement!;
    const nadel = within(rahmenRechts).getByRole('img', { name: 'Stelle 2, Beobachten' });
    expect(nadel.closest('span[style]')).toHaveStyle({ left: '20%', top: '70%' });
    const links = within(seite1).getByRole('img', { name: 'Lastenrad 3, Linke Seite: Stelle 1' });
    expect(
      within(links.parentElement!).getByRole('img', { name: 'Stelle 1, Problem' }),
    ).toBeInTheDocument();
    // Ohne gespeicherte Punkte sucht das Modell selbst einen Punkt am Bauteil (ANN-870).
    expect(zeichneWerkstattbilder).toHaveBeenCalledWith([
      { id: 's1', zone: 'bremse-vorne', point: null },
      { id: 's2', zone: 'reifen-hinten', point: null },
    ]);
  });

  it('zeigt je Stelle den Ausschnitt am Modell mit ihrer Nadel', async () => {
    oeffne();
    const erste = await screen.findByRole('article', { name: 'Stelle 1' });
    const ausschnitt = await within(erste).findByRole('img', {
      name: 'Ausschnitt am Modell: Bremse vorne',
    });
    expect(ausschnitt).toHaveAttribute('src', BILDER.ausschnitte.s1.url);
    expect(
      within(ausschnitt.parentElement!).getByRole('img', { name: 'Stelle 1, Problem' }),
    ).toBeInTheDocument();
    const zweite = screen.getByRole('article', { name: 'Stelle 2' });
    expect(
      within(zweite).getByRole('img', { name: 'Ausschnitt am Modell: Reifen hinten' }),
    ).toHaveAttribute('src', BILDER.ausschnitte.s2.url);
  });

  it('sagt, wenn sich die Bilder nicht zeichnen lassen, und lässt trotzdem drucken', async () => {
    zeichneWerkstattbilder.mockRejectedValue(new Error('kein WebGL'));
    oeffne();
    expect(
      await screen.findByText(
        /Die Ansichten des Rads lassen sich in diesem Browser nicht zeichnen/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drucken oder als PDF sichern' })).toBeEnabled();
    expect(screen.queryByRole('img', { name: /^Ausschnitt am Modell/ })).toBeNull();
    expect(screen.getByText('Rechte Seite mit Antrieb: keine Stelle')).toBeInTheDocument();
  });

  it('zeigt je Stelle Bauteil und Notiz mit derselben Nummer', async () => {
    oeffne();
    const seite2 = await screen.findByRole('region', { name: 'Seite 2 von 2' });
    const erste = within(seite2).getByRole('article', { name: 'Stelle 1' });
    expect(within(erste).getByRole('heading', { name: 'Bremse vorne' })).toBeInTheDocument();
    expect(within(erste).getAllByRole('img', { name: 'Stelle 1, Problem' }).length).toBeGreaterThan(
      0,
    );
    expect(erste).toHaveTextContent('Scheibe schleift beim Drehen');
    expect(within(seite2).getByRole('article', { name: 'Stelle 2' })).toHaveTextContent(
      'Ohne Notiz.',
    );
    expect(within(seite2).getAllByText('Zu dieser Stelle gibt es kein Foto.')).toHaveLength(2);
  });

  it('zeigt die vorhandenen Fotos an ihrer Stelle', async () => {
    fetchFleetPhotos.mockResolvedValue([
      {
        id: 'f1',
        spot_id: 's1',
        checkup_id: null,
        side: null,
        created_at: '2026-10-13T05:51:00+00:00',
        verified: true,
        may_delete: false,
      },
    ]);
    loadFleetPhoto.mockResolvedValue(new Blob(['foto'], { type: 'image/jpeg' }));
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: () => 'blob:test/1',
        revokeObjectURL: () => undefined,
      }),
    );
    oeffne();
    const erste = await screen.findByRole('article', { name: 'Stelle 1' });
    expect(await within(erste).findByRole('img', { name: 'Foto 1 zu Stelle 1' })).toHaveAttribute(
      'src',
      'blob:test/1',
    );
    expect(
      within(screen.getByRole('article', { name: 'Stelle 2' })).getByText(
        'Zu dieser Stelle gibt es kein Foto.',
      ),
    ).toBeInTheDocument();
    expect(loadFleetPhoto).toHaveBeenCalledWith('f1');
  });

  it('lässt erst drucken, wenn die Liste der Fotos geladen ist', async () => {
    let geladen: (fotos: api.FleetPhoto[]) => void = () => undefined;
    fetchFleetPhotos.mockReturnValue(
      new Promise((resolve) => {
        geladen = resolve;
      }),
    );
    oeffne();
    expect(await screen.findByRole('button', { name: 'Wird vorbereitet …' })).toBeDisabled();
    geladen([]);
    expect(
      await screen.findByRole('button', { name: 'Drucken oder als PDF sichern' }),
    ).toBeEnabled();
  });

  it('lässt erst drucken, wenn die Bilder vom Modell gezeichnet sind', async () => {
    let gezeichnet: (bilder: typeof BILDER) => void = () => undefined;
    zeichneWerkstattbilder.mockReturnValue(
      new Promise((resolve) => {
        gezeichnet = resolve;
      }),
    );
    oeffne();
    await waitFor(() => expect(fetchFleetPhotos).toHaveBeenCalled());
    await waitFor(() => expect(zeichneWerkstattbilder).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Wird vorbereitet …' })).toBeDisabled();
    gezeichnet(BILDER);
    expect(
      await screen.findByRole('button', { name: 'Drucken oder als PDF sichern' }),
    ).toBeEnabled();
    expect(screen.getByRole('img', { name: 'Ausschnitt am Modell: Bremse vorne' })).toBeVisible();
  });

  it('nennt keine Namen aus dem Team, keine Termine, keinen Pannenort (Vorschlag 5)', async () => {
    oeffne();
    const blatt = await screen.findByRole('article', { name: 'Unterlage für die Werkstatt' });
    expect(blatt.textContent).not.toMatch(/Tim|Anna|Teamleitung Tim|Hinterhof|Termin/);
  });

  it('gibt der PDF den Dateinamen aus Rad, Zweck und Tag und versendet nichts', async () => {
    oeffne();
    expect(
      await screen.findByText(/Datei: Lastenrad-3_Werkstatt_\d{4}-\d{2}-\d{2}\.pdf/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Versendet wird nichts automatisch/)).toBeInTheDocument();
    const knopf = screen.getByRole('button', { name: /Drucken oder als PDF sichern/ });
    await waitFor(() => expect(knopf).toBeEnabled());
    const vorher = document.title;
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.title).toMatch(/^Lastenrad-3_Werkstatt_\d{4}-\d{2}-\d{2}$/);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe(vorher);
  });
});
