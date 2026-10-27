import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Antworten } from './antworten';
import { FragebogenFelder } from './FragebogenFelder';
import type { ScoreDefinition } from './schema';

/**
 * Die 0–10-Skala am Handy (BEF-057, ANN-258): zwei Reihen statt elf
 * schmaler Stufen, der gewählte Wert als Text.
 */
function definition(max: number): ScoreDefinition {
  return {
    items: [{ id: 'schmerz', text: 'Schmerzstärke', typ: 'skala', skala: { min: 0, max } }],
  } as unknown as ScoreDefinition;
}

function Bogen({ max }: { max: number }) {
  const [antworten, setAntworten] = useState<Antworten>({});
  return (
    <FragebogenFelder
      definition={definition(max)}
      antworten={antworten}
      onChange={(id, antwort) =>
        setAntworten((bisher) => {
          const naechste = { ...bisher };
          if (antwort === undefined) delete naechste[id];
          else naechste[id] = antwort;
          return naechste;
        })
      }
    />
  );
}

describe('Skala (BEF-057)', () => {
  it('teilt elf Stufen am Handy auf zwei Reihen zu je sechs Spalten', () => {
    render(<Bogen max={10} />);
    const stufen = screen.getByTestId('skala-stufen');
    expect(stufen.style.getPropertyValue('--skala-spalten')).toBe('6');
    expect(stufen).toHaveClass('sm:grid-flow-col');
  });

  it('lässt eine kurze Skala in einer Reihe', () => {
    render(<Bogen max={4} />);
    expect(screen.getByTestId('skala-stufen').style.getPropertyValue('--skala-spalten')).toBe('5');
  });

  it('nennt den gewählten Wert als Text', () => {
    render(<Bogen max={10} />);
    expect(screen.queryByText(/gewählt:/)).toBeNull();
    fireEvent.click(screen.getByLabelText('6'));
    expect(screen.getByText('gewählt: 6')).toBeInTheDocument();
  });
});
