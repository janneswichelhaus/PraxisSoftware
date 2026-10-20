import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Schieberegler } from './Schieberegler';

/**
 * Der Schieberegler (BEF-190): „−“ und „+“ gehen um den Knopfschritt und
 * sind an der Grenze aus; der native Regler sagt den Wert in Worten.
 */

function Probe({ start = 1 }: { start?: number }) {
  const [wert, setWert] = useState(start);
  return (
    <Schieberegler
      beschriftung="Vergrößern"
      wert={wert}
      min={1}
      max={2}
      schritt={0.05}
      knopfschritt={0.5}
      wertText={(w) => `${w}-fach`}
      weniger="Weniger vergrößern"
      mehr="Mehr vergrößern"
      onAendern={setWert}
    />
  );
}

describe('Schieberegler', () => {
  it('geht mit den Knöpfen um den Knopfschritt bis an die Grenzen', async () => {
    const user = userEvent.setup();
    render(<Probe />);
    const regler = screen.getByRole('slider', { name: 'Vergrößern' });
    const weniger = screen.getByRole('button', { name: 'Weniger vergrößern' });
    const mehr = screen.getByRole('button', { name: 'Mehr vergrößern' });
    expect(weniger).toBeDisabled();
    await user.click(mehr);
    expect(regler).toHaveAttribute('aria-valuetext', '1.5-fach');
    await user.click(mehr);
    expect(regler).toHaveValue('2');
    expect(mehr).toBeDisabled();
    await user.click(weniger);
    expect(regler).toHaveValue('1.5');
  });

  it('übernimmt den Wert des Reglers', () => {
    render(<Probe />);
    const regler = screen.getByRole('slider', { name: 'Vergrößern' });
    fireEvent.change(regler, { target: { value: '1.25' } });
    expect(regler).toHaveAttribute('aria-valuetext', '1.25-fach');
  });

  it('ist barrierefrei', async () => {
    const { container } = render(<Probe start={1.5} />);
    await pruefeBarrierefreiheit(container);
  });
});
