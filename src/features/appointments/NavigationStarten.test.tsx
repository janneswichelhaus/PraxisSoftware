import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Besuchsadresse } from '@/lib/location/navigation';
import { NavigationFuerDenTag, NavigationZumTermin } from './NavigationStarten';

/**
 * Der Handoff ist die eine Stelle, an der Daten das Gerät verlassen. Die
 * Bedingung aus ADR-019 Punkt 20 - „nur auf Aktion, nie automatisch" - ist
 * deshalb keine Gestaltungsfrage, sondern hier geprüft: vor dem Tippen darf
 * keine URL im Seitenquelltext stehen.
 */

function hausbesuch(strasse = 'Beispielstrasse'): Besuchsadresse {
  return {
    appointment_type: 'home_visit',
    visit_street: strasse,
    visit_house_number: '12',
    visit_postal_code: '72070',
    visit_city: 'Tuebingen',
  };
}

const praxistermin: Besuchsadresse = {
  appointment_type: 'practice',
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NavigationZumTermin', () => {
  it('baut die URL erst beim Tippen - vorher steht keine im Quelltext', async () => {
    const oeffnen = vi.spyOn(window, 'open').mockReturnValue(null);
    const { container } = render(<NavigationZumTermin termin={hausbesuch()} />);

    // Kein href, kein Ziel, nichts Kopierbares vor der Aktion.
    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toContain('google.com');
    expect(oeffnen).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Navigation starten' }));

    expect(oeffnen).toHaveBeenCalledTimes(1);
    const [url, ziel, merkmale] = oeffnen.mock.calls[0]!;
    expect(String(url)).toContain('destination=Beispielstrasse+12%2C+72070+Tuebingen%2C+DE');
    expect(String(url)).toContain('travelmode=bicycling');
    expect(ziel).toBe('_blank');
    expect(merkmale).toContain('noreferrer');
  });

  it('erscheint nicht ohne Hausbesuch', () => {
    const { container } = render(<NavigationZumTermin termin={praxistermin} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('erscheint nicht bei unvollstaendiger Anschrift', () => {
    const { container } = render(
      <NavigationZumTermin termin={{ ...hausbesuch(), visit_house_number: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('NavigationFuerDenTag', () => {
  it('fasst die Stopps des Tages zu einem Link zusammen', async () => {
    const oeffnen = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<NavigationFuerDenTag termine={[hausbesuch('Erste'), hausbesuch('Zweite')]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ganzer Tag (2 Stopps)' }));

    const url = new URL(String(oeffnen.mock.calls[0]![0]));
    expect(url.searchParams.get('waypoints')).toBe('Erste 12, 72070 Tuebingen, DE');
    expect(url.searchParams.get('destination')).toBe('Zweite 12, 72070 Tuebingen, DE');
  });

  it('zaehlt nur navigierbare Stopps - ein Praxistermin gehoert nicht dazu', async () => {
    render(<NavigationFuerDenTag termine={[hausbesuch(), praxistermin]} />);
    expect(await screen.findByRole('button', { name: 'Ganzer Tag (1 Stopp)' })).toBeInTheDocument();
  });

  it('teilt einen langen Tag in benannte Abschnitte', () => {
    const viele = Array.from({ length: 12 }, (_, index) => hausbesuch(`Strasse ${index + 1}`));
    render(<NavigationFuerDenTag termine={viele} />);

    // Vier Stopps je Abschnitt: drei Zwischenziele plus Ziel. Seit MAP-005
    // erzwingt `navigation.ts` die kleinere der beiden dokumentierten Zahlen,
    // weil die Anwendung nicht weiss, ob das Tippen in der App oder im
    // mobilen Browser landet - zwölf Stopps ergeben damit drei Abschnitte.
    expect(screen.getByRole('button', { name: 'Ganzer Tag – Abschnitt 1 von 3' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ganzer Tag – Abschnitt 2 von 3' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ganzer Tag – Abschnitt 3 von 3' })).toBeVisible();
  });

  it('erscheint nicht, wenn kein Stopp navigierbar ist', () => {
    const { container } = render(<NavigationFuerDenTag termine={[praxistermin]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
