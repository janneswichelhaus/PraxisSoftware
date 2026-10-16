import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hervorhebung } from './Hervorhebung';

describe('Hervorhebung (ANN-567)', () => {
  it('setzt den getippten Teil fett, ohne den Text zu ändern', () => {
    const { container } = render(
      <p>
        <Hervorhebung text="Kalender" suche="kal" />
      </p>,
    );
    expect(container.textContent).toBe('Kalender');
    expect(container.querySelector('[data-treffer]')?.textContent).toBe('Kal');
  });

  it('lässt den Text ohne Treffer und ohne Suche, wie er ist', () => {
    const ohneTreffer = render(
      <p>
        <Hervorhebung text="Kalender" suche="xyz" />
      </p>,
    );
    expect(ohneTreffer.container.querySelector('[data-treffer]')).toBeNull();
    const ohneSuche = render(
      <p>
        <Hervorhebung text="Kalender" suche="  " />
      </p>,
    );
    expect(ohneSuche.container.querySelector('[data-treffer]')).toBeNull();
    expect(ohneSuche.container.textContent).toBe('Kalender');
  });
});
