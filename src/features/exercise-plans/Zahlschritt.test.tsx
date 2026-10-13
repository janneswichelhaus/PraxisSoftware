import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Zahlschritt } from './Zahlschritt';

/** Der Dosier-Stepper (Welle B): Plus und Minus statt Tastatur, Grenzen sperren. */

function Probe({ anfang, leer }: { anfang: number; leer?: string }) {
  const [wert, setWert] = useState(anfang);
  return (
    <Zahlschritt
      beschriftung="Halten"
      einheit="s"
      wert={wert}
      min={0}
      max={3}
      onAendern={setWert}
      {...(leer ? { leer } : {})}
    />
  );
}

describe('Zahlschritt', () => {
  it('zählt mit Plus und Minus und sperrt an den Grenzen', async () => {
    const user = userEvent.setup();
    render(<Probe anfang={2} />);
    const gruppe = screen.getByRole('group', { name: 'Halten' });
    expect(gruppe).toHaveTextContent('2 s');
    await user.click(screen.getByRole('button', { name: 'Halten: mehr' }));
    expect(screen.getByRole('status')).toHaveTextContent('3 s');
    expect(screen.getByRole('button', { name: 'Halten: mehr' })).toBeDisabled();
    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Halten: weniger' }));
    }
    expect(screen.getByRole('status')).toHaveTextContent('0 s');
    expect(screen.getByRole('button', { name: 'Halten: weniger' })).toBeDisabled();
  });

  it('zeigt bei 0 das Wort für „ohne Angabe“', () => {
    render(<Probe anfang={0} leer="ohne" />);
    expect(screen.getByRole('status')).toHaveTextContent('ohne');
  });

  it('hat Tippziele von 44 px (Symbolknopf)', () => {
    render(<Probe anfang={1} />);
    for (const knopf of screen.getAllByRole('button')) expect(knopf).toHaveClass('size-11');
  });
});
