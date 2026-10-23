import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Schalter } from './Schalter';

/** Ein Schalter als Karte (Handoff 2026-10-22, Abschnitt 5.3). Synthetische Inhalte. */
function Mitteilungen({ laeuft = false, onUmschalten = vi.fn() }) {
  const [an, setAn] = useState(false);
  return (
    <div className="plattform-schrift">
      <Schalter
        beschriftung="Mitteilungen auf diesem Telefon"
        hinweis="Ihr Telefon fragt einmal um Erlaubnis."
        an={an}
        laeuft={laeuft}
        onUmschalten={(wert) => {
          onUmschalten(wert);
          setAn(wert);
        }}
      />
    </div>
  );
}

describe('Schalter', () => {
  it('ist ein benannter Schalter mit Beschreibung, Zustand als Wort und Lage', async () => {
    const { container } = render(<Mitteilungen />);
    const schalter = screen.getByRole('switch', { name: 'Mitteilungen auf diesem Telefon' });
    expect(schalter).toHaveAttribute('aria-checked', 'false');
    expect(schalter).toHaveAccessibleDescription('Ihr Telefon fragt einmal um Erlaubnis.');
    // Das Wort steht sichtbar daneben, vorgelesen wird der Zustand des Schalters.
    expect(container.querySelector('[data-zustand]')).toHaveTextContent('Aus');
    expect(
      container.querySelector('[data-zustand]')!.closest('[aria-hidden="true"]'),
    ).not.toBeNull();
    // Die ganze Karte ist das Ziel: mindestens 80 hoch, Spur 56 × 32 aus `line-strong`.
    expect(schalter).toHaveClass('min-h-20', 'rounded-card', 'w-full');
    expect(container.querySelector('[data-spur]')).toHaveClass('h-8', 'w-14', 'bg-line-strong');
    await pruefeBarrierefreiheit(container);
  });

  it('schaltet mit einem Tipp und sagt „An“', async () => {
    const nutzer = userEvent.setup();
    const onUmschalten = vi.fn();
    const { container } = render(<Mitteilungen onUmschalten={onUmschalten} />);
    await nutzer.click(screen.getByRole('switch'));
    expect(onUmschalten).toHaveBeenCalledWith(true);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelector('[data-zustand]')).toHaveTextContent('An');
    expect(container.querySelector('[data-spur]')).toHaveClass('bg-accent');
  });

  it('nimmt keinen zweiten Tipp an, solange der Wechsel läuft, und behält den Fokus', async () => {
    const nutzer = userEvent.setup();
    const onUmschalten = vi.fn();
    render(<Mitteilungen laeuft onUmschalten={onUmschalten} />);
    const schalter = screen.getByRole('switch');
    await nutzer.click(schalter);
    expect(onUmschalten).not.toHaveBeenCalled();
    expect(schalter).toHaveAttribute('aria-disabled', 'true');
    expect(schalter).not.toBeDisabled();
    expect(schalter).toHaveFocus();
  });
});
