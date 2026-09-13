import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { AbmeldeschutzProvider } from '@/app/AbmeldeschutzProvider';
import { useAbmeldeanfrage } from '@/app/abmeldeschutz';
import { useTextverlustschutz } from './Textverlustschutz';

/**
 * §13: Dokumentation darf niemals unbemerkt verloren gehen (UX-009, FIX-011).
 *
 * Der Schutz kann das nicht garantieren - er hält an und fragt. Geprüft wird
 * genau das: dass die Rückfrage kommt, wenn sie gebraucht wird, dass sie
 * ausbleibt, wenn nichts offen ist, und - der eigentliche Punkt - dass ein
 * fehlgeschlagenes Speichern weder den Text noch die Seite mitnimmt.
 *
 * Die Prüfseite bringt ihren eigenen Weg nach draußen mit und schreibt den
 * aktuellen Pfad hin. Ein echter Seitenwechsel ist damit sichtbar, ohne
 * `useNavigate` zu unterschieben - dieselbe Begründung wie in
 * `PrescriptionFormPage.entwurf.test.tsx`.
 */

function setzeVerbindung(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

function Pruefseite({
  ungespeichert = true,
  speichern,
  mitFreigabe = false,
}: {
  ungespeichert?: boolean;
  speichern?: () => Promise<boolean>;
  mitFreigabe?: boolean;
}) {
  const { freigeben, laeuft, schreiben, schutz } = useTextverlustschutz(
    speichern ? { ungespeichert, speichern } : { ungespeichert },
  );
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  return (
    <div>
      <p>
        Adresse: {pathname}
        {search}
      </p>
      <p>Laeuft: {laeuft ? 'ja' : 'nein'}</p>
      {schutz}
      <Link to="/woanders">Weggehen</Link>
      <Link to="/dokumentation?filter=alle">Nur Parameter</Link>
      <button type="button" onClick={() => void navigate(-1)}>
        Browser-Zurück
      </button>
      {/* Der eigene Schreibweg der Seite - derselbe, den die Rückfrage nimmt
          (FIX-014). */}
      {speichern ? (
        <button
          type="button"
          onClick={() =>
            void schreiben({
              ausfuehren: speichern,
              fehlertitel: 'Nicht gespeichert',
              danach: () => {
                freigeben();
                void navigate('/gespeichert');
              },
            })
          }
        >
          Selbst speichern
        </button>
      ) : null}
      {mitFreigabe ? (
        <Link to="/woanders" onClick={freigeben}>
          Freigegeben weggehen
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Die Prüfseite unter dem Abmeldeschutz, mit der Schaltfläche der Kopfzeile.
 *
 * `abmelden` steht für das, was die Anwendung beim Abmelden tut. Geprüft wird,
 * **wann** es aufgerufen wird - und wann ausdrücklich nicht.
 */
function MitAbmelden({
  abmelden,
  ...rest
}: {
  abmelden: () => void;
  ungespeichert?: boolean;
  speichern?: () => Promise<boolean>;
}) {
  return (
    <AbmeldeschutzProvider onAbmelden={abmelden}>
      <Kopfzeilenknopf />
      <Pruefseite {...rest} />
    </AbmeldeschutzProvider>
  );
}

function Kopfzeilenknopf() {
  const anfordern = useAbmeldeanfrage();
  return (
    <button type="button" onClick={() => anfordern?.()}>
      Abmelden
    </button>
  );
}

function adresse(): string {
  return screen.getByText(/^Adresse:/).textContent ?? '';
}

afterEach(() => {
  setzeVerbindung(true);
  vi.restoreAllMocks();
});

describe('Textverlustschutz: Warnung des Browsers', () => {
  it('meldet ungespeicherte Eingaben beim Verlassen des Fensters an den Browser', () => {
    const anmelden = vi.spyOn(window, 'addEventListener');
    renderWithProviders(<Pruefseite />, '/dokumentation');

    expect(anmelden.mock.calls.some(([typ]) => typ === 'beforeunload')).toBe(true);
  });

  it('meldet nichts an, solange nichts ungespeichert ist', () => {
    const anmelden = vi.spyOn(window, 'addEventListener');
    renderWithProviders(<Pruefseite ungespeichert={false} />, '/dokumentation');

    expect(anmelden.mock.calls.some(([typ]) => typ === 'beforeunload')).toBe(false);
  });

  it('meldet die Warnung wieder ab, sobald gespeichert ist', () => {
    const abmelden = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderWithProviders(<Pruefseite />, '/dokumentation');

    rerender(<Pruefseite ungespeichert={false} />);
    expect(abmelden.mock.calls.some(([typ]) => typ === 'beforeunload')).toBe(true);
  });
});

describe('Textverlustschutz: Hinweis ohne Verbindung', () => {
  it('sagt bei getrenntem Geraet, dass der Text stehen bleiben soll', () => {
    setzeVerbindung(false);
    renderWithProviders(<Pruefseite />, '/dokumentation');

    expect(screen.getByRole('alert')).toHaveTextContent(/Ohne Verbindung/);
    expect(screen.getByRole('alert')).toHaveTextContent(/bleibt im Feld stehen/);
  });

  it('behauptet nichts, solange das Geraet verbunden ist', () => {
    renderWithProviders(<Pruefseite />, '/dokumentation');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('zeigt den Hinweis nicht, wenn nichts ungespeichert ist', () => {
    setzeVerbindung(false);
    renderWithProviders(<Pruefseite ungespeichert={false} />, '/dokumentation');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reagiert auf einen Verbindungsabbruch waehrend des Schreibens', () => {
    renderWithProviders(<Pruefseite />, '/dokumentation');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => {
      setzeVerbindung(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('Textverlustschutz: Navigation innerhalb der Anwendung', () => {
  it('haelt den Seitenwechsel an und bietet Speichern, Verwerfen und Bleiben', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <Pruefseite speichern={vi.fn().mockResolvedValue(true)} />,
      '/dokumentation',
    );

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));

    const kasten = screen.getByRole('group', { name: 'Ungespeicherte Dokumentation' });
    expect(kasten).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern und weitergehen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verwerfen und weitergehen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hier bleiben' })).toBeInTheDocument();
    expect(adresse()).toBe('Adresse: /dokumentation');
  });

  it('laesst unveraenderte Inhalte ohne Rueckfrage durch', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Pruefseite ungespeichert={false} />, '/dokumentation');

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));

    expect(
      screen.queryByRole('group', { name: 'Ungespeicherte Dokumentation' }),
    ).not.toBeInTheDocument();
    expect(adresse()).toBe('Adresse: /woanders');
  });

  it('fragt nicht bei einem Wechsel der Suchparameter auf derselben Seite', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Pruefseite />, '/dokumentation');

    await nutzer.click(screen.getByRole('link', { name: 'Nur Parameter' }));

    expect(
      screen.queryByRole('group', { name: 'Ungespeicherte Dokumentation' }),
    ).not.toBeInTheDocument();
    expect(adresse()).toBe('Adresse: /dokumentation?filter=alle');
  });

  it('bleibt auf der Seite, wenn „Hier bleiben" gewaehlt wird', async () => {
    const nutzer = userEvent.setup();
    const speichern = vi.fn().mockResolvedValue(true);
    renderWithProviders(<Pruefseite speichern={speichern} />, '/dokumentation');

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Hier bleiben' }));

    expect(
      screen.queryByRole('group', { name: 'Ungespeicherte Dokumentation' }),
    ).not.toBeInTheDocument();
    expect(adresse()).toBe('Adresse: /dokumentation');
    expect(speichern).not.toHaveBeenCalled();
  });

  it('verwirft ausdruecklich und geht weiter, ohne zu speichern', async () => {
    const nutzer = userEvent.setup();
    const speichern = vi.fn().mockResolvedValue(true);
    renderWithProviders(<Pruefseite speichern={speichern} />, '/dokumentation');

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Verwerfen und weitergehen' }));

    expect(speichern).not.toHaveBeenCalled();
    expect(adresse()).toBe('Adresse: /woanders');
  });

  it('speichert zuerst und geht erst nach erfolgreicher Speicherung weiter', async () => {
    const nutzer = userEvent.setup();
    // Das Speichern haengt, bis der Test es loest. Damit ist die Reihenfolge
    // gepruefte Zusicherung und nicht Zufall der Zeitplanung.
    let fertig: (vollstaendig: boolean) => void = () => {};
    const speichern = vi.fn().mockReturnValue(
      new Promise<boolean>((aufloesen) => {
        fertig = aufloesen;
      }),
    );
    renderWithProviders(<Pruefseite speichern={speichern} />, '/dokumentation');

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Speichern und weitergehen' }));

    expect(speichern).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Wird gespeichert …' })).toBeInTheDocument();
    // Waehrend des Speicherns steht die alte Seite noch.
    expect(adresse()).toBe('Adresse: /dokumentation');

    await act(async () => {
      fertig(true);
      await Promise.resolve();
    });

    expect(adresse()).toBe('Adresse: /woanders');
  });

  /**
   * Der eigentliche Grund für diesen Schutz: Ein Fehlschlag darf nicht
   * aussehen wie ein Erfolg. Netzausfall, Konflikt und Serverfehler landen
   * alle hier.
   */
  it('bleibt bei einem Speicherfehler auf der Seite und behaelt den Inhalt', async () => {
    const nutzer = userEvent.setup();
    const speichern = vi.fn().mockRejectedValue(new Error('Keine Verbindung zum Server.'));
    renderWithProviders(<Pruefseite speichern={speichern} />, '/dokumentation');

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Speichern und weitergehen' }));

    expect(adresse()).toBe('Adresse: /dokumentation');
    expect(screen.getByRole('alert')).toHaveTextContent('Keine Verbindung zum Server.');
    expect(screen.getByRole('alert')).toHaveTextContent(/Seite bleibt geöffnet/);
    // Die Rueckfrage bleibt offen: erneut versuchen, verwerfen oder bleiben.
    expect(screen.getByRole('group', { name: 'Ungespeicherte Dokumentation' })).toBeInTheDocument();
  });

  it('bietet ohne Speicherweg nur Verwerfen und Bleiben und sagt, warum', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Pruefseite />, '/dokumentation');

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));

    expect(
      screen.queryByRole('button', { name: 'Speichern und weitergehen' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verwerfen und weitergehen' })).toBeInTheDocument();
    expect(screen.getByText(/Bestandteil der Akte/)).toBeInTheDocument();
  });

  /**
   * Das Zurück des Browsers ist der Weg, den ein selbstgebauter Wachposten
   * mit umhüllten Links nicht erreicht - und der, bei dem ein Text am
   * ehesten unbemerkt verschwindet.
   */
  it('haelt auch das Zurueck des Browsers an', async () => {
    const nutzer = userEvent.setup();
    const { rerender } = renderWithProviders(
      <Pruefseite ungespeichert={false} />,
      '/dokumentation',
    );

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));
    expect(adresse()).toBe('Adresse: /woanders');

    // Dort wird geschrieben - und dann das Zurück gedrückt.
    rerender(<Pruefseite ungespeichert />);
    await nutzer.click(screen.getByRole('button', { name: 'Browser-Zurück' }));

    expect(screen.getByRole('group', { name: 'Ungespeicherte Dokumentation' })).toBeInTheDocument();
    expect(adresse()).toBe('Adresse: /woanders');

    await nutzer.click(screen.getByRole('button', { name: 'Verwerfen und weitergehen' }));
    expect(adresse()).toBe('Adresse: /dokumentation');
  });

  it('haelt den eigenen Rueckweg nach dem Speichern nicht an', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Pruefseite mitFreigabe />, '/dokumentation');

    await nutzer.click(screen.getByRole('link', { name: 'Freigegeben weggehen' }));

    expect(
      screen.queryByRole('group', { name: 'Ungespeicherte Dokumentation' }),
    ).not.toBeInTheDocument();
    expect(adresse()).toBe('Adresse: /woanders');
  });

  /**
   * Die Freigabe gilt für **eine** Navigation (FIX-014). Eine dauerhafte wäre
   * ein Loch: Bleibt die Seite nach dem Speichern doch stehen - der Rückweg
   * scheitert, die Person kommt zurück -, stünde der Schutz für den Rest der
   * Sitzung offen, und der nächste Text ginge still verloren.
   */
  it('gibt nur die naechste Navigation frei, nicht jede weitere', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Pruefseite mitFreigabe />, '/dokumentation');

    // Freigeben, ohne dass eine Navigation folgt: Die Freigabe wird beim
    // Zurückblättern verbraucht.
    await nutzer.click(screen.getByRole('link', { name: 'Freigegeben weggehen' }));
    expect(adresse()).toBe('Adresse: /woanders');

    await nutzer.click(screen.getByRole('button', { name: 'Browser-Zurück' }));

    expect(screen.getByRole('group', { name: 'Ungespeicherte Dokumentation' })).toBeInTheDocument();
    expect(adresse()).toBe('Adresse: /woanders');
  });
});

/**
 * Der Wettlauf, der einen Eintrag still halbiert (FIX-014).
 *
 * Gespeichert wird der Text von vorhin - die Antwort kommt eine Sekunde
 * später, und in dieser Sekunde wird weitergeschrieben. Ginge die Seite dann
 * weiter, läge der neue Satz nirgends. Die Seite meldet das mit `false`, und
 * der Schutz bleibt stehen.
 */
describe('Textverlustschutz: waehrend des Speicherns weitergeschrieben', () => {
  it('geht nicht weiter und sagt, dass noch etwas offen ist', async () => {
    const nutzer = userEvent.setup();
    const speichern = vi.fn().mockResolvedValue(false);
    renderWithProviders(<Pruefseite speichern={speichern} />, '/dokumentation');

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Speichern und weitergehen' }));

    expect(speichern).toHaveBeenCalledTimes(1);
    expect(adresse()).toBe('Adresse: /dokumentation');
    expect(screen.getByRole('alert')).toHaveTextContent(/weitergeschrieben/);
    // Die Rueckfrage bleibt offen: noch einmal speichern, verwerfen, bleiben.
    expect(screen.getByRole('group', { name: 'Ungespeicherte Dokumentation' })).toBeInTheDocument();
  });

  it('geht auch auf dem eigenen Schreibweg der Seite nicht weiter', async () => {
    const nutzer = userEvent.setup();
    const speichern = vi.fn().mockResolvedValue(false);
    renderWithProviders(<Pruefseite speichern={speichern} />, '/dokumentation');

    await nutzer.click(screen.getByRole('button', { name: 'Selbst speichern' }));

    expect(adresse()).toBe('Adresse: /dokumentation');
    expect(screen.getByRole('alert')).toHaveTextContent(/weitergeschrieben/);
  });
});

/**
 * Zwei Schreibzugriffe auf denselben Eintrag holen sich gegenseitig ein: Der
 * zweite schreibt auf einem Stand, den der erste gerade verschiebt, und die
 * Versionsprüfung des Servers wirft ihn ab - oder schlimmer, er gewinnt mit
 * dem älteren Text. Es läuft deshalb immer höchstens einer (FIX-014).
 */
describe('Textverlustschutz: keine gleichzeitigen Schreibvorgaenge', () => {
  it('startet keinen zweiten Vorgang, solange einer laeuft', async () => {
    const nutzer = userEvent.setup();
    let fertig: (vollstaendig: boolean) => void = () => {};
    const speichern = vi.fn().mockReturnValue(
      new Promise<boolean>((aufloesen) => {
        fertig = aufloesen;
      }),
    );
    renderWithProviders(<Pruefseite speichern={speichern} />, '/dokumentation');

    await nutzer.click(screen.getByRole('button', { name: 'Selbst speichern' }));
    expect(screen.getByText('Laeuft: ja')).toBeInTheDocument();

    // Ein zweiter Tap auf derselben Schaltfläche - und einer auf einer
    // anderen, über die Rückfrage.
    await nutzer.click(screen.getByRole('button', { name: 'Selbst speichern' }));
    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Wird gespeichert …' }));

    expect(speichern).toHaveBeenCalledTimes(1);

    await act(async () => {
      fertig(true);
      await Promise.resolve();
    });
    expect(speichern).toHaveBeenCalledTimes(1);
  });
});

/**
 * Das Abmelden ist keine Navigation (FIX-014).
 *
 * Es beendet die Sitzung und lässt die angemeldete Anwendung fallen;
 * `useBlocker` sieht davon nichts. Bis hierher nahm ein Tap auf „Abmelden" den
 * Text still mit.
 */
describe('Textverlustschutz: freiwilliges Abmelden', () => {
  it('fragt vor dem Abmelden und meldet zunaechst nicht ab', async () => {
    const nutzer = userEvent.setup();
    const abmelden = vi.fn();
    renderWithProviders(
      <MitAbmelden abmelden={abmelden} speichern={vi.fn().mockResolvedValue(true)} />,
      '/dokumentation',
    );

    await nutzer.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(abmelden).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Ungespeicherte Dokumentation' })).toBeInTheDocument();
    expect(screen.getByText(/Beim Abmelden geht er verloren/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern und abmelden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verwerfen und abmelden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hier bleiben' })).toBeInTheDocument();
  });

  it('meldet ohne ungespeicherte Eingabe unmittelbar ab', async () => {
    const nutzer = userEvent.setup();
    const abmelden = vi.fn();
    renderWithProviders(
      <MitAbmelden abmelden={abmelden} ungespeichert={false} />,
      '/dokumentation',
    );

    await nutzer.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(abmelden).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('group', { name: 'Ungespeicherte Dokumentation' }),
    ).not.toBeInTheDocument();
  });

  it('speichert zuerst fertig und meldet erst danach ab', async () => {
    const nutzer = userEvent.setup();
    const abmelden = vi.fn();
    let fertig: (vollstaendig: boolean) => void = () => {};
    const speichern = vi.fn().mockReturnValue(
      new Promise<boolean>((aufloesen) => {
        fertig = aufloesen;
      }),
    );
    renderWithProviders(
      <MitAbmelden abmelden={abmelden} speichern={speichern} />,
      '/dokumentation',
    );

    await nutzer.click(screen.getByRole('button', { name: 'Abmelden' }));
    await nutzer.click(screen.getByRole('button', { name: 'Speichern und abmelden' }));

    // Waehrend des Speicherns bleibt die Sitzung bestehen.
    expect(speichern).toHaveBeenCalledTimes(1);
    expect(abmelden).not.toHaveBeenCalled();

    await act(async () => {
      fertig(true);
      await Promise.resolve();
    });

    expect(abmelden).toHaveBeenCalledTimes(1);
  });

  it('behaelt Sitzung, Seite und Text, wenn das Speichern scheitert', async () => {
    const nutzer = userEvent.setup();
    const abmelden = vi.fn();
    const speichern = vi.fn().mockRejectedValue(new Error('Keine Verbindung zum Server.'));
    renderWithProviders(
      <MitAbmelden abmelden={abmelden} speichern={speichern} />,
      '/dokumentation',
    );

    await nutzer.click(screen.getByRole('button', { name: 'Abmelden' }));
    await nutzer.click(screen.getByRole('button', { name: 'Speichern und abmelden' }));

    expect(abmelden).not.toHaveBeenCalled();
    expect(adresse()).toBe('Adresse: /dokumentation');
    expect(screen.getByRole('alert')).toHaveTextContent('Keine Verbindung zum Server.');
    expect(screen.getByRole('alert')).toHaveTextContent(/Sitzung bleibt bestehen/);
  });

  it('meldet nach ausdruecklichem Verwerfen ab', async () => {
    const nutzer = userEvent.setup();
    const abmelden = vi.fn();
    const speichern = vi.fn().mockResolvedValue(true);
    renderWithProviders(
      <MitAbmelden abmelden={abmelden} speichern={speichern} />,
      '/dokumentation',
    );

    await nutzer.click(screen.getByRole('button', { name: 'Abmelden' }));
    await nutzer.click(screen.getByRole('button', { name: 'Verwerfen und abmelden' }));

    expect(speichern).not.toHaveBeenCalled();
    expect(abmelden).toHaveBeenCalledTimes(1);
  });

  it('bleibt auf der Seite und meldet nicht ab, wenn die Person bleibt', async () => {
    const nutzer = userEvent.setup();
    const abmelden = vi.fn();
    renderWithProviders(
      <MitAbmelden abmelden={abmelden} speichern={vi.fn().mockResolvedValue(true)} />,
      '/dokumentation',
    );

    await nutzer.click(screen.getByRole('button', { name: 'Abmelden' }));
    await nutzer.click(screen.getByRole('button', { name: 'Hier bleiben' }));

    expect(abmelden).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('group', { name: 'Ungespeicherte Dokumentation' }),
    ).not.toBeInTheDocument();
    expect(adresse()).toBe('Adresse: /dokumentation');
  });

  /**
   * Die Wache gilt für die Seite, auf der geschrieben wird. Ist sie fort,
   * meldet die Kopfzeile wieder unmittelbar ab - sonst hinge ein Abmelden an
   * einer Seite, die es gar nicht mehr gibt.
   */
  it('nimmt die Wache mit der Seite zurueck', async () => {
    const nutzer = userEvent.setup();
    const abmelden = vi.fn();
    const { rerender } = renderWithProviders(
      <MitAbmelden abmelden={abmelden} speichern={vi.fn().mockResolvedValue(true)} />,
      '/dokumentation',
    );

    rerender(
      <AbmeldeschutzProvider onAbmelden={abmelden}>
        <Kopfzeilenknopf />
      </AbmeldeschutzProvider>,
    );
    await nutzer.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(abmelden).toHaveBeenCalledTimes(1);
  });
});

describe('Textverlustschutz: Fokus', () => {
  it('setzt den Fokus in die Rueckfrage, die ohne Zutun erscheint', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <Pruefseite speichern={vi.fn().mockResolvedValue(true)} />,
      '/dokumentation',
    );

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));

    expect(screen.getByRole('button', { name: 'Speichern und weitergehen' })).toHaveFocus();
  });
});
