import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import type { Plattformzugang } from './api';
import { reiterstufe } from './geruestbreite';
import { Kopf, Reiterleiste } from './Navigation';

/**
 * Kopf und Reiterleiste der Plattform (Handoff 2026-10-22, Abschnitt 3;
 * ANN-679, ANN-682). Was jsdom nicht kann - Breiten messen, die Media Query
 * unter 23rem, „Sehr groß“ -, prüft `tests/e2e/plattform-barrierefreiheit.spec.ts`
 * im Browser; hier die Entscheidung und die Bedienung.
 */

const BEHANDLUNG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

function Ort() {
  const { pathname, search } = useLocation();
  return <output data-testid="ort">{`${pathname}${search}`}</output>;
}

describe('Stufe der Reiterleiste (ANN-679)', () => {
  it('bleibt in einer Reihe, solange die Wörter passen', () => {
    expect(reiterstufe(340, 367)).toBe(1);
    expect(reiterstufe(367.4, 367)).toBe(1);
    expect(reiterstufe(368, 367)).toBe(2);
  });

  /** Breiten, die der Browser messen würde: Messreihe und Leiste. */
  let breiten = { woerter: 0, leiste: 0 };
  let melden: (() => void) | null = null;

  beforeEach(() => {
    breiten = { woerter: 0, leiste: 0 };
    melden = null;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const breite = this.classList.contains('w-max') ? breiten.woerter : breiten.leiste;
      return {
        width: breite,
        height: 0,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: breite,
        bottom: 0,
      } as DOMRect;
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(rueckruf: () => void) {
          melden = rueckruf;
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('misst die Wörter gegen die Leiste und wechselt in zwei Reihen und zurück', () => {
    breiten = { woerter: 330, leiste: 367 };
    renderWithProviders(<Reiterleiste bereiche={[BEHANDLUNG]} />, '/p/termine');
    const leiste = screen.getByRole('navigation', { name: 'Plattform' });
    expect(leiste).toHaveAttribute('data-stufe', '1');

    // „Sehr groß“: Die Messreihe wird breiter als die Leiste.
    breiten = { woerter: 410, leiste: 367 };
    act(() => melden?.());
    expect(leiste).toHaveAttribute('data-stufe', '2');
    // Alle vier Ziele bleiben da, das aktive trägt `aria-current`.
    const ziele = within(leiste).getAllByRole('link');
    expect(ziele.map((ziel) => ziel.textContent)).toEqual([
      'Übersicht',
      'Termine',
      'Übungen',
      'Nachrichten',
    ]);
    expect(within(leiste).getByRole('link', { name: 'Termine' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Zurück auf „Normal“ - oder das Telefon quer: wieder eine Reihe.
    breiten = { woerter: 330, leiste: 640 };
    act(() => melden?.());
    expect(leiste).toHaveAttribute('data-stufe', '1');
  });

  it('liest die Messreihe Vorlesesoftware nicht vor', () => {
    renderWithProviders(<Reiterleiste bereiche={[BEHANDLUNG]} />, '/p');
    const messreihe = document.querySelector('ul.w-max');
    expect(messreihe?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(within(messreihe as HTMLElement).queryAllByRole('link')).toHaveLength(0);
  });
});

describe('Menü unter 23rem (Stufe 3, ANN-682)', () => {
  function zeigeKopf(pfad = '/p') {
    return renderWithProviders(
      <>
        <Kopf bereiche={[BEHANDLUNG]} rechner={false} />
        <Ort />
      </>,
      pfad,
    );
  }

  it('öffnet unter dem Kopf die vier Ziele und „Ich“', async () => {
    const nutzer = userEvent.setup();
    zeigeKopf('/p/nachrichten?bereich=treatment');
    const menue = screen.getByRole('button', { name: 'Menü' });
    expect(menue).toHaveAttribute('aria-expanded', 'false');
    const ziel = document.getElementById(menue.getAttribute('aria-controls') ?? '');
    expect(ziel).not.toBeNull();
    expect(ziel).not.toBeVisible();

    await nutzer.click(menue);
    expect(menue).toHaveAttribute('aria-expanded', 'true');
    const navigation = screen.getByRole('navigation', { name: 'Plattform' });
    expect(navigation).toBe(ziel);
    expect(
      within(navigation)
        .getAllByRole('link')
        .map((z) => z.textContent),
    ).toEqual(['Übersicht', 'Termine', 'Übungen', 'Nachrichten', 'Ich']);
    // Die Ziele tragen den Bereich weiter, aktiv ist die Seite, auf der man steht.
    expect(within(navigation).getByRole('link', { name: 'Termine' })).toHaveAttribute(
      'href',
      '/p/termine?bereich=treatment',
    );
    expect(within(navigation).getByRole('link', { name: 'Nachrichten' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('schließt mit Esc und gibt den Fokus an „Menü“ zurück', async () => {
    const nutzer = userEvent.setup();
    zeigeKopf();
    const menue = screen.getByRole('button', { name: 'Menü' });
    await nutzer.click(menue);
    await nutzer.tab();
    expect(screen.getByRole('link', { name: 'Übersicht', current: 'page' })).toHaveFocus();
    await nutzer.keyboard('{Escape}');
    expect(menue).toHaveAttribute('aria-expanded', 'false');
    expect(menue).toHaveFocus();
    expect(screen.queryByRole('navigation', { name: 'Plattform' })).toBeNull();
  });

  it('schließt mit einem Tipp daneben, ohne darunter etwas zu öffnen', async () => {
    const nutzer = userEvent.setup();
    zeigeKopf();
    const menue = screen.getByRole('button', { name: 'Menü' });
    await nutzer.click(menue);
    fireEvent.click(screen.getByTestId('menue-daneben'));
    expect(menue).toHaveAttribute('aria-expanded', 'false');
    expect(menue).toHaveFocus();
    expect(screen.getByTestId('ort')).toHaveTextContent(/^\/p$/);
  });

  it('führt zum Ziel, ist danach zu und gibt den Fokus an „Menü“ zurück', async () => {
    const nutzer = userEvent.setup();
    zeigeKopf();
    const menue = screen.getByRole('button', { name: 'Menü' });
    await nutzer.click(menue);
    await nutzer.click(screen.getByRole('link', { name: 'Termine' }));
    expect(screen.getByTestId('ort')).toHaveTextContent('/p/termine');
    expect(menue).toHaveAttribute('aria-expanded', 'false');
    expect(menue).toHaveFocus();
  });

  it('schließt auch mit einem Tipp auf die Seite, auf der man schon steht', async () => {
    const nutzer = userEvent.setup();
    zeigeKopf('/p');
    const menue = screen.getByRole('button', { name: 'Menü' });
    await nutzer.click(menue);
    await nutzer.click(screen.getByRole('link', { name: 'Übersicht', current: 'page' }));
    expect(screen.getByTestId('ort')).toHaveTextContent(/^\/p$/);
    expect(menue).toHaveAttribute('aria-expanded', 'false');
  });

  it('schließt, wenn der Fokus es mit Tab verlässt - es verdeckte sonst den Fokus', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <>
        <Kopf bereiche={[BEHANDLUNG]} rechner={false} />
        <button type="button">Darunter</button>
      </>,
      '/p',
    );
    const menue = screen.getByRole('button', { name: 'Menü' });
    await nutzer.click(menue);
    // „Ich“ ist das letzte Ziel im Menü; danach kommt die Seite darunter.
    within(screen.getByRole('navigation', { name: 'Plattform' }))
      .getByRole('link', { name: 'Ich' })
      .focus();
    await nutzer.tab();
    expect(screen.getByRole('button', { name: 'Darunter' })).toHaveFocus();
    expect(menue).toHaveAttribute('aria-expanded', 'false');
  });

  it('schließt mit Esc auch dann, wenn der Fokus nicht im Menü steht', async () => {
    const nutzer = userEvent.setup();
    zeigeKopf();
    const menue = screen.getByRole('button', { name: 'Menü' });
    await nutzer.click(menue);
    // Safari fokussiert einen angetippten Knopf nicht.
    menue.blur();
    await nutzer.keyboard('{Escape}');
    expect(menue).toHaveAttribute('aria-expanded', 'false');
    expect(menue).toHaveFocus();
  });
});

describe('Kopf der Plattform (Handoff Abschnitt 3)', () => {
  it('führt mit der Wortmarke zur Übersicht und zeigt „Ich“ mit dem Zeichen der Person', () => {
    renderWithProviders(<Kopf bereiche={[BEHANDLUNG]} rechner={false} />, '/p/ich');
    const kopf = screen.getByRole('banner');
    expect(within(kopf).getByRole('link', { name: 'Übersicht' })).toHaveAttribute('href', '/p');
    const ich = within(kopf).getByRole('link', { name: 'Ich' });
    expect(ich).toHaveAttribute('aria-current', 'page');
    // Ohne Namen (N1) das Zeichen, keine Initialen (DR-119); es ist nur Schmuck.
    expect(ich.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(ich).toHaveTextContent(/^Ich$/);
  });
});
