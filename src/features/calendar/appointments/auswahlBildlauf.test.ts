import { describe, expect, it } from 'vitest';
import { auswahlBildlauf } from './auswahlBildlauf';

describe('auswahlBildlauf (Runde 3)', () => {
  it('rollt nicht, wenn die Auswahl frei über der Leiste steht', () => {
    expect(auswahlBildlauf({ auswahlOben: 200, auswahlUnten: 230, leisteOben: 500 })).toBe(0);
  });

  it('rollt eine verdeckte Auswahl ins obere Drittel über der Leiste', () => {
    // Leiste ab 540: Das obere Drittel des freien Bereichs beginnt bei 180.
    expect(auswahlBildlauf({ auswahlOben: 560, auswahlUnten: 590, leisteOben: 540 })).toBe(380);
  });

  it('rollt auch, wenn die Auswahl die Leiste nur anschneidet', () => {
    expect(auswahlBildlauf({ auswahlOben: 520, auswahlUnten: 545, leisteOben: 540 })).toBe(340);
  });

  it('holt eine Auswahl über dem Fenster zurück', () => {
    expect(auswahlBildlauf({ auswahlOben: -40, auswahlUnten: -10, leisteOben: 600 })).toBe(-240);
  });

  it('rollt ohne Layout nicht', () => {
    expect(auswahlBildlauf({ auswahlOben: 0, auswahlUnten: 0, leisteOben: 0 })).toBe(0);
  });
});
