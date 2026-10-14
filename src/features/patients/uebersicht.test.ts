import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const {
  fetchPatientOverview,
  leseSortierung,
  leseZeigen,
  merkmal,
  passtZuZeigen,
  passtZurSuche,
  sortieren,
  zeigenWahlen,
} = await import('./uebersicht');
type Eintrag = Awaited<ReturnType<typeof fetchPatientOverview>>[number];

function eintrag(overrides: Partial<Eintrag> = {}): Eintrag {
  return {
    id: 'p1',
    given_name: 'Max',
    family_name: 'Mustermann',
    date_of_birth: null,
    email: null,
    phone: null,
    postal_code: null,
    city: null,
    last_visit_on: null,
    next_appointment_at: null,
    open_bases: 0,
    bases_need_appointments: 0,
    bases_need_followup: 0,
    bases_ready: 0,
    bases_in_billing: 0,
    billing_visible: false,
    invoices_issued: null,
    invoices_paid: null,
    outstanding_cents: null,
    invoices_overdue: null,
    reminders_due: null,
    ...overrides,
  };
}

describe('fetchPatientOverview (B1, B10)', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('liest die Liste als einen Wert über die eine Serverfunktion', async () => {
    rpc.mockResolvedValue({ data: [eintrag()], error: null });

    const liste = await fetchPatientOverview();

    expect(rpc).toHaveBeenCalledWith('list_patient_overview');
    expect(liste).toHaveLength(1);
  });

  it('meldet einen Fehler ohne technische Einzelheiten', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function' } });

    await expect(fetchPatientOverview()).rejects.toThrow(
      'Die Patientenliste konnte nicht geladen werden.',
    );
  });

  it('weist eine Antwort ohne die Pflichtfelder ab, statt sie still zu zeigen', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'p1' }], error: null });

    await expect(fetchPatientOverview()).rejects.toThrow();
  });
});

describe('Sortierung, Auswahl und Merkmal', () => {
  it('liest nur bekannte Werte aus der Adresse', () => {
    expect(leseSortierung('name')).toBe('name');
    expect(leseSortierung('verordnung')).toBe('verordnung');
    expect(leseSortierung('quer')).toBe('zuletzt');
    expect(leseSortierung(null)).toBe('zuletzt');
    expect(leseZeigen('mahnen')).toBe('mahnen');
    expect(leseZeigen('inactive')).toBeNull();
  });

  it('sortiert gleiche Tage und gleiche Ränge nach dem Namen', () => {
    const liste = [
      eintrag({ id: 'b', family_name: 'Zander', last_visit_on: '2026-10-01' }),
      eintrag({ id: 'a', family_name: 'Adler', last_visit_on: '2026-10-01' }),
    ];
    expect(sortieren(liste, 'zuletzt').map((e) => e.id)).toEqual(['a', 'b']);
    expect(sortieren(liste, 'verordnung').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('nennt an der Zeile das Dringendste zuerst', () => {
    expect(merkmal(eintrag({ reminders_due: 1, bases_ready: 1 }))?.text).toBe('Zu mahnen');
    expect(merkmal(eintrag({ bases_ready: 1, bases_need_followup: 1 }))?.text).toBe('Abrechnen');
    expect(merkmal(eintrag({ bases_need_followup: 1, bases_need_appointments: 1 }))?.text).toBe(
      'Haken oder Doku fehlt',
    );
    expect(merkmal(eintrag({ bases_need_appointments: 1 }))?.text).toBe('Termine fehlen');
    expect(merkmal(eintrag({ bases_in_billing: 1 }))).toEqual({
      ton: 'neutral',
      text: 'In der Abrechnung',
    });
    expect(merkmal(eintrag())).toBeNull();
  });

  it('bietet Geld nur an, wenn der Server es geliefert hat (ANN-139)', () => {
    const ohne = [eintrag({ outstanding_cents: null, reminders_due: null })];
    expect(zeigenWahlen(ohne)).toEqual([]);
    const mit = [eintrag({ billing_visible: true, outstanding_cents: 500, reminders_due: 1 })];
    expect(zeigenWahlen(mit).map((w) => w.wert)).toEqual(['mahnen', 'offen']);
    expect(passtZuZeigen(mit[0]!, 'offen')).toBe(true);
    expect(passtZuZeigen(ohne[0]!, 'offen')).toBe(false);
  });

  it('sucht ab dem ersten Zeichen (B10)', () => {
    const max = eintrag({ city: 'Köln' });
    expect(passtZurSuche(max, 'k')).toBe(true);
    expect(passtZurSuche(max, 'q')).toBe(false);
    expect(passtZurSuche(max, '')).toBe(true);
  });
});
