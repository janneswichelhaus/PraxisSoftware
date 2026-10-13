import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Uebungsbild as Bild } from './schema';
import { Uebungsbild } from './Uebungsbild';

/** Das Übungsbild als Komponente (ANN-381): Beschreibung, Darstellungen, Abspielen nur auf Tippen. */

const BILD: Bild = {
  v: 1,
  basis: 'sitz',
  start: {},
  ende: { knie: [8, 87], sprung: [-12, 0], fuss_flach: [false, true] },
  bewegung: ['knoechel_nah'],
};

function bewegungReduzieren(aktiv: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((abfrage: string) => ({
      matches: aktiv && abfrage.includes('prefers-reduced-motion'),
      media: abfrage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Uebungsbild', () => {
  it('beschreibt Start und Ende als zwei Bilder', () => {
    bewegungReduzieren(false);
    render(<Uebungsbild bild={BILD} name="Im Sitz das Knie strecken" darstellung="start-ende" />);
    expect(
      screen.getByRole('img', { name: 'Im Sitz das Knie strecken: Ausgangsstellung' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Im Sitz das Knie strecken: Endstellung' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 · Start')).toBeInTheDocument();
  });

  it('zeigt die Bewegung in einem Bild mit Pfeil', () => {
    bewegungReduzieren(false);
    const { container } = render(<Uebungsbild bild={BILD} name="Knie strecken" />);
    expect(
      screen.getByRole('img', {
        name: 'Knie strecken: Bewegung von der Ausgangs- zur Endstellung',
      }),
    ).toBeInTheDocument();
    expect(container.querySelector('g[opacity]')).not.toBeNull();
    expect(container.querySelectorAll('path.stroke-figur-bewegung').length).toBe(2);
  });

  it('bleibt in Listen stumm, wenn der Name daneben steht', () => {
    bewegungReduzieren(false);
    const { container } = render(
      <Uebungsbild bild={BILD} name="Knie strecken" darstellung="vorschau" dekorativ />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('spielt nichts von selbst ab und erst auf Tippen', async () => {
    bewegungReduzieren(false);
    render(<Uebungsbild bild={BILD} name="Knie strecken" animierbar />);
    const knopf = screen.getByRole('button', { name: 'Bewegung abspielen' });
    expect(knopf).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(knopf);
    expect(screen.getByRole('button', { name: 'Anhalten' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('wechselt bei reduzierter Bewegung ohne Übergang zwischen den Stellungen', async () => {
    bewegungReduzieren(true);
    render(<Uebungsbild bild={BILD} name="Knie strecken" animierbar />);
    await userEvent.click(screen.getByRole('button', { name: 'Endstellung zeigen' }));
    expect(screen.getByRole('button', { name: 'Ausgangsstellung zeigen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anhalten' })).toBeNull();
  });
});
