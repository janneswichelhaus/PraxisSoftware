import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Vollseite } from './Vollseite';

/**
 * Die Hülle der Seiten außerhalb des Anwendungsrahmens (AUTH-12, AUTH-13).
 */
describe('Vollseite', () => {
  it('trägt Marke, Hauptbereich und eine Überschrift in der Rolle des Systems', () => {
    render(
      <Vollseite titel="Anmelden" einleitung="Ein Satz dazu." kleingedrucktes="Ein Hinweis.">
        <p>Inhalt</p>
      </Vollseite>,
    );

    const hauptbereich = screen.getByRole('main');
    expect(hauptbereich).toContainElement(screen.getByRole('img', { name: 'Own Motion' }));
    const titel = screen.getByRole('heading', { level: 1, name: 'Anmelden' });
    // Token statt 24 px/600 ohne Namen; in der Hauptfarbe wie jeder Seitentitel.
    expect(titel.className).toContain('text-h3');
    expect(titel.className).toContain('font-bold');
    expect(titel.className).toContain('text-accent');
    expect(titel.className).not.toMatch(/tracking-\[|text-2xl|font-semibold/);
    expect(screen.getByText('Ein Satz dazu.')).toBeInTheDocument();
    expect(screen.getByText('Ein Hinweis.')).toBeInTheDocument();
  });

  it('steht für alle Türseiten gleich: zentriert, höchstens max-w-sm', () => {
    render(
      <Vollseite titel="Zugang gesperrt">
        <p>Inhalt</p>
      </Vollseite>,
    );
    expect(screen.getByRole('main').className).toContain('max-w-sm');
    expect(screen.getByRole('main').className).toContain('justify-center');
  });

  it('kommt im Ladezustand ohne Überschrift aus', () => {
    render(
      <Vollseite>
        <p role="status">Wird geladen …</p>
      </Vollseite>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('status'));
  });

  it('nennt den Tab „Anmelden – Own Motion" (BEF-050, RAH-008)', () => {
    document.title = 'Akte – Own Motion';
    render(
      <Vollseite titel="Zugang gesperrt">
        <p>Inhalt</p>
      </Vollseite>,
    );
    // Auch die Türseiten nach dem Abmelden: Der Titel der letzten Seite
    // bleibt nicht am Tab stehen.
    expect(document.title).toBe('Anmelden – Own Motion');
  });

  it('ist für Vorlesesoftware sauber', async () => {
    const { container } = render(
      <Vollseite titel="Anmelden" kleingedrucktes="Ein Hinweis.">
        <p>Inhalt</p>
      </Vollseite>,
    );
    await pruefeBarrierefreiheit(container);
  });
});
