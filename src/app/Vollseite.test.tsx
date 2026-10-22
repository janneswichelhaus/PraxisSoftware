import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { useSchriftgroesseAnwenden } from '@/features/platform/schriftgroesse';
import { EINLADUNG_TITEL } from './tabtitel';
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

  it('nennt die Einladung „Einladung – Own Motion" (DR-115)', () => {
    render(
      <Vollseite titel="Ihr Zugang" tabtitel={EINLADUNG_TITEL}>
        <p>Inhalt</p>
      </Vollseite>,
    );
    expect(document.title).toBe('Einladung – Own Motion');
  });

  describe('Schrift der Plattform auf den Türen (DR-102)', () => {
    afterEach(() => {
      window.localStorage.removeItem('plattform-schriftgroesse');
    });

    it('setzt 18 px und die Schriftgröße dieses Geräts - und nimmt sie beim Gehen zurück', () => {
      window.localStorage.setItem('plattform-schriftgroesse', 'sehr-gross');
      const { unmount } = render(
        <Vollseite titel="Ihr Zugang">
          <p>Inhalt</p>
        </Vollseite>,
      );
      expect(screen.getByRole('main').className).toContain('plattform-schrift');
      expect(document.documentElement.dataset.schrift).toBe('sehr-gross');
      unmount();
      expect(document.documentElement.dataset.schrift).toBeUndefined();
    });

    it('lässt die Größe stehen, wenn die Sperrseite über dem Gerüst geht', () => {
      window.localStorage.setItem('plattform-schriftgroesse', 'gross');
      function Geruest({ gesperrt }: { gesperrt: boolean }) {
        useSchriftgroesseAnwenden();
        return gesperrt ? (
          <Vollseite titel="Gesperrt">
            <p>Inhalt</p>
          </Vollseite>
        ) : null;
      }
      const { rerender, unmount } = render(<Geruest gesperrt />);
      expect(document.documentElement.dataset.schrift).toBe('gross');
      rerender(<Geruest gesperrt={false} />);
      expect(document.documentElement.dataset.schrift).toBe('gross');
      unmount();
      expect(document.documentElement.dataset.schrift).toBeUndefined();
    });

    it('lässt „Normal“ ohne Angabe', () => {
      render(
        <Vollseite titel="Anmelden">
          <p>Inhalt</p>
        </Vollseite>,
      );
      expect(document.documentElement.dataset.schrift).toBeUndefined();
    });
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
