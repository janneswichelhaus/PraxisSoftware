import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Bauteilwahl } from './Bauteilwahl';
import { ZONE_KEYS } from './zones';

/** Das Bauteil als Auswahlliste der 27 (statt des 3D-Rads). */
describe('Bauteilwahl', () => {
  it('bietet alle Bauteile genau einmal, nach Prüfpunkt gruppiert', () => {
    const { container } = render(<Bauteilwahl label="Bauteil" wert="" onWahl={() => undefined} />);
    const gruppen = [...container.querySelectorAll('optgroup')];
    expect(gruppen.map((gruppe) => gruppe.label)).toEqual([
      'Reifen und Luftdruck',
      'Speichen',
      'Bremsen',
      'Riemen und Antrieb',
      'Schutzbleche',
      'Weitere Prüfpunkte',
      'Ohne Prüfpunkt',
    ]);
    const werte = gruppen.flatMap((gruppe) =>
      [...gruppe.querySelectorAll('option')].map((option) => option.value),
    );
    expect([...werte].sort()).toEqual([...ZONE_KEYS].sort());
    expect(
      within(gruppen[2]!)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Bremse vorne', 'Bremse hinten', 'Bremsgriffe']);
    expect(screen.getByRole('combobox', { name: 'Bauteil' })).toHaveValue('');
  });

  it('meldet die Wahl und trägt den Fokus der Seite', async () => {
    const nutzer = userEvent.setup();
    const onWahl = vi.fn();
    render(<Bauteilwahl label="Bauteil" wert="" onWahl={onWahl} autofokus />);
    const liste = screen.getByRole('combobox', { name: 'Bauteil' });
    expect(liste).toHaveAttribute('data-autofocus');
    await nutzer.selectOptions(liste, 'motor');
    expect(onWahl).toHaveBeenCalledWith('motor');
  });
});
