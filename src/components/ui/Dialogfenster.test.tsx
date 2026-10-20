import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { Dialogfenster, Fenstertitel, Hinweisfenster } from './Dialogfenster';
import { FENSTERZIEL, PortalZielKontext } from './portalZiel';

/**
 * Das Fenster über dem Inhalt (FIX-016, ANN-058): Es darf niemandem etwas
 * wegnehmen - Fokus hinein, Fokus im Kreis, Escape und Klick daneben sind
 * Abbrechen, Fokus zurück.
 */
function Seite({ onSchliessen }: { onSchliessen: () => void }) {
  return (
    <>
      <Button type="button">Davor</Button>
      <Dialogfenster titel="Frage" onSchliessen={onSchliessen}>
        <p>Text</p>
        <Button type="button" data-autofocus>
          Ja
        </Button>
        <Button type="button" onClick={onSchliessen}>
          Nein
        </Button>
      </Dialogfenster>
    </>
  );
}

describe('Dialogfenster', () => {
  it('zeigt eine Beschreibung auch im kleinen Fenster unter dem Titel (DESIGN.md Regel 6)', () => {
    render(
      <Dialogfenster
        titel="Sprachnachricht 17.10., 09:00"
        beschreibung="0:42 · 96 KB"
        onSchliessen={() => undefined}
      >
        <p>Inhalt</p>
      </Dialogfenster>,
    );
    const fenster = screen.getByRole('dialog', { name: 'Sprachnachricht 17.10., 09:00' });
    expect(within(fenster).getByText('0:42 · 96 KB')).toBeInTheDocument();
  });

  it('füllt als Vollbild den Bildschirm und schließt über den Knopf in der Kopfzeile (FLT-005)', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialogfenster
        titel="Bremsen"
        onSchliessen={onSchliessen}
        vollbild
        beschreibung="Lastenrad 1 · Load 60 · Riemenantrieb"
        schliessenBeschriftung="Check-Up abbrechen"
      >
        <Button type="button" data-autofocus>
          In Ordnung
        </Button>
      </Dialogfenster>,
    );
    const fenster = screen.getByRole('dialog', { name: 'Bremsen' });
    expect(fenster).toHaveAttribute('aria-modal', 'true');
    expect(fenster.className).toContain('h-dvh');
    // Unter dem Titel, worum es geht - der Titel allein bleibt der Name.
    expect(screen.getByText('Lastenrad 1 · Load 60 · Riemenantrieb')).toBeInTheDocument();
    // Der Fokus liegt auf der Antwort, nicht auf dem Schließen-Knopf davor.
    expect(screen.getByRole('button', { name: 'In Ordnung' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Check-Up abbrechen' }));
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('stellt mit titelImInhalt die Überschrift in den Inhalt und benennt das Fenster nach ihr (FLT-007)', () => {
    render(
      <Dialogfenster
        titel="Speichen"
        onSchliessen={() => undefined}
        vollbild
        titelImInhalt
        beschreibung="Lastenrad 1 · Load 60 · Riemenantrieb"
      >
        <p>Rad</p>
        <Fenstertitel />
        <Button type="button">In Ordnung</Button>
      </Dialogfenster>,
    );
    const fenster = screen.getByRole('dialog', { name: 'Speichen' });
    const ueberschrift = within(fenster).getByRole('heading', { name: 'Speichen' });
    // Die Kopfzeile trägt nur noch das Rad - keine zweite Überschrift.
    expect(within(fenster).getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByText('Rad').compareDocumentPosition(ueberschrift)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText('Lastenrad 1 · Load 60 · Riemenantrieb')).toBeInTheDocument();
  });

  it('zeichnet einen Fenstertitel außerhalb eines Vollbild-Fensters nicht', () => {
    render(<Fenstertitel />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('ist ein benannter, modaler Dialog und setzt den Fokus hinein', () => {
    render(<Seite onSchliessen={() => undefined} />);
    const fenster = screen.getByRole('dialog', { name: 'Frage' });
    expect(fenster).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Ja' })).toHaveFocus();
  });

  it('haelt den Fokus im Kreis', async () => {
    const user = userEvent.setup();
    render(<Seite onSchliessen={() => undefined} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Nein' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ja' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Nein' })).toHaveFocus();
  });

  it('behaelt Fokus und Escape auch nach einem Klick auf Text im Fenster', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    render(<Seite onSchliessen={onSchliessen} />);

    await user.click(screen.getByText('Text'));
    // Der Fokus liegt auf dem Fenster, nicht auf der Seite darunter.
    expect(screen.getByRole('dialog')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ja' })).toHaveFocus();
    await user.click(screen.getByText('Text'));
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Nein' })).toHaveFocus();
    await user.click(screen.getByText('Text'));
    await user.keyboard('{Escape}');
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('schliesst mit Escape - das ist Abbrechen, nie Bestaetigen', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    render(<Seite onSchliessen={onSchliessen} />);

    await user.keyboard('{Escape}');
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('schliesst mit einem Klick neben das Fenster', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    render(<Seite onSchliessen={onSchliessen} />);

    const schleier = screen.getByRole('dialog').parentElement!;
    await user.click(schleier);
    expect(onSchliessen).toHaveBeenCalledTimes(1);

    // Ein Klick IM Fenster schliesst nicht.
    await user.click(screen.getByText('Text'));
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('gibt den Fokus zurueck, wo er herkam', async () => {
    const user = userEvent.setup();
    function Umschalter() {
      const [offen, setOffen] = useState(false);
      return (
        <>
          <Button type="button" onClick={() => setOffen(true)}>
            Öffnen
          </Button>
          {offen ? (
            <Dialogfenster titel="Frage" onSchliessen={() => setOffen(false)}>
              <Button type="button" onClick={() => setOffen(false)}>
                Nein
              </Button>
            </Dialogfenster>
          ) : null}
        </>
      );
    }
    render(<Umschalter />);
    const oeffnen = screen.getByRole('button', { name: 'Öffnen' });
    await user.click(oeffnen);
    expect(screen.getByRole('button', { name: 'Nein' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Nein' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(oeffnen).toHaveFocus();
  });

  /**
   * UIK-09, DAT-11: Im Kameradialog verschwindet „Auslösen" mit dem Tipp
   * darauf. Der Fokus fiel auf den body, Escape und Tab liefen ins Leere.
   */
  it('holt den Fokus zurueck, wenn das fokussierte Element verschwindet', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    function Kamera() {
      const [aufgenommen, setAufgenommen] = useState(false);
      return (
        <Dialogfenster titel="Foto aufnehmen" onSchliessen={onSchliessen}>
          {/* Eigene Schlüssel: Sonst übernähme React denselben <button>, und
              der Fokus bliebe einfach, wo er ist - der Fall wäre nicht
              geprüft. */}
          {aufgenommen ? (
            <Button key="verwenden" type="button" data-autofocus>
              Foto verwenden
            </Button>
          ) : (
            <Button
              key="ausloesen"
              type="button"
              data-autofocus
              onClick={() => setAufgenommen(true)}
            >
              Auslösen
            </Button>
          )}
          <Button type="button">Abbrechen</Button>
        </Dialogfenster>
      );
    }
    render(<Kamera />);
    expect(screen.getByRole('button', { name: 'Auslösen' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Foto verwenden' })).toHaveFocus(),
    );
    // Und damit wirken Escape und der Fokuskreis wieder.
    await user.keyboard('{Escape}');
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('holt den Fokus zurueck, wenn er das Fenster verlaesst', () => {
    render(<Seite onSchliessen={() => undefined} />);
    const ja = screen.getByRole('button', { name: 'Ja' });
    expect(ja).toHaveFocus();

    // Etwa ein Skript der Seite darunter, das ein Feld fokussiert.
    act(() => screen.getByRole('button', { name: 'Davor' }).focus());
    expect(ja).toHaveFocus();
  });

  it('sperrt die Seite darunter mit inert und gibt sie beim Schliessen frei', async () => {
    const user = userEvent.setup();
    function Umschalter() {
      const [offen, setOffen] = useState(false);
      return (
        <>
          <Button type="button" onClick={() => setOffen(true)}>
            Öffnen
          </Button>
          {offen ? (
            <Dialogfenster titel="Frage" onSchliessen={() => setOffen(false)}>
              <Button type="button" onClick={() => setOffen(false)}>
                Nein
              </Button>
            </Dialogfenster>
          ) : null}
        </>
      );
    }
    const { container } = render(<Umschalter />);
    await user.click(screen.getByRole('button', { name: 'Öffnen' }));

    // Die Anwendung liegt neben dem Schleier am body und ist gesperrt; das
    // Fenster selbst nicht.
    expect(container).toHaveAttribute('inert');
    const schleier = screen.getByRole('dialog').parentElement!;
    expect(schleier.parentElement).toBe(document.body);
    expect(schleier).not.toHaveAttribute('inert');

    await user.click(screen.getByRole('button', { name: 'Nein' }));
    expect(container).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Öffnen' })).toHaveFocus();
  });

  it('sperrt auch, wenn das Fenster in ein eigenes Ziel zeichnet, und laesst das Ziel offen (BEF-175)', () => {
    // Wie die Sitzungssperre: Das Ziel liegt neben der Anwendung, beide in
    // einer Huelle - nicht am body.
    const huelle = document.createElement('div');
    const anwendung = document.createElement('div');
    const ziel = document.createElement('div');
    ziel.setAttribute(FENSTERZIEL, '');
    huelle.append(anwendung, ziel);
    document.body.append(huelle);

    const { unmount } = render(
      <PortalZielKontext.Provider value={ziel}>
        <Dialogfenster titel="Unten" onSchliessen={() => undefined}>
          <Button type="button">Unten bleiben</Button>
        </Dialogfenster>
      </PortalZielKontext.Provider>,
      { container: anwendung },
    );
    expect(anwendung).toHaveAttribute('inert');
    expect(ziel).not.toHaveAttribute('inert');
    const unten = screen.getByRole('dialog', { name: 'Unten' }).parentElement!;
    expect(unten.parentElement).toBe(ziel);
    expect(unten).not.toHaveAttribute('inert');

    unmount();
    expect(anwendung).not.toHaveAttribute('inert');
    huelle.remove();
  });

  it('sperrt ein Ziel in der Anwendung nicht mit, damit ein spaeteres Fenster dort bedienbar bleibt', () => {
    // Wie die Plattform: Ihr Ziel steckt in der Anwendung; ein Fenster am body
    // sperrt die Anwendung, das Ziel darin aber nicht selbst.
    const anwendung = document.createElement('div');
    const inhalt = document.createElement('div');
    const ziel = document.createElement('div');
    ziel.setAttribute(FENSTERZIEL, '');
    anwendung.append(inhalt, ziel);
    document.body.append(anwendung);

    const { unmount } = render(
      <Dialogfenster titel="Am body" onSchliessen={() => undefined}>
        <Button type="button">Bleiben</Button>
      </Dialogfenster>,
    );
    expect(inhalt).toHaveAttribute('inert');
    expect(ziel).not.toHaveAttribute('inert');
    expect(anwendung).not.toHaveAttribute('inert');

    unmount();
    expect(inhalt).not.toHaveAttribute('inert');
    anwendung.remove();
  });

  it('sperrt nichts, wenn es in einer verborgenen Seite aufgeht - die Sperrseite bleibt bedienbar', () => {
    // Wie die Sitzungssperre: Die Seite samt Fensterziel ist verborgen, die
    // Sperrseite steht daneben. Eine Meldung, die jetzt noch aufgeht, darf
    // die Sperrseite nicht unter `inert` legen.
    const huelle = document.createElement('div');
    const sperrseite = document.createElement('div');
    const inhalt = document.createElement('div');
    inhalt.setAttribute('inert', '');
    inhalt.hidden = true;
    const anwendung = document.createElement('div');
    const ziel = document.createElement('div');
    ziel.setAttribute(FENSTERZIEL, '');
    inhalt.append(anwendung, ziel);
    huelle.append(sperrseite, inhalt);
    document.body.append(huelle);

    const { unmount } = render(
      <PortalZielKontext.Provider value={ziel}>
        <Dialogfenster titel="Nicht gespeichert" onSchliessen={() => undefined}>
          <Button type="button">Zurück</Button>
        </Dialogfenster>
      </PortalZielKontext.Provider>,
      { container: anwendung },
    );
    expect(sperrseite).not.toHaveAttribute('inert');
    expect(anwendung).not.toHaveAttribute('inert');

    unmount();
    huelle.remove();
  });

  it('fokussiert ohne zu rollen, damit die Frage im Bild bleibt (BEF-175)', () => {
    const fokus = vi.spyOn(HTMLElement.prototype, 'focus');
    render(<Seite onSchliessen={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Ja' })).toHaveFocus();
    expect(fokus).toHaveBeenCalledWith({ preventScroll: true });
    fokus.mockRestore();
  });

  it('laesst einem zweiten Fenster, das darueber aufgeht, den Fokus', () => {
    // Zwei Fenster, die einander den Fokus abnehmen, liefen im Kreis; und das
    // obere darf nicht unter dem `inert` des unteren liegen.
    render(
      <>
        <Dialogfenster titel="Unten" onSchliessen={() => undefined}>
          <Button type="button">Unten bleiben</Button>
        </Dialogfenster>
        <Dialogfenster titel="Oben" onSchliessen={() => undefined}>
          <Button type="button">Oben bleiben</Button>
        </Dialogfenster>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Oben bleiben' })).toHaveFocus();
    const unten = screen.getByRole('dialog', { name: 'Unten' }).parentElement!;
    const oben = screen.getByRole('dialog', { name: 'Oben' }).parentElement!;
    expect(unten).toHaveAttribute('inert');
    expect(oben).not.toHaveAttribute('inert');
  });

  it('setzt den Titel nach Handoff, am Telefon eine Stufe kleiner (UIK-22)', () => {
    render(<Seite onSchliessen={() => undefined} />);
    const titel = screen.getByRole('heading', { name: 'Frage' });
    expect(titel).toHaveClass('text-h4', 'sm:text-h3', 'font-bold');
  });
});

describe('Hinweisfenster', () => {
  it('liest den Hinweis als alert vor und schliesst ueber die eine Schaltflaeche', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    render(
      <Hinweisfenster titel="Das ging nicht." onSchliessen={onSchliessen}>
        Grund.
      </Hinweisfenster>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Grund.');
    const zurueck = screen.getByRole('button', { name: 'Zurück zum Formular' });
    expect(zurueck).toHaveFocus();
    await user.click(zurueck);
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });
});

describe('Dialogfenster kommt von unten und geht nach unten (ANN-663)', () => {
  function Umschalter({ anfangs = true }: { anfangs?: boolean }) {
    const [offen, setOffen] = useState(anfangs);
    return (
      <>
        <Button onClick={() => setOffen(true)}>Öffnen</Button>
        {offen ? (
          <Dialogfenster titel="Frage" onSchliessen={() => setOffen(false)}>
            <Button onClick={() => setOffen(false)}>Nein</Button>
          </Dialogfenster>
        ) : null}
      </>
    );
  }

  it('trägt die Klassen des Kommens an Schleier und Fenster', () => {
    render(<Umschalter />);
    const fenster = screen.getByRole('dialog', { name: 'Frage' });
    expect(fenster).toHaveClass('fenster-kommt');
    expect(fenster.parentElement).toHaveClass('fenster-schleier');
  });

  it('lässt ohne Element.animate (jsdom) kein Abbild stehen', async () => {
    const user = userEvent.setup();
    render(<Umschalter />);
    await user.click(screen.getByRole('button', { name: 'Nein' }));
    expect(screen.queryByText('Frage')).not.toBeInTheDocument();
  });

  it('lässt ein Abbild ohne Bedeutung nach unten gleiten, unauffindbar, und entfernt es danach', async () => {
    let fertig: () => void = () => undefined;
    const animate = vi.fn(() => ({
      finished: new Promise<void>((weiter) => (fertig = weiter)),
    }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    try {
      const user = userEvent.setup();
      render(<Umschalter />);
      await user.click(screen.getByRole('button', { name: 'Nein' }));
      await act(async () => {
        await Promise.resolve();
      });

      // Das Fenster ist weg: keine Rolle mehr, die Seite wieder frei.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Öffnen' }).closest('[inert]')).toBeNull();
      const abbild = document.querySelector<HTMLElement>('[data-fenster-abbild]');
      expect(abbild).not.toBeNull();
      expect(abbild).toHaveAttribute('aria-hidden', 'true');
      expect(abbild).toHaveAttribute('inert');
      // In der geschlossenen Shadow-Root: Keine Suche findet den Inhalt doppelt.
      expect(screen.queryByText('Frage')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nein', hidden: true })).toBeNull();
      expect(animate).toHaveBeenCalledWith(
        [{ translate: '0 0' }, { translate: '0 calc(100% + 2rem)' }],
        expect.objectContaining({ duration: 240 }),
      );

      await act(async () => {
        fertig();
        await Promise.resolve();
      });
      expect(document.querySelector('[data-fenster-abbild]')).toBeNull();
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  });

  it('legt das Abbild unter ein Fenster, das zugleich aufgeht', async () => {
    const animate = vi.fn(() => ({ finished: new Promise<void>(() => undefined) }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    function Wechsel() {
      const [zweites, setZweites] = useState(false);
      return zweites ? (
        <Dialogfenster key="zweites" titel="Zweites" onSchliessen={() => undefined}>
          <p>B</p>
        </Dialogfenster>
      ) : (
        <Dialogfenster key="erstes" titel="Erstes" onSchliessen={() => undefined}>
          <Button onClick={() => setZweites(true)}>Weiter</Button>
        </Dialogfenster>
      );
    }
    try {
      const user = userEvent.setup();
      render(<Wechsel />);
      await user.click(screen.getByRole('button', { name: 'Weiter' }));
      await act(async () => {
        await Promise.resolve();
      });
      const abbild = document.querySelector('[data-fenster-abbild]');
      const zweites = screen.getByRole('dialog', { name: 'Zweites' }).parentElement!;
      expect(abbild?.nextElementSibling).toBe(zweites);
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'animate');
      document.querySelectorAll('[data-fenster-abbild]').forEach((abbild) => abbild.remove());
    }
  });
});
