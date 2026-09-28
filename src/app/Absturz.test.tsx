import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * Absturzseite und Startfehler (AUTH-13, AUTH-15).
 *
 * Der Konfigurationsfall wird nachgestellt, indem `readEnv` wirft - so wie es
 * bei fehlender `VITE_SUPABASE_URL` im ersten Zugriff des `SessionProvider`
 * geschieht.
 */

const readEnv = vi.fn();
vi.mock('@/lib/env', () => ({ readEnv: () => readEnv() as unknown }));

const { Absturzseite, Startfehlergrenze } = await import('./Absturz');

/** Scheitert wie der `SessionProvider`: im Effekt, oberhalb des Routers. */
function ScheitertImEffekt() {
  useEffect(() => {
    throw new Error('Konfiguration unvollständig: VITE_SUPABASE_URL fehlt.');
  }, []);
  return <p>Anwendung</p>;
}

beforeEach(() => {
  readEnv.mockReset();
  // React meldet einen gefangenen Fehler zusätzlich auf der Konsole; hier ist
  // er gewollt.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Absturzseite', () => {
  it('nennt die Lage in einer Überschrift und bietet das Neuladen als Knopf (AUTH-15)', async () => {
    const neuLaden = vi.fn();
    render(<Absturzseite neuLaden={neuLaden} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Seite konnte nicht angezeigt werden' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Ihre gespeicherte Arbeit bleibt');

    await userEvent.click(screen.getByRole('button', { name: 'Neu laden' }));
    expect(neuLaden).toHaveBeenCalledOnce();
  });

  it('ist für Vorlesesoftware sauber', async () => {
    const { container } = render(<Absturzseite neuLaden={vi.fn()} />);
    await pruefeBarrierefreiheit(container);
  });
});

describe('Startfehlergrenze', () => {
  it('zeigt bei unvollständiger Konfiguration eine Seite statt einer leeren Fläche', () => {
    readEnv.mockImplementation(() => {
      throw new Error('Konfiguration unvollständig: VITE_SUPABASE_URL fehlt.');
    });

    render(
      <Startfehlergrenze>
        <ScheitertImEffekt />
      </Startfehlergrenze>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Anwendung nicht eingerichtet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Anwendung ist nicht vollständig eingerichtet.',
    );
    expect(screen.getByText(/Praxisinhaber:in/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Own Motion' })).toBeInTheDocument();
    expect(screen.queryByText('Anwendung')).toBeNull();
  });

  it('nennt die fehlende Variable nur in der Entwicklung', () => {
    readEnv.mockImplementation(() => {
      throw new Error('Konfiguration unvollständig: VITE_SUPABASE_URL fehlt.');
    });

    render(
      <Startfehlergrenze>
        <ScheitertImEffekt />
      </Startfehlergrenze>,
    );

    // Vitest läuft als Entwicklung; im Produktionsbuild entfällt die Zeile.
    expect(import.meta.env.DEV).toBe(true);
    expect(screen.getByText(/VITE_SUPABASE_URL fehlt/)).toBeInTheDocument();
  });

  it('zeigt bei jedem anderen Startfehler die Absturzseite', () => {
    readEnv.mockReturnValue({ supabaseUrl: 'http://127.0.0.1', supabaseAnonKey: 'x' });

    render(
      <Startfehlergrenze>
        <ScheitertImEffekt />
      </Startfehlergrenze>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Seite konnte nicht angezeigt werden' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
  });

  it('lässt die Anwendung ohne Fehler unberührt und prüft dann nichts', () => {
    render(
      <Startfehlergrenze>
        <p>Anwendung</p>
      </Startfehlergrenze>,
    );

    expect(screen.getByText('Anwendung')).toBeInTheDocument();
    expect(readEnv).not.toHaveBeenCalled();
  });
});
