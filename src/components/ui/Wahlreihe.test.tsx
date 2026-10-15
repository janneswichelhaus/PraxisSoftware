import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Mehrfachwahl, Wahlreihe } from './Wahlreihe';

const WAHLEN = [
  { wert: 'ok', text: 'In Ordnung' },
  { wert: 'beobachten', text: 'Beobachten' },
  { wert: 'problem', text: 'Problem' },
] as const;

type Bewertung = (typeof WAHLEN)[number]['wert'];

function Bremsen({ start = 'ok' as Bewertung | null }) {
  const [wert, setWert] = useState<Bewertung | null>(start);
  return (
    <>
      <Wahlreihe legende="Bremsen" wahlen={WAHLEN} gewaehlt={wert} onWaehlen={setWert} />
      <p data-testid="stand">{wert ?? 'nichts'}</p>
    </>
  );
}

describe('Wahlreihe', () => {
  it('ist eine benannte Radiogruppe mit genau einer Wahl', async () => {
    const { container } = renderWithProviders(<Bremsen />);
    const gruppe = screen.getByRole('group', { name: 'Bremsen' });
    expect(gruppe).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'In Ordnung' })).toBeChecked();
    expect(
      screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked),
    ).toHaveLength(1);
    await pruefeBarrierefreiheit(container);
  });

  it('wechselt die Wahl per Tippen und per Pfeiltaste', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Bremsen />);
    await nutzer.click(screen.getByText('Problem'));
    expect(screen.getByTestId('stand')).toHaveTextContent('problem');
    expect(screen.getByRole('radio', { name: 'Problem' })).toBeChecked();
    await nutzer.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('stand')).toHaveTextContent('beobachten');
  });

  it('zeigt die Wahl mit einem Zeichen, nicht nur mit Farbe (Regel 5)', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Bremsen start={null} />);
    expect(screen.queryByText('✓')).toBeNull();
    await nutzer.click(screen.getByText('Beobachten'));
    expect(screen.getByText('Beobachten').closest('label')?.textContent).toBe('✓Beobachten');
  });

  it('hält jede Fläche bei 44 px (Regel 3)', () => {
    renderWithProviders(<Bremsen />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.closest('label')?.className).toContain('min-h-11');
    }
  });
});

describe('Mehrfachwahl', () => {
  function Tage() {
    const [tage, setTage] = useState<string[]>(['1']);
    return (
      <>
        <Mehrfachwahl
          legende="Fährt das Rad am"
          wahlen={[
            { wert: '1', text: 'Mo' },
            { wert: '2', text: 'Di' },
            { wert: '3', text: 'Mi' },
          ]}
          gewaehlt={tage}
          onAendern={setTage}
        />
        <p data-testid="tage">{tage.join(',')}</p>
      </>
    );
  }

  it('wählt mehrere Werte in ihrer Reihenfolge und nimmt einen zurück', async () => {
    const nutzer = userEvent.setup();
    const { container } = renderWithProviders(<Tage />);
    await nutzer.click(screen.getByText('Mi'));
    await nutzer.click(screen.getByText('Di'));
    expect(screen.getByTestId('tage')).toHaveTextContent('1,2,3');
    await nutzer.click(screen.getByText('Mo'));
    expect(screen.getByTestId('tage')).toHaveTextContent('2,3');
    expect(screen.getByRole('checkbox', { name: 'Di' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Fährt das Rad am' })).toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });
});
