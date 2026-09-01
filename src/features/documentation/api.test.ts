import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const {
  MAX_ZEICHEN,
  createTreatmentNote,
  fetchTreatmentNote,
  inhaltFehler,
  istZwischenzeitlichGeaendert,
  updateTreatmentNote,
} = await import('./api');

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const DOKU_ID = '99999999-9999-4999-8999-000000000001';
const STAND = '2027-05-12T08:30:00.654321+00:00';

const zeile = {
  id: DOKU_ID,
  appointment_id: TERMIN_ID,
  status: 'draft',
  content: 'Synthetischer Testinhalt.',
  created_at: '2027-05-12T08:10:00.123456+00:00',
  updated_at: STAND,
  author_name: 'Anna Beispiel',
  last_editor_name: null,
};

describe('inhaltFehler', () => {
  it('nimmt einen normalen Eintrag an', () => {
    expect(inhaltFehler('Synthetischer Testinhalt.')).toBeUndefined();
  });

  it('weist einen leeren Eintrag ab', () => {
    expect(inhaltFehler('')).toBe('Die Behandlungsdokumentation darf nicht leer sein.');
  });

  it('weist Leerzeichen und Zeilenumbrueche als leer ab', () => {
    // Genau dieser Fall ist serverseitig eine eigene Pruefung: btrim entfernt
    // ohne Zeichenmenge nur Leerzeichen.
    expect(inhaltFehler('   \n\t  ')).toBe('Die Behandlungsdokumentation darf nicht leer sein.');
  });

  it('weist einen zu langen Eintrag ab', () => {
    expect(inhaltFehler('x'.repeat(MAX_ZEICHEN))).toBeUndefined();
    expect(inhaltFehler('x'.repeat(MAX_ZEICHEN + 1))).toMatch(/Höchstens/);
  });
});

describe('fetchTreatmentNote', () => {
  beforeEach(() => rpc.mockReset());

  it('liefert null, wenn es zum Termin keine Dokumentation gibt', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(fetchTreatmentNote(TERMIN_ID)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith('get_treatment_note', { p_appointment_id: TERMIN_ID });
  });

  it('liefert die erste Zeile als Dokumentation', async () => {
    rpc.mockResolvedValue({ data: [zeile], error: null });
    await expect(fetchTreatmentNote(TERMIN_ID)).resolves.toMatchObject({
      id: DOKU_ID,
      status: 'draft',
      updated_at: STAND,
    });
  });

  it('nennt bei einem Fehler keine internen Einzelheiten', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for table x' } });
    await expect(fetchTreatmentNote(TERMIN_ID)).rejects.toThrow(
      'Die Behandlungsdokumentation konnte nicht geladen werden.',
    );
  });
});

describe('createTreatmentNote', () => {
  beforeEach(() => rpc.mockReset());

  it('uebergibt Termin und Inhalt und liefert die neue ID', async () => {
    rpc.mockResolvedValue({ data: DOKU_ID, error: null });
    await expect(createTreatmentNote(TERMIN_ID, 'Neuer Eintrag.')).resolves.toBe(DOKU_ID);
    expect(rpc).toHaveBeenCalledWith('create_treatment_note', {
      p_appointment_id: TERMIN_ID,
      p_content: 'Neuer Eintrag.',
    });
  });

  it('erklaert eine bereits vorhandene Dokumentation', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'treatment note already exists' } });
    await expect(createTreatmentNote(TERMIN_ID, 'x')).rejects.toThrow(/bereits eine/);
  });

  it('erklaert einen abgesagten Termin', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'cancelled appointment cannot be documented' },
    });
    await expect(createTreatmentNote(TERMIN_ID, 'x')).rejects.toThrow(/abgesagten Termin/);
  });

  it('gibt eine unbekannte Datenbankmeldung nicht nach aussen', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function create_treatment_note' },
    });
    await expect(createTreatmentNote(TERMIN_ID, 'x')).rejects.toThrow(
      'Die Behandlungsdokumentation konnte nicht angelegt werden.',
    );
  });
});

describe('updateTreatmentNote', () => {
  beforeEach(() => rpc.mockReset());

  it('gibt den gelesenen Stand unveraendert zurueck', async () => {
    rpc.mockResolvedValue({ data: DOKU_ID, error: null });
    await updateTreatmentNote(DOKU_ID, STAND, 'Geaenderter Eintrag.');
    expect(rpc).toHaveBeenCalledWith('update_treatment_note', {
      p_note_id: DOKU_ID,
      // Bruchteile von Sekunden bleiben erhalten - sonst schlaegt die
      // Konflikterkennung fehl (ADR-001).
      p_expected_updated_at: STAND,
      p_content: 'Geaenderter Eintrag.',
    });
  });

  it('meldet einen Konflikt als eigenen Fehlertyp', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'treatment note was changed meanwhile' },
    });
    const fehler = await updateTreatmentNote(DOKU_ID, STAND, 'x').catch((e: Error) => e);
    expect(istZwischenzeitlichGeaendert(fehler)).toBe(true);
    expect((fehler as Error).message).toMatch(/zwischenzeitlich/);
  });

  it('unterscheidet einen Konflikt von einem sonstigen Fehler', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'irgendwas anderes' } });
    const fehler = await updateTreatmentNote(DOKU_ID, STAND, 'x').catch((e: Error) => e);
    expect(istZwischenzeitlichGeaendert(fehler)).toBe(false);
    expect((fehler as Error).message).toBe(
      'Die Behandlungsdokumentation konnte nicht gespeichert werden.',
    );
  });
});
