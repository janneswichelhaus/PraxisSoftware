import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { testUser } from '@/test-utils';
import * as api from './api';
import { WerkstattblattPage } from './WerkstattblattPage';
import { rendereSeite } from './testseite';

vi.mock('./bike3d/werkstattbilder', () => ({
  zeichneWerkstattbilder: () =>
    Promise.resolve({
      rechts: { url: 'data:image/png;base64,', punkte: [{ id: 's2', x: 20, y: 70 }] },
      links: { url: 'data:image/png;base64,', punkte: [{ id: 's1', x: 15, y: 60 }] },
      ausschnitte: {
        s1: { url: 'data:image/png;base64,', punkte: [{ id: 's1', x: 50, y: 40 }] },
        s2: { url: 'data:image/png;base64,', punkte: [{ id: 's2', x: 50, y: 40 }] },
      },
    }),
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchWorkshopSheet: vi.fn(),
  fetchFleetPhotos: vi.fn(),
  loadFleetPhoto: vi.fn(),
}));

const fetchWorkshopSheet = vi.mocked(api.fetchWorkshopSheet);
const fetchFleetPhotos = vi.mocked(api.fetchFleetPhotos);

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
        point: [1.05, 0.31, -0.06],
        model_version: 1,
        severity: 'problem',
        note: 'Scheibe schleift beim Drehen',
        source: 'checkup',
        source_at: '2026-10-13T05:50:00+00:00',
      },
      {
        id: 's2',
        number: 2,
        zone: 'reifen-hinten',
        point: null,
        model_version: 1,
        severity: 'beobachten',
        note: null,
        source: 'breakdown',
        source_at: '2026-10-14T14:20:00+00:00',
      },
    ],
  });
  fetchFleetPhotos.mockResolvedValue([]);
});

/**
 * Die Unterlage für die Werkstatt (Handoff Lastenrad 3D, Vorschläge 5 bis 7,
 * AC 6): Übersicht und Stellen im Detail, dieselben Nummern, keine Namen
 * aus dem Team, der Dateiname aus Rad, Zweck und Tag.
 */
describe('Unterlage für die Werkstatt', () => {
  it('zeigt Seite 1 mit Zustand, Ansichten und der Tabelle zum Abhaken', async () => {
    oeffne();
    expect(
      await screen.findByRole('heading', { name: 'Lastenrad 3', level: 1 }),
    ).toBeInTheDocument();
    const seite1 = screen.getByRole('region', { name: 'Seite 1 von 2' });
    expect(within(seite1).getByText(/Gesperrt seit/)).toBeInTheDocument();
    expect(within(seite1).getByText('2 markiert, davon 1 Problem')).toBeInTheDocument();
    expect(within(seite1).getByText('Rechte Seite mit Antrieb: Stelle 2')).toBeInTheDocument();
    expect(within(seite1).getByText('Linke Seite: Stelle 1')).toBeInTheDocument();
    const zeilen = within(within(seite1).getByRole('table')).getAllByRole('row');
    expect(zeilen).toHaveLength(3);
    expect(zeilen[1]).toHaveTextContent('Bremse vorne');
    expect(zeilen[1]).toHaveTextContent('Check-Up am 13.10.2026');
    expect(zeilen[2]).toHaveTextContent('Panne am 14.10.2026');
    expect(within(seite1).getAllByRole('img', { name: 'Erledigt, zum Abhaken' })).toHaveLength(2);
  });

  it('zeigt je Stelle den Ausschnitt mit derselben Nummer', async () => {
    oeffne();
    const seite2 = await screen.findByRole('region', { name: 'Seite 2 von 2' });
    expect(within(seite2).getByRole('article', { name: 'Stelle 1' })).toHaveTextContent(
      'Scheibe schleift beim Drehen',
    );
    expect(within(seite2).getByRole('article', { name: 'Stelle 2' })).toHaveTextContent(
      'Ohne Notiz.',
    );
    expect(within(seite2).getAllByText('Zu dieser Stelle gibt es kein Foto.')).toHaveLength(2);
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
