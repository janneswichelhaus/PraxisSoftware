import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as NavigationModul from '@/lib/location/navigation';
import { NavigationHandoff } from './NavigationHandoff';
import { TESTSTOPPS } from './teststopps';

/**
 * Der Handoff am Kartenprototyp (MAP-005b).
 *
 * Die tragende Prüfung ist die **Abwesenheit**: Vor dem Tippen darf keine URL
 * entstanden sein - weder im Seitenquelltext noch als Rückgabe der Funktion,
 * die sie baut (ADR-019 Punkt 20). Deshalb liegen Spione auf beiden
 * Baufunktionen, die die echten Implementierungen weiterlaufen lassen.
 */

const spione = vi.hoisted(() => ({
  einzel: vi.fn(),
  tag: vi.fn(),
}));

vi.mock('@/lib/location/navigation', async (importOriginal) => {
  const echt = await importOriginal<typeof NavigationModul>();
  return { ...echt, buildNavigationUrl: spione.einzel, buildNavigationDayUrls: spione.tag };
});

function spioniereOeffnen() {
  return vi.spyOn(window, 'open').mockReturnValue(null);
}

let oeffnen: ReturnType<typeof spioniereOeffnen>;

beforeEach(async () => {
  // Die Spione zaehlen nur - gebaut wird mit den echten Funktionen. Die
  // Implementierung steht hier und nicht in der Attrappe, weil
  // `restoreAllMocks` sie nach jedem Fall wieder abnimmt.
  const echt = await vi.importActual<typeof NavigationModul>('@/lib/location/navigation');
  spione.einzel.mockReset().mockImplementation(echt.buildNavigationUrl);
  spione.tag.mockReset().mockImplementation(echt.buildNavigationDayUrls);
  oeffnen = spioniereOeffnen();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Die URL des einzigen Aufrufs von `window.open`. */
function geoeffneteUrl(): string {
  expect(oeffnen).toHaveBeenCalledTimes(1);
  return String(oeffnen.mock.calls[0]![0]);
}

async function waehleZielApp(label: string): Promise<void> {
  await userEvent.click(screen.getByRole('radio', { name: label }));
}

describe('NavigationHandoff', () => {
  it('baut ohne Tap keine URL - und zeigt keine im Quelltext', () => {
    const { container } = render(<NavigationHandoff stopps={TESTSTOPPS} />);

    expect(spione.einzel).not.toHaveBeenCalled();
    expect(spione.tag).not.toHaveBeenCalled();
    expect(oeffnen).not.toHaveBeenCalled();
    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toContain('google.com');
    expect(container.innerHTML).not.toContain('maps.apple.com');
    expect(container.innerHTML).not.toContain('geo:');
  });

  it('oeffnet einen Stopp mit genau einem Tap im Fahrradmodus', async () => {
    render(<NavigationHandoff stopps={TESTSTOPPS} />);

    await userEvent.click(screen.getByRole('button', { name: 'Navigation zu Stopp 3 starten' }));

    const url = new URL(geoeffneteUrl());
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('destination')).toBe('48.5164,9.0349');
    expect(url.searchParams.get('travelmode')).toBe('bicycling');
    expect(spione.einzel).toHaveBeenCalledTimes(1);
  });

  it('folgt der gewaehlten Ziel-App - Apple Maps', async () => {
    render(<NavigationHandoff stopps={TESTSTOPPS} />);
    await waehleZielApp('Apple Maps');

    await userEvent.click(screen.getByRole('button', { name: 'Navigation zu Stopp 1 starten' }));

    const url = new URL(geoeffneteUrl());
    expect(url.origin).toBe('https://maps.apple.com');
    expect(url.pathname).toBe('/directions');
    expect(url.searchParams.get('destination')).toBe('48.5216,9.0576');
    expect(url.searchParams.get('mode')).toBe('cycling');
  });

  it('folgt der gewaehlten Ziel-App - Systemnavigation', async () => {
    render(<NavigationHandoff stopps={TESTSTOPPS} />);
    await waehleZielApp('Systemnavigation');

    await userEvent.click(screen.getByRole('button', { name: 'Navigation zu Stopp 2 starten' }));

    expect(geoeffneteUrl()).toBe('geo:48.5305,9.049');
  });

  it('teilt den Tag in Abschnitte, statt Stopps abzuschneiden', async () => {
    render(<NavigationHandoff stopps={TESTSTOPPS} />);

    // Acht Stopps, drei Zwischenziele je Abschnitt: zwei Abschnitte.
    await userEvent.click(screen.getByRole('button', { name: 'Ganzer Tag – Abschnitt 2 von 2' }));

    const url = new URL(geoeffneteUrl());
    expect(url.searchParams.get('waypoints')!.split('|')).toEqual([
      '48.5241,9.0762',
      '48.5387,9.0668',
      '48.5024,9.0411',
    ]);
    expect(url.searchParams.get('destination')).toBe('48.5145,9.0908');
  });

  it('gibt der Systemnavigation je Stopp einen eigenen Abschnitt', async () => {
    render(<NavigationHandoff stopps={TESTSTOPPS} />);
    await waehleZielApp('Systemnavigation');

    expect(screen.getByRole('button', { name: 'Ganzer Tag – Abschnitt 8 von 8' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Ganzer Tag – Abschnitt 8 von 8' }));
    expect(geoeffneteUrl()).toBe('geo:48.5145,9.0908');
  });

  it('haelt die Ziel-App im Arbeitsspeicher, nicht im Geraet', async () => {
    const { unmount } = render(<NavigationHandoff stopps={TESTSTOPPS} />);
    await waehleZielApp('Apple Maps');
    expect(screen.getByRole('radio', { name: 'Apple Maps' })).toBeChecked();
    unmount();

    // Nach dem Neuaufbau steht wieder die Vorgabe: nichts wurde abgelegt.
    render(<NavigationHandoff stopps={TESTSTOPPS} />);
    expect(screen.getByRole('radio', { name: 'Google Maps' })).toBeChecked();
  });

  it('haelt die Tippziele bei 44 px', () => {
    render(<NavigationHandoff stopps={TESTSTOPPS} />);
    // jsdom rechnet keine Groessen aus; geprueft wird die Klasse, gemessen
    // wird in der Sichtpruefung bei 375 px (docs/abnahme/).
    for (const knopf of screen.getAllByRole('button')) {
      expect(knopf.className).toContain('min-h-11');
    }
    for (const auswahl of screen.getAllByRole('radio')) {
      expect(auswahl.closest('label')!.className).toContain('min-h-11');
    }
  });

  it('bleibt ohne Stopps leer', () => {
    const { container } = render(<NavigationHandoff stopps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ist barrierefrei', async () => {
    const { container } = render(
      <main>
        <h2>Die Navigation</h2>
        <NavigationHandoff stopps={TESTSTOPPS} />
      </main>,
    );
    await pruefeBarrierefreiheit(container);
  });
});
