import { describe, expect, it } from 'vitest';
import {
  leereStammdaten,
  sindTermineOffen,
  staffMasterDataSchema,
  staffToFormValues,
  OffeneTermineError,
  type StaffMember,
} from './api';

const anna: StaffMember = {
  id: '55555555-5555-4555-8555-000000000002',
  person_id: '44444444-4444-4444-8444-000000000002',
  given_name: 'Anna',
  family_name: 'Beispiel',
  employment_status: 'active',
  work_email: 'anna.beispiel@praxis.invalid',
  work_phone: null,
  primary_location_id: null,
  primary_location_name: null,
  date_of_birth: null,
  private_email: null,
  private_phone: null,
  street: null,
  postal_code: null,
  city: null,
};

describe('staffMasterDataSchema', () => {
  it('macht aus leeren Optionalfeldern null statt eines leeren Textes', () => {
    const ergebnis = staffMasterDataSchema.safeParse({
      ...leereStammdaten,
      given_name: 'Nina',
      family_name: 'Neu',
      work_phone: '   ',
    });
    expect(ergebnis.success).toBe(true);
    expect(ergebnis.success && ergebnis.data.work_phone).toBeNull();
    expect(ergebnis.success && ergebnis.data.primary_location_id).toBeNull();
  });

  it('entfernt umschliessende Leerzeichen aus dem Namen', () => {
    const ergebnis = staffMasterDataSchema.safeParse({
      ...leereStammdaten,
      given_name: '  Nina  ',
      family_name: '  Neu  ',
    });
    expect(ergebnis.success && ergebnis.data.given_name).toBe('Nina');
    expect(ergebnis.success && ergebnis.data.family_name).toBe('Neu');
  });

  it('verlangt Vor- und Nachname', () => {
    const ergebnis = staffMasterDataSchema.safeParse({ ...leereStammdaten });
    expect(ergebnis.success).toBe(false);
    const felder = ergebnis.success ? [] : ergebnis.error.issues.map((i) => i.path[0]);
    expect(felder).toContain('given_name');
    expect(felder).toContain('family_name');
  });

  it.each([['dienstlich', 'work_email'] as const, ['privat', 'private_email'] as const])(
    'weist eine unbrauchbare %se E-Mail-Adresse ab',
    (_bezeichnung, feld) => {
      const ergebnis = staffMasterDataSchema.safeParse({
        ...leereStammdaten,
        given_name: 'Nina',
        family_name: 'Neu',
        [feld]: 'keine-adresse',
      });
      expect(ergebnis.success).toBe(false);
    },
  );

  it('laesst ein Geburtsdatum weg, statt es zu erfinden', () => {
    // Anders als beim Patienten ist das Geburtsdatum hier freiwillig: es ist
    // ein Beschaeftigtendatum und wird nur erhoben, wenn es gebraucht wird.
    const ergebnis = staffMasterDataSchema.safeParse({
      ...leereStammdaten,
      given_name: 'Nina',
      family_name: 'Neu',
    });
    expect(ergebnis.success && ergebnis.data.date_of_birth).toBeNull();
  });
});

describe('staffToFormValues', () => {
  it('fuellt fehlende Werte als leeren Text, nicht als "null"', () => {
    const werte = staffToFormValues(anna);
    expect(werte.work_phone).toBe('');
    expect(werte.date_of_birth).toBe('');
    expect(werte.work_email).toBe('anna.beispiel@praxis.invalid');
  });
});

describe('sindTermineOffen', () => {
  it('erkennt die Rueckfrage des Servers', () => {
    expect(sindTermineOffen(new OffeneTermineError())).toBe(true);
  });

  it('haelt einen gewoehnlichen Fehler nicht faelschlich fuer eine Rueckfrage', () => {
    expect(sindTermineOffen(new Error('irgendetwas'))).toBe(false);
    expect(sindTermineOffen(null)).toBe(false);
  });
});
