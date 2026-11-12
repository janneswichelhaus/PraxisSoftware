import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { CalendarGrid, type GitterSpalte, type PausenZiel } from './CalendarGrid';

/** Annas Tag: 08-11 und 12-18, die Pause des Plans (12-13) liegt auf 11-12. */
const SPALTE: GitterSpalte = {
  id: 'st-1',
  titel: 'Anna Beispiel',
  baender: [
    { vonMinute: 480, bisMinute: 660 },
    { vonMinute: 720, bisMinute: 1080 },
  ],
  pausen: [
    {
      vonMinute: 660,
      bisMinute: 720,
      planVonMinute: 720,
      verschoben: true,
      kennung: 'pause:st-1:720',
      ziehbar: true,
    },
  ],
};

function zeichnen(spalte: GitterSpalte, onPauseVerschieben?: (ziel: PausenZiel) => void) {
  return renderWithProviders(
    <CalendarGrid
      spaltenModell={[spalte]}
      eintraege={[]}
      fenster={{ vonMinute: 420, bisMinute: 1140 }}
      raster={5}
      stundenHoehe={60}
      onVerschieben={() => {}}
      onPauseVerschieben={onPauseVerschieben}
      onAuswahl={() => {}}
      kontext="2027-05-12"
      ziehbarErlaubt
      beschriftung="Tagesansicht nach behandelnder Person"
    />,
  );
}

describe('Pause im Raster', () => {
  it('steht als Block statt als graue Schraffur zwischen den Blöcken', () => {
    zeichnen(SPALTE);
    const pause = screen.getByTestId('pause');
    expect(pause).toHaveTextContent('11:00–12:00Pause, 11:00–12:00, verschoben');
    expect(pause.style.top).toBe('240px');
    expect(pause.style.height).toBe('60px');
    // Grau ist nur vor 08:00 und nach 18:00 - die Pause ist keine Schraffur.
    const grau = screen.getAllByTestId('ausserhalb-arbeitszeit');
    expect(grau.map((g) => [g.style.top, g.style.height])).toEqual([
      ['0px', '60px'],
      ['660px', '60px'],
    ]);
  });

  it('verschiebt im Menü ohne Ziehen und führt zurück auf den Plan', async () => {
    const onPauseVerschieben = vi.fn();
    zeichnen(SPALTE, onPauseVerschieben);
    await userEvent.click(screen.getByTestId('pause'));
    const menue = screen.getByTestId('pausen-menue');
    expect(menue).toHaveTextContent('Im Plan ab 12:00');

    await userEvent.click(within(menue).getByRole('button', { name: '15 Min. später' }));
    expect(onPauseVerschieben).toHaveBeenLastCalledWith({
      herkunftSpalteId: 'st-1',
      spalteId: 'st-1',
      planVonMinute: 720,
      vonMinute: 675,
    });
    expect(screen.queryByTestId('pausen-menue')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('pause'));
    await userEvent.click(screen.getByRole('button', { name: 'Wie im Plan' }));
    expect(onPauseVerschieben).toHaveBeenLastCalledWith(
      expect.objectContaining({ vonMinute: 720 }),
    );
  });

  it('zeigt fremde Pausen nur an', async () => {
    zeichnen({ ...SPALTE, pausen: SPALTE.pausen!.map((p) => ({ ...p, ziehbar: false })) });
    await userEvent.click(screen.getByTestId('pause'));
    const menue = screen.getByTestId('pausen-menue');
    expect(within(menue).queryByRole('button', { name: /früher|später|Plan/ })).toBeNull();
    expect(within(menue).getByRole('button', { name: 'Schließen' })).toBeInTheDocument();
  });

  it('sagt mit Zeichen und Wort, was an der Pause nicht stimmt', async () => {
    zeichnen({ ...SPALTE, pausenProbleme: ['ueberlagert'] });
    const pause = screen.getByTestId('pause');
    expect(pause).toHaveClass('border-warnung');
    expect(pause).toHaveTextContent('! Pause');
    expect(pause).toHaveTextContent('Ein Termin liegt in der Pause.');
    await userEvent.click(pause);
    expect(screen.getByTestId('pausen-menue')).toHaveTextContent('Ein Termin liegt in der Pause.');
  });
});
