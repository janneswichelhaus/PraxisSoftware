import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
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
  speichern?: () => Promise<void>;
  mitFreigabe?: boolean;
}) {
  const { freigeben, schutz } = useTextverlustschutz(
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
      {schutz}
      <Link to="/woanders">Weggehen</Link>
      <Link to="/dokumentation?filter=alle">Nur Parameter</Link>
      <button type="button" onClick={() => void navigate(-1)}>
        Browser-Zurück
      </button>
      {mitFreigabe ? (
        <Link to="/woanders" onClick={freigeben}>
          Freigegeben weggehen
        </Link>
      ) : null}
    </div>
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
      <Pruefseite speichern={vi.fn().mockResolvedValue(undefined)} />,
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
    const speichern = vi.fn().mockResolvedValue(undefined);
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
    const speichern = vi.fn().mockResolvedValue(undefined);
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
    let fertig: () => void = () => {};
    const speichern = vi.fn().mockReturnValue(
      new Promise<void>((aufloesen) => {
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
      fertig();
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
});

describe('Textverlustschutz: Fokus', () => {
  it('setzt den Fokus in die Rueckfrage, die ohne Zutun erscheint', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <Pruefseite speichern={vi.fn().mockResolvedValue(undefined)} />,
      '/dokumentation',
    );

    await nutzer.click(screen.getByRole('link', { name: 'Weggehen' }));

    expect(screen.getByRole('button', { name: 'Speichern und weitergehen' })).toHaveFocus();
  });
});
