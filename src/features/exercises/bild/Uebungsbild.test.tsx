import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { istAusgangsstellung, type Uebungsbild as Bild } from './schema';
import { szene } from './szene';
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

/** Ein Bild der Ausgangsstellung (ANN-480): Start gleich Ende, ohne Bewegung. */
const STELLUNG: Bild = {
  v: 1,
  basis: 'sitz',
  start: { schulter: [40, 18], ellbogen: [90, 62], haende: [null, 'oberschenkel'] },
  ende: { haende: [null, 'oberschenkel'], ellbogen: [90, 62], schulter: [40, 18] },
  hilfsmittel: [{ art: 'tisch', x: 40 }],
};

describe('istAusgangsstellung', () => {
  it('erkennt Start gleich Ende ohne Bewegung, gleich in welcher Reihenfolge', () => {
    expect(istAusgangsstellung(STELLUNG)).toBe(true);
    expect(istAusgangsstellung({ v: 1, basis: 'stand', start: {}, ende: {} })).toBe(true);
    expect(istAusgangsstellung({ ...STELLUNG, bewegung: [] })).toBe(true);
    // Ein ausdrücklich leeres Feld zählt wie ein fehlendes.
    expect(
      istAusgangsstellung({ v: 1, basis: 'stand', start: { rumpf: undefined }, ende: {} }),
    ).toBe(true);
  });

  it('bleibt ein Bewegungsbild, sobald sich etwas bewegt oder ein Pfeil steht', () => {
    expect(istAusgangsstellung(BILD)).toBe(false);
    expect(istAusgangsstellung({ ...STELLUNG, bewegung: ['hand_nah'] })).toBe(false);
    expect(
      istAusgangsstellung({ ...STELLUNG, ende: { ...STELLUNG.ende, ellbogen: [90, 63] } }),
    ).toBe(false);
    expect(istAusgangsstellung({ ...STELLUNG, ende: { ...STELLUNG.ende, rumpf: 0 } })).toBe(false);
    expect(
      istAusgangsstellung({
        v: 1,
        basis: 'stand',
        start: { loesen: { winkel: 'rumpf', gleich: ['schulter', 'ferse_nah'] } },
        ende: { loesen: { winkel: 'rumpf', gleich: ['ferse_nah', 'schulter'] } },
      }),
    ).toBe(false);
  });

  it('zeichnet die Stellung ohne Pfeil und ohne blasse Vorstellung', () => {
    const s = szene(STELLUNG, 'start');
    expect(s.pfeile).toEqual([]);
    expect(s.geist).toEqual([]);
    expect(s.figur.length).toBeGreaterThan(10);
  });
});

describe('Uebungsbild der Ausgangsstellung', () => {
  it('zeigt in Start und Ende eine Figur mit der Unterschrift „Ausgangsstellung"', () => {
    bewegungReduzieren(false);
    render(<Uebungsbild bild={STELLUNG} name="Hand öffnen" darstellung="start-ende" animierbar />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Hand öffnen: Ausgangsstellung' })).toBeInTheDocument();
    expect(screen.getByText('Ausgangsstellung')).toBeInTheDocument();
    expect(screen.queryByText('1 · Start')).toBeNull();
    expect(screen.queryByText('2 · Ende')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('zeigt als Bewegungsbild dieselbe eine Figur, ohne Pfeil und ohne Knopf', () => {
    bewegungReduzieren(false);
    const { container } = render(
      <Uebungsbild bild={STELLUNG} name="Hand öffnen" darstellung="bewegung" animierbar />,
    );
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Hand öffnen: Ausgangsstellung' })).toBeInTheDocument();
    expect(screen.getByText('Ausgangsstellung')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Bewegung von der Ausgangs/ })).toBeNull();
    expect(container.querySelector('g[opacity]')).toBeNull();
    expect(container.querySelectorAll('path.stroke-figur-bewegung')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('bleibt auch bei reduzierter Bewegung ohne Knopf', () => {
    bewegungReduzieren(true);
    render(<Uebungsbild bild={STELLUNG} name="Hand öffnen" animierbar />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('legt einen Rahmen um die Figur und behält die Unterschrift', () => {
    bewegungReduzieren(false);
    render(
      <Uebungsbild
        bild={STELLUNG}
        name="Hand öffnen"
        animierbar
        dekorativ
        einfassen={(zeichnung) => (
          <span role="img" aria-label="Zeichnung der Übung „Hand öffnen“">
            {zeichnung}
          </span>
        )}
      />,
    );
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(
      screen.getByRole('img', { name: 'Zeichnung der Übung „Hand öffnen“' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ausgangsstellung')).toBeInTheDocument();
  });

  it('lässt die Vorschau, wie sie ist', () => {
    bewegungReduzieren(false);
    const { container } = render(
      <Uebungsbild bild={STELLUNG} name="Hand öffnen" darstellung="vorschau" dekorativ />,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('g[opacity]')).not.toBeNull();
    expect(screen.queryByText('Ausgangsstellung')).toBeNull();
  });
});
