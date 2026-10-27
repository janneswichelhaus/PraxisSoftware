import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { useSchriftgroesseAnwenden } from '@/lib/schriftgroesse';
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
    // Die Stufe der Plattform (Handoff 2026-10-22, Abschnitt 2), in der
    // Hauptfarbe wie jeder Seitentitel.
    expect(titel.className).toContain('text-plattform-titel');
    expect(titel.className).toContain('text-accent');
    expect(titel.className).not.toMatch(/text-h3|text-2xl|font-semibold/);
    expect(screen.getByText('Ein Satz dazu.')).toBeInTheDocument();
    expect(screen.getByText('Ein Hinweis.')).toBeInTheDocument();
  });

  it('steht für alle Türseiten gleich: oben und linksbündig, höchstens max-w-sm (DR-107)', () => {
    render(
      <Vollseite titel="Zugang gesperrt" kleingedrucktes="Ein Hinweis.">
        <p>Inhalt</p>
      </Vollseite>,
    );
    const hauptbereich = screen.getByRole('main');
    expect(hauptbereich.className).toContain('max-w-sm');
    expect(hauptbereich.className).not.toMatch(/justify-center|text-center/);
    // Das Kleingedruckte steht am Ende der Seite.
    expect(screen.getByText('Ein Hinweis.').className).toContain('mt-auto');
  });

  it('zeigt einen Zustand mit Zeichen im Kreis über dem Titel, nur als Schmuck', () => {
    const { container } = render(
      <Vollseite titel="Diese Einladung lässt sich nicht verwenden" zeichen={<path d="M3 3h18" />}>
        <p>Inhalt</p>
      </Vollseite>,
    );
    const kreis = container.querySelector('span[aria-hidden="true"]');
    expect(kreis?.className).toContain('size-16');
    expect(kreis?.querySelector('svg')).not.toBeNull();
  });

  it('grüßt auf der Einladung größer (`gross`)', () => {
    render(
      <Vollseite titel="Own Motion lädt Sie ein" gross>
        <p>Inhalt</p>
      </Vollseite>,
    );
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('text-gruss');
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
