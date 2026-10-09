import { describe, expect, it } from 'vitest';
import { einwilligungAngeboten } from './einwilligung';

describe('Einwilligung zu Fotos nur noch zum Widerruf (ANN-316)', () => {
  it('bietet sie nicht mehr an, zeigt eine erteilte aber zum Widerruf', () => {
    expect(einwilligungAngeboten('patient_photos', false)).toBe(false);
    expect(einwilligungAngeboten('patient_photos', true)).toBe(true);
  });

  it('lässt die übrigen Zwecke unberührt', () => {
    for (const zweck of ['email_contact', 'prescriber_report', 'training_health_data']) {
      expect(einwilligungAngeboten(zweck, false)).toBe(true);
    }
  });
});
