import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MARKE_MINDESTHOEHE, schutzraum } from './markeRegeln';
import { Wortmarke } from './Wortmarke';

/**
 * Die Regeln aus `marke/README.md`, soweit sie maschinell prüfbar sind.
 * Mindestgröße und Verbote sind dort verbindlich; ohne Test wären sie eine
 * Absichtserklärung im Kommentar.
 */
describe('Wortmarke', () => {
  it('zeigt die Datei aus der Marke und traegt den Namen als Alternativtext', () => {
    render(<Wortmarke />);
    const bild = screen.getByRole('img', { name: 'Own Motion' });
    expect(bild).toHaveAttribute('src', '/marke/own-motion-block-farbig.svg');
  });

  it('haelt das Seitenverhaeltnis der Marke ein - kein Dehnen', () => {
    render(<Wortmarke hoehe={40} />);
    const bild = screen.getByRole('img', { name: 'Own Motion' });
    // 5330.93 x 2035.73 aus marke/README.md -> 40 px hoch sind 105 px breit.
    expect(bild).toHaveAttribute('height', '40');
    expect(bild).toHaveAttribute('width', '105');
  });

  it('verweigert eine Hoehe unter der Mindestgroesse', () => {
    // 16 px waere die Groesse, in der die zweizeilige Marke auseinanderfaellt.
    expect(() => render(<Wortmarke hoehe={16} />)).toThrow(/Mindestgröße/);
  });

  it('laesst die Mindestgroesse selbst zu', () => {
    expect(() => render(<Wortmarke hoehe={MARKE_MINDESTHOEHE} />)).not.toThrow();
  });

  it('rechnet den Schutzraum als Hoehe der MOTION-Zeile aus', () => {
    // 731 von 2035.73 Einheiten des Pfadraums = 35,9 %.
    expect(schutzraum(24)).toBeCloseTo(8.62, 2);
    expect(schutzraum(40)).toBeCloseTo(14.36, 2);
  });

  it('faerbt die Marke nicht um - die Farbe steckt in der Datei', () => {
    const { container } = render(<Wortmarke className="text-danger" />);
    const bild = container.querySelector('img')!;
    // Ein Inline-SVG mit currentColor wuerde hier die Textfarbe annehmen.
    // Als Bilddatei kann es das nicht: kein fill im Markup, nichts zu erben.
    expect(bild.getAttribute('fill')).toBeNull();
    expect(bild.innerHTML).toBe('');
  });
});
