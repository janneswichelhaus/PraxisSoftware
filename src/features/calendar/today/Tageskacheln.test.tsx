import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Tageskacheln, type Abfahrt } from './Tageskacheln';

/** Liege und Abfahrt als zwei Kacheln (Jannes, 2026-10-11). */
const abfahrt = (teil: Partial<Abfahrt> = {}): Abfahrt => ({
  titel: 'Abfahrt',
  zeit: '08:12',
  fahrtMin: 18,
  pufferMin: 12,
  stufe: 'clear',
  ...teil,
});

describe('Tageskacheln', () => {
  it('stellt Liege und Abfahrt nebeneinander, ohne Puffer, wenn er reicht', async () => {
    const { container } = render(
      <Tageskacheln liege={{ noetig: false }} abfahrt={abfahrt()} tagWort="heute" />,
    );
    expect(container.querySelector('dl')).toHaveClass('grid-cols-2');
    expect(screen.getByText('Nein')).toBeInTheDocument();
    expect(screen.getByText('spätestens 08:12')).toBeInTheDocument();
    expect(screen.getByText('≈ 18 min Rad')).toBeInTheDocument();
    expect(screen.queryByText(/Puffer/)).toBeNull();
    await pruefeBarrierefreiheit(container);
  });

  it('nennt den Puffer, sobald es knapp wird, und sagt „Sofort", wenn es nicht reicht', () => {
    const { rerender } = render(
      <Tageskacheln
        liege={null}
        abfahrt={abfahrt({ pufferMin: 3, stufe: 'tight' })}
        tagWort="heute"
      />,
    );
    expect(screen.getByText('3 min Puffer')).toHaveClass('text-warnung');
    rerender(
      <Tageskacheln
        liege={null}
        abfahrt={abfahrt({ pufferMin: -4, stufe: 'late' })}
        tagWort="heute"
      />,
    );
    expect(screen.getByText('Sofort')).toBeInTheDocument();
    expect(screen.getByText('4 min zu knapp')).toBeInTheDocument();
  });

  it('nimmt allein die ganze Breite und fehlt ganz ohne beide Fragen', () => {
    const { container, rerender } = render(
      <Tageskacheln liege={{ noetig: false }} abfahrt={null} tagWort="morgen" />,
    );
    expect(container.querySelector('dl')).toHaveClass('grid-cols-1');
    expect(screen.getByText('Liege morgen')).toBeInTheDocument();
    rerender(<Tageskacheln liege={null} abfahrt={null} tagWort="heute" />);
    expect(container.querySelector('dl')).toBeNull();
  });
});
