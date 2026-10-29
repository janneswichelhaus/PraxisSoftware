import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stufenskala } from './Stufenskala';

function Frage({ wert, onChange }: { wert: number | null; onChange: (w: number | null) => void }) {
  return (
    <>
      <p id="frage">Wie stark sind Ihre Schmerzen in Ruhe?</p>
      <Stufenskala
        beschriftetVon="frage"
        enden={['keine', 'stärkste vorstellbare']}
        wert={wert}
        onChange={onChange}
      />
    </>
  );
}

describe('Stufenskala', () => {
  it('stellt elf Stufen in zwei gleich langen Reihen, unter 23rem drei je Reihe, im breiten Feld eine', () => {
    render(<Frage wert={null} onChange={() => {}} />);
    const gruppe = screen.getByRole('group', { name: 'Wie stark sind Ihre Schmerzen in Ruhe?' });
    expect(gruppe.className).toContain('grid-cols-[repeat(30,minmax(0,1fr))]');
    const stufen = screen.getAllByRole('button');
    expect(stufen).toHaveLength(11);
    // 6 × 5 = 30 und 5 × 6 = 30 Spalten: beide Reihen sind gleich lang.
    expect(stufen.slice(0, 6).every((s) => s.className.includes(' col-span-5'))).toBe(true);
    expect(stufen.slice(6).every((s) => s.className.includes(' col-span-6'))).toBe(true);
    expect(stufen.slice(0, 9).every((s) => s.className.includes('max-[23rem]:col-span-2'))).toBe(
      true,
    );
    expect(stufen.slice(9).every((s) => s.className.includes('max-[23rem]:col-span-3'))).toBe(true);
    expect(gruppe.className).toContain('@skalenreihe:grid-cols-11');
    expect(gruppe.parentElement).toHaveClass('@container');
  });

  it('wählt nichts vor, nennt die Enden und nimmt mit einem zweiten Tipp zurück', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Frage wert={null} onChange={onChange} />);
    expect(
      screen.getAllByRole('button').some((s) => s.getAttribute('aria-pressed') === 'true'),
    ).toBe(false);
    expect(screen.getByRole('button', { name: '0 – keine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10 – stärkste vorstellbare' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '7' }));
    expect(onChange).toHaveBeenLastCalledWith(7);

    rerender(<Frage wert={7} onChange={onChange} />);
    const sieben = screen.getByRole('button', { name: '7' });
    expect(sieben).toHaveAttribute('aria-pressed', 'true');
    expect(sieben.className).toContain('bg-accent');
    await userEvent.click(sieben);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
