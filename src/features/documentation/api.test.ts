import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const {
  MAX_BEGRUENDUNG,
  MAX_ZEICHEN,
  begruendungFehler,
  createTreatmentNote,
  createTreatmentNoteAddendum,
  fetchTreatmentDocumentation,
  fetchTreatmentNoteVersions,
  finalizeTreatmentNote,
  findeEintrag,
  inhaltFehler,
  istZwischenzeitlichGeaendert,
  reviseTreatmentNote,
  updateTreatmentNote,
} = await import('./api');

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const DOKU_ID = '99999999-9999-4999-8999-000000000001';
const NACHTRAG_ID = '99999999-9999-4999-8999-000000000002';
const STAND = '2027-05-12T08:30:00.654321+00:00';

const zeile = {
  id: DOKU_ID,
  appointment_id: TERMIN_ID,
  addendum_to_note_id: null,
  status: 'draft',
  content: 'Synthetischer Testinhalt.',
  created_at: '2027-05-12T08:10:00.123456+00:00',
  updated_at: STAND,
  finalized_at: null,
  version_count: 0,
  author_name: 'Anna Beispiel',
  last_editor_name: null,
  finalized_by_name: null,
};

const nachtragZeile = {
  ...zeile,
  id: NACHTRAG_ID,
  addendum_to_note_id: DOKU_ID,
  content: 'Synthetisch: nachgereicht.',
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

describe('begruendungFehler', () => {
  it('nimmt eine kurze Begruendung an', () => {
    expect(begruendungFehler('Zahlendreher.')).toBeUndefined();
  });

  it('weist eine fehlende Begruendung ab (ADR-016 Punkt 6)', () => {
    expect(begruendungFehler('  \n ')).toBe('Bitte kurz begründen, was korrigiert wird.');
  });

  it('weist eine zu lange Begruendung ab', () => {
    expect(begruendungFehler('x'.repeat(MAX_BEGRUENDUNG))).toBeUndefined();
    expect(begruendungFehler('x'.repeat(MAX_BEGRUENDUNG + 1))).toMatch(/Höchstens/);
  });
});

describe('fetchTreatmentDocumentation', () => {
  beforeEach(() => rpc.mockReset());

  it('liefert nichts, wenn es zum Termin keine Dokumentation gibt', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(fetchTreatmentDocumentation(TERMIN_ID)).resolves.toEqual({
      primary: null,
      addenda: [],
    });
    expect(rpc).toHaveBeenCalledWith('get_treatment_note', { p_appointment_id: TERMIN_ID });
  });

  it('trennt Haupteintrag und Nachtraege (ADR-016 Punkt 6)', async () => {
    rpc.mockResolvedValue({ data: [zeile, nachtragZeile], error: null });
    const doku = await fetchTreatmentDocumentation(TERMIN_ID);

    expect(doku.primary).toMatchObject({ id: DOKU_ID, updated_at: STAND });
    expect(doku.addenda.map((n) => n.id)).toEqual([NACHTRAG_ID]);
  });

  it('nennt bei einem Fehler keine internen Einzelheiten', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for table x' } });
    await expect(fetchTreatmentDocumentation(TERMIN_ID)).rejects.toThrow(
      'Die Behandlungsdokumentation konnte nicht geladen werden.',
    );
  });
});

describe('findeEintrag', () => {
  const doku = {
    primary: { ...zeile } as never,
    addenda: [{ ...nachtragZeile } as never],
  };

  it('findet den Haupteintrag', () => {
    expect(findeEintrag(doku, DOKU_ID)).toMatchObject({ id: DOKU_ID });
  });

  it('findet einen Nachtrag', () => {
    expect(findeEintrag(doku, NACHTRAG_ID)).toMatchObject({ id: NACHTRAG_ID });
  });

  it('liefert null fuer einen fremden Eintrag', () => {
    expect(findeEintrag(doku, '11111111-1111-4111-8111-000000000009')).toBeNull();
    expect(findeEintrag(doku, undefined)).toBeNull();
  });
});

describe('fetchTreatmentNoteVersions', () => {
  beforeEach(() => rpc.mockReset());

  it('liefert die Versionen in der Reihenfolge des Servers', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          version_no: 1,
          content: 'Erste Fassung.',
          change_reason: null,
          recorded_at: STAND,
          author_name: 'Anna Beispiel',
        },
        {
          version_no: 2,
          content: 'Zweite Fassung.',
          change_reason: 'Zahlendreher.',
          recorded_at: STAND,
          author_name: 'Tim Teamleitung',
        },
      ],
      error: null,
    });

    const versionen = await fetchTreatmentNoteVersions(DOKU_ID);
    expect(versionen.map((v) => v.version_no)).toEqual([1, 2]);
    expect(versionen[1]?.change_reason).toBe('Zahlendreher.');
    expect(rpc).toHaveBeenCalledWith('get_treatment_note_versions', { p_note_id: DOKU_ID });
  });

  it('nennt bei einem Fehler keine internen Einzelheiten', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for table x' } });
    await expect(fetchTreatmentNoteVersions(DOKU_ID)).rejects.toThrow(
      'Der Änderungsverlauf konnte nicht geladen werden.',
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

  it('erklaert den verschlossenen Entwurfsweg bei einem finalisierten Eintrag', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'finalized treatment note requires a revision' },
    });
    await expect(updateTreatmentNote(DOKU_ID, STAND, 'x')).rejects.toThrow(
      /nur als Korrektur mit Begründung/,
    );
  });
});

describe('finalizeTreatmentNote', () => {
  beforeEach(() => rpc.mockReset());

  it('uebergibt den gelesenen Stand unveraendert', async () => {
    rpc.mockResolvedValue({ data: DOKU_ID, error: null });
    await finalizeTreatmentNote(DOKU_ID, STAND);
    expect(rpc).toHaveBeenCalledWith('finalize_treatment_note', {
      p_note_id: DOKU_ID,
      p_expected_updated_at: STAND,
    });
  });

  it('meldet einen Konflikt als eigenen Fehlertyp', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'treatment note was changed meanwhile' },
    });
    const fehler = await finalizeTreatmentNote(DOKU_ID, STAND).catch((e: Error) => e);
    expect(istZwischenzeitlichGeaendert(fehler)).toBe(true);
  });

  it('erklaert eine bereits finalisierte Dokumentation', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'treatment note is already final' } });
    await expect(finalizeTreatmentNote(DOKU_ID, STAND)).rejects.toThrow(/bereits finalisiert/);
  });

  it('gibt eine unbekannte Datenbankmeldung nicht nach aussen', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function finalize_treatment_note' },
    });
    await expect(finalizeTreatmentNote(DOKU_ID, STAND)).rejects.toThrow(
      'Die Behandlungsdokumentation konnte nicht finalisiert werden.',
    );
  });
});

describe('reviseTreatmentNote', () => {
  beforeEach(() => rpc.mockReset());

  it('uebergibt Stand, Inhalt und Begruendung', async () => {
    rpc.mockResolvedValue({ data: DOKU_ID, error: null });
    await reviseTreatmentNote(DOKU_ID, STAND, 'Korrigiert.', 'Zahlendreher.');
    expect(rpc).toHaveBeenCalledWith('revise_treatment_note', {
      p_note_id: DOKU_ID,
      p_expected_updated_at: STAND,
      p_content: 'Korrigiert.',
      p_reason: 'Zahlendreher.',
    });
  });

  it('erklaert eine fehlende Begruendung', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'change reason is required' } });
    await expect(reviseTreatmentNote(DOKU_ID, STAND, 'x', '')).rejects.toThrow(/Begründung/);
  });

  it('erklaert eine Korrektur ohne Aenderung', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'documentation is unchanged' } });
    await expect(reviseTreatmentNote(DOKU_ID, STAND, 'x', 'y')).rejects.toThrow(/unverändert/);
  });

  it('erklaert eine Korrektur an einem Entwurf', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'treatment note is not final' } });
    await expect(reviseTreatmentNote(DOKU_ID, STAND, 'x', 'y')).rejects.toThrow(/noch ein Entwurf/);
  });

  it('gibt eine unbekannte Datenbankmeldung nicht nach aussen', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'relation does not exist' } });
    await expect(reviseTreatmentNote(DOKU_ID, STAND, 'x', 'y')).rejects.toThrow(
      'Die Korrektur konnte nicht gespeichert werden.',
    );
  });
});

describe('createTreatmentNoteAddendum', () => {
  beforeEach(() => rpc.mockReset());

  it('uebergibt Ursprungseintrag und Inhalt und liefert die neue ID', async () => {
    rpc.mockResolvedValue({ data: NACHTRAG_ID, error: null });
    await expect(createTreatmentNoteAddendum(DOKU_ID, 'Nachgereicht.')).resolves.toBe(NACHTRAG_ID);
    expect(rpc).toHaveBeenCalledWith('create_treatment_note_addendum', {
      p_parent_note_id: DOKU_ID,
      p_content: 'Nachgereicht.',
    });
  });

  it('erklaert einen Nachtrag zum Nachtrag', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'addendum cannot be extended' } });
    await expect(createTreatmentNoteAddendum(NACHTRAG_ID, 'x')).rejects.toThrow(
      /ursprünglichen Eintrag/,
    );
  });

  it('gibt eine unbekannte Datenbankmeldung nicht nach aussen', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(createTreatmentNoteAddendum(DOKU_ID, 'x')).rejects.toThrow(
      'Der Nachtrag konnte nicht angelegt werden.',
    );
  });
});
