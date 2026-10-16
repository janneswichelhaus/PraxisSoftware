import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Warum es kein 3D-Rad gibt (FLT-006, BEF-172): Ein Modul, das nicht ankommt,
 * ist kein Mangel des Browsers - nach einer Auslieferung sucht eine schon
 * offene Seite eine Datei, die es nicht mehr gibt, und Neuladen hilft. Nur
 * ohne WebGL liegt es am Browser.
 */
afterEach(() => {
  vi.doUnmock('./viewer');
  vi.resetModules();
});

async function zeige(ersatz?: string) {
  const onUnavailable = vi.fn();
  const { BikeModel3D } = await import('./BikeModel3D');
  render(
    <BikeModel3D
      hoehe={300}
      markers={[]}
      onUnavailable={onUnavailable}
      {...(ersatz ? { ersatz } : {})}
    />,
  );
  return onUnavailable;
}

describe('BikeModel3D ohne 3D-Rad', () => {
  it('sagt bei einem Modul, das nicht ankommt, „nicht laden“ und bietet Neuladen an', async () => {
    vi.doMock('./viewer', () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    const onUnavailable = await zeige();
    // Ein Fehler mit dem Weg hinaus, als `ErrorState` (Design-Review FLT-005).
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Das 3D-Modell ließ sich nicht laden.Bauteile können Sie weiter über die Liste wählen.',
    );
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
    expect(screen.queryByText(/WebGL/)).not.toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('nennt WebGL nur, wenn der Browser keinen Kontext hergibt', async () => {
    vi.doMock('./viewer', () => ({
      BikeViewer: class {
        constructor() {
          throw new Error('Error creating WebGL context.');
        }
      },
    }));
    const onUnavailable = await zeige('Alle Schritte gehen auch über die Knöpfe.');
    expect(
      await screen.findByText(/Dieser Browser zeigt kein 3D \(WebGL 2 fehlt\)\./),
    ).toBeInTheDocument();
    // Kein Fehler der Anwendung - und der Weg hinaus, wie die Seite ihn nennt.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Alle Schritte gehen auch über die Knöpfe.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neu laden' })).not.toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });
});
