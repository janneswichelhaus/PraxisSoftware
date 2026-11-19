import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Radauswahl } from '@/components/ui/Lastenrad3D';
import { Bauteilrad } from './Bauteilrad';
import type { Stelle } from './stellen';

// Die Ansicht selbst prüft ihr eigener Test; hier zählt, was das Rad der Seite an Angaben bekommt.
let auswahl: Radauswahl;
vi.mock('@/components/ui/Lastenrad3D', () => ({
  Lastenrad3D: (angaben: { auswahl: Radauswahl }) => {
    auswahl = angaben.auswahl;
    return <div data-testid="rad" />;
  },
}));

const stelle = (zone: string, severity: Stelle['severity']): Stelle => ({
  key: zone,
  zone,
  severity,
  note: '',
  fotos: [],
});

describe('Bauteilrad', () => {
  const onWahl = vi.fn();
  beforeEach(() => onWahl.mockReset());

  it('wählt am ganzen Rad sofort, wenn unter dem Finger nur ein Bauteil liegt', () => {
    render(<Bauteilrad stellen={[]} entwurf={null} onWahl={onWahl} />);
    act(() => auswahl.onWahl(['transportbox']));
    expect(onWahl).toHaveBeenCalledWith('transportbox');
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('stellt mehrere Bauteile unter dem Finger als Knöpfe zur Wahl, höchstens vier', async () => {
    const nutzer = userEvent.setup();
    render(<Bauteilrad stellen={[]} entwurf={null} onWahl={onWahl} />);
    act(() =>
      auswahl.onWahl(['reifen-hinten', 'bremse-hinten', 'riemen', 'nabenschaltung', 'rahmen']),
    );
    expect(onWahl).not.toHaveBeenCalled();
    const knoepfe = within(
      screen.getByRole('group', { name: 'Bauteile an der getippten Stelle' }),
    ).getAllByRole('button');
    expect(knoepfe.map((knopf) => knopf.textContent)).toEqual([
      'Reifen hinten',
      'Bremse hinten',
      'Riemen und Riemenscheiben',
      'Nabenschaltung',
    ]);
    await nutzer.click(knoepfe[1]!);
    expect(onWahl).toHaveBeenCalledWith('bremse-hinten');
  });

  it('nimmt im Ausschnitt das getroffene Bauteil: Die Knöpfe der Seite stehen darunter', () => {
    render(
      <Bauteilrad
        waehlbar={['riemen', 'nabenschaltung', 'kurbeln', 'motor']}
        stellen={[]}
        entwurf={null}
        onWahl={onWahl}
      />,
    );
    act(() => auswahl.onWahl(['kurbeln', 'motor', 'riemen']));
    expect(onWahl).toHaveBeenCalledWith('kurbeln');
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('nennt jede Marke in Zeichen und Wort und lässt im Ausschnitt fremde Stellen weg', () => {
    const stellen = [stelle('bremsgriffe', 'beobachten'), stelle('motor', 'problem')];
    const { rerender } = render(<Bauteilrad stellen={stellen} entwurf={null} onWahl={onWahl} />);
    expect(auswahl.marken).toEqual([
      { gruppe: 'bremsgriffe', ton: 'achtung' },
      { gruppe: 'motor', ton: 'kritisch' },
    ]);
    const legende = screen.getByRole('list', { name: 'Am Rad markiert' });
    expect(
      within(legende)
        .getAllByRole('listitem')
        .map((zeile) => zeile.textContent),
    ).toEqual(['! Beobachten · Bremsgriffe', '× Problem · Motor']);

    rerender(
      <Bauteilrad
        waehlbar={['riemen', 'nabenschaltung', 'kurbeln', 'motor']}
        stellen={stellen}
        entwurf={null}
        onWahl={onWahl}
      />,
    );
    expect(auswahl.marken).toEqual([{ gruppe: 'motor', ton: 'kritisch' }]);
    expect(screen.getByRole('list', { name: 'Am Rad markiert' })).toHaveTextContent(
      /^× Problem · Motor$/,
    );
  });

  it('zeigt ohne Legende nur das Rad, wenn die Seite die Stellen selbst nennt', () => {
    render(
      <Bauteilrad
        stellen={[stelle('transportbox', 'problem')]}
        entwurf={null}
        legende={false}
        onWahl={onWahl}
      />,
    );
    expect(auswahl.marken).toEqual([{ gruppe: 'transportbox', ton: 'kritisch' }]);
    expect(screen.queryByRole('list')).toBeNull();
  });
});
