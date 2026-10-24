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

  it('gleich gewichtet: jede Wahl gleich breit und 48 hoch, nichts vorgewählt (5.3)', async () => {
    const nutzer = userEvent.setup();
    function Einwilligung() {
      const [wert, setWert] = useState<'ja' | 'nein' | null>(null);
      return (
        <Wahlreihe
          legende="Nachrichten per E-Mail"
          legendeSichtbar={false}
          wahlen={[
            { wert: 'ja', text: 'Ja, erlauben' },
            { wert: 'nein', text: 'Nein' },
          ]}
          gewaehlt={wert}
          onWaehlen={setWert}
          gleichgewichtet
        />
      );
    }
    renderWithProviders(<Einwilligung />);
    const ja = screen.getByRole('radio', { name: 'Ja, erlauben' });
    const nein = screen.getByRole('radio', { name: 'Nein' });
    expect(ja).not.toBeChecked();
    expect(nein).not.toBeChecked();
    for (const radio of [ja, nein]) {
      expect(radio.closest('label')).toHaveClass('min-h-12', 'flex-1', 'basis-[7.5em]');
    }
    await nutzer.click(screen.getByText('Nein'));
    expect(nein).toBeChecked();
  });

  it('hält jede Fläche bei 44 px (Regel 3)', () => {
    renderWithProviders(<Bremsen />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.closest('label')?.className).toContain('min-h-11');
    }
  });

  it('sofort: Knöpfe mit aria-pressed - die Pfeiltasten wählen nichts (DRP-017)', async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    function Einwilligung() {
      const [wert, setWert] = useState<'ja' | 'nein' | null>(null);
      return (
        <Wahlreihe
          legende="Bericht an Ihre Ärztin oder Ihren Arzt"
          legendeSichtbar={false}
          wahlen={[
            { wert: 'ja', text: 'Ja, erlauben' },
            { wert: 'nein', text: 'Nein' },
          ]}
          gewaehlt={wert}
          onWaehlen={(neu) => {
            gewaehlt.push(neu);
            setWert(neu);
          }}
          gleichgewichtet
          sofort
        />
      );
    }
    const { container } = renderWithProviders(<Einwilligung />);
    const gruppe = screen.getByRole('group', { name: 'Bericht an Ihre Ärztin oder Ihren Arzt' });
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const ja = screen.getByRole('button', { name: 'Ja, erlauben' });
    const nein = screen.getByRole('button', { name: 'Nein' });
    expect(gruppe).toContainElement(ja);
    expect(ja).toHaveAttribute('aria-pressed', 'false');
    expect(nein).toHaveAttribute('aria-pressed', 'false');
    expect(ja).toHaveClass('min-h-12', 'flex-1', 'basis-[7.5em]');
    await pruefeBarrierefreiheit(container);

    // Tab und Pfeile hören sich die Wahlen an und wählen nichts.
    await nutzer.tab();
    expect(ja).toHaveFocus();
    await nutzer.keyboard('{ArrowDown}{ArrowRight}{ArrowUp}');
    await nutzer.tab();
    expect(nein).toHaveFocus();
    expect(gewaehlt).toEqual([]);

    // Gewählt wird mit der Leertaste, Enter oder einem Tipp; die Wahl trägt ein Zeichen.
    await nutzer.keyboard(' ');
    expect(nein).toHaveAttribute('aria-pressed', 'true');
    expect(nein.textContent).toBe('✓Nein');
    await nutzer.click(ja);
    await nutzer.click(ja);
    expect(gewaehlt).toEqual(['nein', 'ja']);
    expect(ja).toHaveAttribute('aria-pressed', 'true');
    expect(nein).toHaveAttribute('aria-pressed', 'false');
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
