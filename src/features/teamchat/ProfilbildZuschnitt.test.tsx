import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { startStand, type Foto } from './profilbild';
import { ProfilbildZuschnitt } from './ProfilbildZuschnitt';

/**
 * Den Ausschnitt eines Profilbilds wählen (BEF-190, ADR-017
 * Fassung 11): ziehen, Pfeiltasten und Regler ändern den Stand; das Quadrat
 * bleibt im Foto.
 */

const FOTO: Foto = { bild: {} as HTMLImageElement, adresse: 'blob:foto', breite: 1024, hoehe: 768 };

function zeige(stand = startStand(FOTO.breite, FOTO.hoehe)) {
  const onStand = vi.fn();
  renderWithProviders(<ProfilbildZuschnitt foto={FOTO} stand={stand} onStand={onStand} />);
  return onStand;
}

describe('ProfilbildZuschnitt', () => {
  it('zeigt das Foto so, dass der Ausschnitt die Ansicht füllt', () => {
    zeige();
    const bild = document.querySelector('[data-zuschnitt] img') as HTMLImageElement;
    // 768 Bildpunkte Seite auf 256 Pixel: ein Drittel, mittig verschoben.
    expect(bild.style.width).toBe(`${1024 / 3}px`);
    expect(bild.style.transform).toBe(`translate(${-128 / 3}px, 0px)`);
  });

  it('verschiebt mit den Pfeiltasten und hält das Quadrat im Foto', () => {
    const onStand = zeige();
    const ansicht = screen.getByRole('img', { name: /Ausschnitt des Profilbilds/ });
    fireEvent.keyDown(ansicht, { key: 'ArrowRight' });
    // 16 Pixel der Ansicht sind 48 Bildpunkte: die Mitte wandert nach rechts.
    expect(onStand).toHaveBeenLastCalledWith({ mitteX: 560, mitteY: 384, vergroesserung: 1 });
    fireEvent.keyDown(ansicht, { key: 'ArrowUp' });
    // Senkrecht ist kein Platz: Das Quadrat ist so hoch wie das Foto.
    expect(onStand).toHaveBeenLastCalledWith({ mitteX: 512, mitteY: 384, vergroesserung: 1 });
  });

  it('verschiebt beim Ziehen entgegen der Hand', () => {
    const onStand = zeige({ mitteX: 512, mitteY: 384, vergroesserung: 2 });
    const ansicht = screen.getByRole('img', { name: /Ausschnitt des Profilbilds/ });
    ansicht.setPointerCapture = vi.fn();
    fireEvent.pointerDown(ansicht, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(ansicht, { pointerId: 1, clientX: 132, clientY: 100 });
    // Bild nach rechts gezogen: Links kommt ins Quadrat, die Mitte geht nach links.
    expect(onStand).toHaveBeenLastCalledWith({ mitteX: 464, mitteY: 384, vergroesserung: 2 });
  });

  it('vergrößert mit Regler und Knöpfen, höchstens dreifach', async () => {
    const user = userEvent.setup();
    const onStand = zeige();
    expect(screen.getByRole('button', { name: 'Weniger vergrößern' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Mehr vergrößern' }));
    expect(onStand).toHaveBeenLastCalledWith(expect.objectContaining({ vergroesserung: 1.25 }));
    fireEvent.change(screen.getByRole('slider', { name: 'Vergrößern' }), {
      target: { value: '3' },
    });
    expect(onStand).toHaveBeenLastCalledWith(expect.objectContaining({ vergroesserung: 3 }));
  });

  it('ist barrierefrei', async () => {
    zeige();
    await pruefeBarrierefreiheit(document.body);
  });
});
