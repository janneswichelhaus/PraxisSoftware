import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from }),
}));

const { ageInYears, fetchPatients, fullName } = await import('./api');

describe('ageInYears', () => {
  const heute = new Date('2026-08-28T12:00:00');

  it('rechnet ein bereits gefeiertes Geburtsdatum korrekt', () => {
    expect(ageInYears('1990-01-15', heute)).toBe(36);
  });

  it('zieht ein noch nicht gefeiertes Geburtsdatum ab', () => {
    expect(ageInYears('1990-12-31', heute)).toBe(35);
  });

  it('behandelt den Geburtstag selbst als vollendetes Lebensjahr', () => {
    expect(ageInYears('1990-08-28', heute)).toBe(36);
  });

  it('gibt null zurueck, wenn kein Geburtsdatum vorliegt', () => {
    expect(ageInYears(null, heute)).toBeNull();
    expect(ageInYears('unsinn', heute)).toBeNull();
  });
});

describe('fullName', () => {
  it('setzt Vor- und Nachname zusammen', () => {
    expect(fullName({ given_name: 'Max', family_name: 'Mustermann' })).toBe('Max Mustermann');
  });

  it('gilt auch fuer einen Mitarbeiterdatensatz', () => {
    expect(fullName({ given_name: 'Anna', family_name: 'Beispiel' })).toBe('Anna Beispiel');
  });
});

describe('fetchPatients (R3-012)', () => {
  beforeEach(() => {
    from.mockReset();
  });

  it('liest die schlanke Listensicht und fragt keine Versorgungsangaben ab', async () => {
    // Die Liste zeigt Name, Alter, Ort und Status und sucht ueber Name, Ort,
    // Postleitzahl, Telefon und E-Mail. Alles andere - Versorgungsvermerk,
    // Hausbesuchszugang, Bemerkung, Strasse - hat im Browser nichts zu
    // suchen, schon gar nicht fuer jede Patientin der Praxis auf einmal.
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ order }));
    from.mockReturnValue({ select });

    await fetchPatients();

    expect(from).toHaveBeenCalledWith('patient_list_entries');

    const spalten = String(select.mock.calls[0]?.[0]);
    for (const feld of [
      'special_note',
      'home_visit_access_note',
      'remark',
      'street',
      'house_number',
      'primary_therapist',
      'institution',
      'fax',
    ]) {
      expect(spalten).not.toContain(feld);
    }

    // Was die Liste wirklich braucht, ist dabei.
    for (const feld of ['given_name', 'family_name', 'date_of_birth', 'postal_code', 'city']) {
      expect(spalten).toContain(feld);
    }
  });
});
