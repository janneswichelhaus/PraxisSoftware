import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * VER-002: Verordnungen in der Akte, rollenabhängig projiziert.
 *
 * Der Kern dieser Story ist die Trennung: `office` sieht das Kontingent, aber
 * nicht die Diagnose. Umgesetzt ist das als zwei Funktionen mit zwei
 * Rückgabetypen — nicht als eine Funktion mit genullten Spalten (ADR-004,
 * ANN-011). Die Tests prüfen beide Richtungen: dass die organisatorische Sicht
 * genügt und dass sie die klinischen Felder gar nicht erst führt.
 */
const { users, patients } = SEED;

const ORGANISATORISCH = 'select * from public.list_patient_prescriptions($1::uuid)';
const KLINISCH = 'select * from public.list_patient_prescriptions_clinical($1::uuid)';

const MAX_ERST = '88888888-8888-4888-8888-000000000001';
const MAX_FOLGE = '88888888-8888-4888-8888-000000000002';
const ERIKA_ERST = '88888888-8888-4888-8888-000000000003';
const UNBEKANNT = '66666666-6666-4666-8666-0000000000ff';

interface Item {
  id: string;
  sort_order: number;
  remedy: string;
  prescribed_quantity: number;
  used_quantity: number;
  remaining_quantity: number;
}

interface Zeile {
  id: string;
  prescriber_name: string;
  prescriber_practice_name: string | null;
  prescription_kind: string;
  issued_on: Date;
  frequency_note: string | null;
  note: string | null;
  items: Item[];
  diagnosis?: string | null;
  therapy_goal?: string | null;
  follow_up_recommendation?: string | null;
}

describe('VER-002: Verordnungen in der Akte', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('liefert office Kontingent und Verordner:in, neueste zuerst', async () => {
    const { rows } = await asUser<Zeile>(users.office, ORGANISATORISCH, [patients.max]);

    expect(rows.map((r) => r.id)).toEqual([MAX_FOLGE, MAX_ERST]);
    expect(rows[0]?.prescriber_name).toBe('Dr. med. Petra Probst');
    expect(rows[0]?.prescriber_practice_name).toBe('Orthopaedische Gemeinschaftspraxis Fiktiv');
    expect(rows[0]?.prescription_kind).toBe('follow_up');
    expect(rows[0]?.frequency_note).toBe('2x pro Woche');
    expect(rows[0]?.note).toBe('Rezept liegt im Ordner.');
  });

  it('fuehrt in der organisatorischen Sicht ueberhaupt keine klinischen Spalten', async () => {
    // Nicht "die Spalte ist null", sondern "die Spalte gibt es nicht": ein
    // genullter Datensatz waere ein Ausblenden im Client (ADR-004).
    const { rows } = await asPostgres<{ spalten: string[] }>(`
      select array_agg(t.name order by t.name) as spalten
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral unnest(p.proargnames) as t(name)
      where n.nspname = 'public' and p.proname = 'list_patient_prescriptions'
    `);
    const spalten = rows[0]?.spalten ?? [];
    for (const klinisch of [
      'diagnosis',
      'therapy_goal',
      'prescriber_note',
      'follow_up_recommendation',
    ]) {
      expect(spalten).not.toContain(klinisch);
    }
    expect(spalten).toContain('items');
  });

  it('rechnet die Restmenge und speichert sie nicht (ANN-012)', async () => {
    const { rows } = await asUser<Zeile>(users.office, ORGANISATORISCH, [patients.max]);
    const laufend = rows.find((r) => r.id === MAX_FOLGE)!;
    expect(laufend.items).toHaveLength(1);
    expect(laufend.items[0]).toMatchObject({
      sort_order: 1,
      remedy: 'Krankengymnastik',
      prescribed_quantity: 10,
      used_quantity: 7,
      remaining_quantity: 3,
    });
    expect(typeof laufend.items[0]?.id).toBe('string');

    const ausgeschoepft = rows.find((r) => r.id === MAX_ERST)!;
    expect(ausgeschoepft.items.map((i) => i.remaining_quantity)).toEqual([0, 0]);
    expect(ausgeschoepft.items.map((i) => i.sort_order)).toEqual([1, 2]);
  });

  it('liefert den therapeutischen Rollen zusaetzlich die klinischen Felder', async () => {
    for (const konto of [users.ownerTherapist, users.therapist, users.teamLead]) {
      const { rows } = await asUserCommitted<Zeile>(konto, KLINISCH, [patients.max]);
      expect(rows[0]?.diagnosis).toContain('Bewegungseinschraenkung');
      expect(rows[0]?.follow_up_recommendation).toContain('Folgeverordnung');
      expect(rows[1]?.therapy_goal).toBe('Schmerzfreie Beweglichkeit im Alltag.');
    }
  });

  it('weist office die klinische Sicht ab', async () => {
    await expect(asUser(users.office, KLINISCH, [patients.max])).rejects.toThrow(
      /not allowed to read clinical prescription data/i,
    );
  });

  it('weist ein Patientenkonto und anon beide Sichten ab', async () => {
    await expect(asUser(users.patientMax, ORGANISATORISCH, [patients.max])).rejects.toThrow(
      /not allowed to read prescriptions/i,
    );
    await expect(asUser(users.patientMax, KLINISCH, [patients.max])).rejects.toThrow(
      /not allowed to read clinical prescription data/i,
    );
    await expect(asAnon(ORGANISATORISCH, [patients.max])).rejects.toThrow(/permission denied/i);
  });

  it('protokolliert je gelesener Verordnung genau einen Zugriff (ADR-010)', async () => {
    await asPostgres("delete from public.audit_log where action = 'prescription.viewed'");
    await asUserCommitted(users.therapist, KLINISCH, [patients.erika]);

    const { rows } = await asPostgres<{
      subject_id: string;
      actor_user_id: string;
      context: Record<string, unknown>;
    }>(
      `select subject_id, actor_user_id, context from public.audit_log
        where action = 'prescription.viewed' and subject_type = 'prescription'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_id).toBe(ERIKA_ERST);
    expect(rows[0]?.actor_user_id).toBe(users.therapist);
    expect(rows[0]?.context).toMatchObject({ surface: 'web', patient_id: patients.erika });
    // Keine klinischen Inhalte im Auditlog (ADR-010 Punkt 3, ADR-011).
    expect(JSON.stringify(rows[0]?.context)).not.toMatch(/Nacken|Verspannung/i);
  });

  it('protokolliert die organisatorische Sicht nicht', async () => {
    await asPostgres("delete from public.audit_log where action = 'prescription.viewed'");
    await asUserCommitted(users.office, ORGANISATORISCH, [patients.max]);

    const { rows } = await asPostgres(
      "select id from public.audit_log where action = 'prescription.viewed'",
    );
    expect(rows).toEqual([]);
  });

  it('ist kein Orakel fuer unbekannte Patienten-IDs', async () => {
    const { rows } = await asUser(users.office, ORGANISATORISCH, [UNBEKANNT]);
    expect(rows).toEqual([]);

    // Petra Platzhalter existiert, hat aber keine Verordnung - dasselbe
    // Ergebnis wie eine unbekannte ID (PROJECT_PRINCIPLES.md 13).
    const { rows: ohne } = await asUser(users.office, ORGANISATORISCH, [patients.petra]);
    expect(ohne).toEqual([]);
  });

  it('protokolliert nichts, wenn nichts gelesen wurde', async () => {
    await asPostgres("delete from public.audit_log where action = 'prescription.viewed'");
    await asUserCommitted(users.therapist, KLINISCH, [UNBEKANNT]);

    const { rows } = await asPostgres(
      "select id from public.audit_log where action = 'prescription.viewed'",
    );
    expect(rows).toEqual([]);
  });
});
