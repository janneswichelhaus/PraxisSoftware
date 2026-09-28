import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbmeldeschutzProvider } from './AbmeldeschutzProvider';
import { useAbmeldeanfrage, useAbmeldewache } from './abmeldeschutz';

/**
 * Der Abmeldeschutz mit mehreren Wachen (NAV-01, DAT-04).
 *
 * Bis UXR-002 hielt der Schutz genau eine Wache. Meldete sich eine zweite
 * Seite an, verdrängte sie die erste; ging sie wieder, nahm sie den Schutz der
 * ersten mit - ein Tap auf „Abmelden" verwarf deren Eingaben dann ohne Frage.
 * Geprüft wird deshalb die Reihe: Jede Wache mit ungespeicherten Eingaben
 * fragt, erst danach endet die Sitzung.
 */

function Kopfzeile() {
  const anfordern = useAbmeldeanfrage();
  return (
    <button type="button" onClick={() => anfordern?.()}>
      Abmelden
    </button>
  );
}

/** Eine Seite mit Eingaben, die beim Abmelden fragt, solange etwas offen ist. */
function Formular({ name, ungespeichert }: { name: string; ungespeichert: boolean }) {
  const [fragt, setFragt] = useState(false);
  const abmelden = useAbmeldewache(() => {
    if (!ungespeichert) return false;
    setFragt(true);
    return true;
  });

  if (!fragt) return null;
  return (
    <div role="group" aria-label={name}>
      <button
        type="button"
        onClick={() => {
          setFragt(false);
          abmelden?.();
        }}
      >
        {`${name}: verwerfen und abmelden`}
      </button>
      <button type="button" onClick={() => setFragt(false)}>
        {`${name}: hier bleiben`}
      </button>
    </div>
  );
}

function Anwendung({
  onAbmelden,
  formulare,
}: {
  onAbmelden: () => void;
  formulare: readonly { name: string; ungespeichert: boolean }[];
}) {
  return (
    <AbmeldeschutzProvider onAbmelden={onAbmelden}>
      <Kopfzeile />
      {formulare.map((formular) => (
        <Formular key={formular.name} {...formular} />
      ))}
    </AbmeldeschutzProvider>
  );
}

describe('Abmeldeschutz', () => {
  it('meldet ohne Wache unmittelbar ab', async () => {
    const onAbmelden = vi.fn();
    render(<Anwendung onAbmelden={onAbmelden} formulare={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(onAbmelden).toHaveBeenCalledOnce();
  });

  it('meldet unmittelbar ab, wenn keine Wache etwas Ungespeichertes hat', async () => {
    const onAbmelden = vi.fn();
    render(
      <Anwendung
        onAbmelden={onAbmelden}
        formulare={[
          { name: 'Patientendaten', ungespeichert: false },
          { name: 'Foto', ungespeichert: false },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(onAbmelden).toHaveBeenCalledOnce();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('fragt jede Wache mit ungespeicherten Eingaben der Reihe nach, bevor die Sitzung endet', async () => {
    const onAbmelden = vi.fn();
    render(
      <Anwendung
        onAbmelden={onAbmelden}
        formulare={[
          { name: 'Patientendaten', ungespeichert: true },
          { name: 'Foto', ungespeichert: true },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(screen.getByRole('group', { name: 'Patientendaten' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Foto' })).toBeNull();
    expect(onAbmelden).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Patientendaten: verwerfen und abmelden' }),
    );
    // Die zweite Wache hat noch etwas zu sagen - die Sitzung besteht weiter.
    expect(screen.getByRole('group', { name: 'Foto' })).toBeInTheDocument();
    expect(onAbmelden).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Foto: verwerfen und abmelden' }));
    expect(onAbmelden).toHaveBeenCalledOnce();
  });

  it('überspringt eine Wache ohne ungespeicherte Eingaben', async () => {
    const onAbmelden = vi.fn();
    render(
      <Anwendung
        onAbmelden={onAbmelden}
        formulare={[
          { name: 'Patientendaten', ungespeichert: false },
          { name: 'Foto', ungespeichert: true },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(screen.queryByRole('group', { name: 'Patientendaten' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Foto' })).toBeInTheDocument();
    expect(onAbmelden).not.toHaveBeenCalled();
  });

  it('behält den Schutz einer Seite, wenn eine andere Wache geht (NAV-01)', async () => {
    // Genau der Fall, an dem die einzelne Stelle scheiterte: Die zweite
    // Anmeldung verdrängte die erste, ihr Abgang räumte dann beide ab.
    const onAbmelden = vi.fn();
    const { rerender } = render(
      <Anwendung
        onAbmelden={onAbmelden}
        formulare={[
          { name: 'Patientendaten', ungespeichert: true },
          { name: 'Foto', ungespeichert: true },
        ]}
      />,
    );
    rerender(
      <Anwendung
        onAbmelden={onAbmelden}
        formulare={[{ name: 'Patientendaten', ungespeichert: true }]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(screen.getByRole('group', { name: 'Patientendaten' })).toBeInTheDocument();
    expect(onAbmelden).not.toHaveBeenCalled();
  });

  it('bleibt angemeldet, wenn die Person bleibt, und fragt beim nächsten Mal wieder', async () => {
    const onAbmelden = vi.fn();
    render(
      <Anwendung
        onAbmelden={onAbmelden}
        formulare={[{ name: 'Patientendaten', ungespeichert: true }]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    await userEvent.click(screen.getByRole('button', { name: 'Patientendaten: hier bleiben' }));
    expect(onAbmelden).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(screen.getByRole('group', { name: 'Patientendaten' })).toBeInTheDocument();
    expect(onAbmelden).not.toHaveBeenCalled();
  });
});
