import { describe, expect, it } from 'vitest';
import { einwilligungAngeboten } from './einwilligung';

describe('Einwilligung zu Fotos nur noch zum Widerruf (ANN-316)', () => {
  it('bietet sie nicht mehr an, zeigt eine erteilte aber zum Widerruf', () => {
    expect(einwilligungAngeboten('patient_photos', false)).toBe(false);
    expect(einwilligungAngeboten('patient_photos', true)).toBe(true);
  });

  it('Fotos und Videos an Rückfragen: angeboten beim Anhängen, hier nur zum Widerruf (ANN-333)', () => {
    expect(einwilligungAngeboten('message_attachments', false)).toBe(false);
    expect(einwilligungAngeboten('message_attachments', true)).toBe(true);
  });

  it('lässt die übrigen Zwecke unberührt', () => {
    for (const zweck of ['email_contact', 'prescriber_report', 'training_health_data']) {
      expect(einwilligungAngeboten(zweck, false)).toBe(true);
    }
  });
});
