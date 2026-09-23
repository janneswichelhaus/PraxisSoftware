import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * VER-002, ROL-002: Verordnungen in der Akte, rollenabhängig projiziert.
 *
 * Zwei Funktionen mit zwei Rückgabetypen — nicht eine Funktion mit genullten
 * Spalten (ADR-004, ANN-011). Seit E15 lesen alle vier Praxisrollen die
 * klinische Sicht, `office` eingeschlossen (ADR-004 Fassung 2 Punkt 3), und
 * jede gelesene Verordnung wird protokolliert (ADR-010). Die organisatorische
 * Sicht bleibt bestehen und führt die klinischen Felder weiterhin gar nicht.
 */
const { users, patients } = SEED;

const ORGANISATORISCH = 'select * from public.list_patient_treatment_bases($1::uuid)';
const KLINISCH = 'select * from public.list_patient_treatment_bases_clinical($1::uuid)';

const MAX_ERST = '88888888-8888-4888-8888-000000000001';
const MAX_FOLGE = '88888888-8888-4888-8888-000000000002';
const ERIKA_ERST = '88888888-8888-4888-8888-000000000003';
const ERIKA_FOLGE = '88888888-8888-4888-8888-000000000004';
/** Die zweite Bauart (GRD-001, ADR-020): Selbstzahler, ohne Verordner:in. */
const ERIKA_SELBSTZAHLER = '88888888-8888-4888-8888-000000000005';
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
  // Null beim Selbstzahler (ADR-020 Punkt 3).
  prescriber_name: string | null;
  prescriber_practice_name: string | null;
  treatment_basis_kind: string;
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
    expect(rows[0]?.treatment_basis_kind).toBe('follow_up');
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
      where n.nspname = 'public' and p.proname = 'list_patient_treatment_bases'
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

  it('liefert office die klinischen Felder und protokolliert je Verordnung (E15)', async () => {
    await asPostgres("delete from public.audit_log where action = 'treatment_basis.viewed'");

    const { rows } = await asUserCommitted<Zeile>(users.office, KLINISCH, [patients.max]);
    expect(rows.map((r) => r.id)).toEqual([MAX_FOLGE, MAX_ERST]);
    expect(rows[0]?.diagnosis).toContain('Bewegungseinschraenkung');

    const { rows: audit } = await asPostgres<{
      subject_id: string;
      actor_user_id: string;
      context: Record<string, unknown>;
    }>(
      `select subject_id, actor_user_id, context from public.audit_log
        where action = 'treatment_basis.viewed'`,
    );
    expect(audit.map((a) => a.subject_id).sort()).toEqual([MAX_ERST, MAX_FOLGE].sort());
    expect(audit.every((a) => a.actor_user_id === users.office)).toBe(true);
    // Keine klinischen Inhalte im Auditlog (ADR-010 Punkt 3, ADR-011).
    expect(JSON.stringify(audit.map((a) => a.context))).not.toMatch(/Bewegungseinschraenkung/);
  });

  it('weist ein Patientenkonto und anon beide Sichten ab', async () => {
    await expect(asUser(users.patientMax, ORGANISATORISCH, [patients.max])).rejects.toThrow(
      /not allowed to read treatment_bases/i,
    );
    // G6a: Die klinische Sicht weist ohne Ausnahme ab und protokolliert den Versuch.
    await erwarteAbgewiesenenLeseversuch(
      users.patientMax,
      KLINISCH,
      [patients.max],
      'treatment_basis.viewed',
    );
    await expect(asAnon(ORGANISATORISCH, [patients.max])).rejects.toThrow(/permission denied/i);
  });

  it('protokolliert je gelesener Verordnung genau einen Zugriff (ADR-010)', async () => {
    await asPostgres("delete from public.audit_log where action = 'treatment_basis.viewed'");
    await asUserCommitted(users.therapist, KLINISCH, [patients.erika]);

    const { rows } = await asPostgres<{
      subject_id: string;
      actor_user_id: string;
      context: Record<string, unknown>;
    }>(
      `select subject_id, actor_user_id, context from public.audit_log
        where action = 'treatment_basis.viewed' and subject_type = 'treatment_basis'`,
    );
    // Erika hat drei Grundlagen - genau drei Eintraege, kein Sammeleintrag.
    // Der Selbstzahler wird wie jede Verordnung protokolliert: Die Datenklasse
    // haengt an der Tabelle, nicht an der Bauart (ADR-020 Punkt 4).
    expect(rows.map((r) => r.subject_id).sort()).toEqual(
      [ERIKA_ERST, ERIKA_FOLGE, ERIKA_SELBSTZAHLER].sort(),
    );
    expect(rows.every((r) => r.actor_user_id === users.therapist)).toBe(true);
    expect(rows[0]?.context).toMatchObject({ surface: 'web', patient_id: patients.erika });
    // Keine klinischen Inhalte im Auditlog (ADR-010 Punkt 3, ADR-011).
    expect(JSON.stringify(rows.map((r) => r.context))).not.toMatch(/Nacken|Verspannung/i);
  });

  it('protokolliert die organisatorische Sicht nicht', async () => {
    await asPostgres("delete from public.audit_log where action = 'treatment_basis.viewed'");
    await asUserCommitted(users.office, ORGANISATORISCH, [patients.max]);

    const { rows } = await asPostgres(
      "select id from public.audit_log where action = 'treatment_basis.viewed'",
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
    await asPostgres("delete from public.audit_log where action = 'treatment_basis.viewed'");
    await asUserCommitted(users.therapist, KLINISCH, [UNBEKANNT]);

    const { rows } = await asPostgres(
      "select id from public.audit_log where action = 'treatment_basis.viewed'",
    );
    expect(rows).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // GRD-001 / ADR-020: Der Selbstzahler benutzt dieselben Lesepfade. Die
  // Datenklasse haengt an der Tabelle, nicht an der Bauart (Punkt 4) - also
  // gelten Projektion, Rollenschnitt und Protokollpflicht unveraendert.
  // ---------------------------------------------------------------------------
  describe('Die zweite Bauart im Lesepfad (ADR-020)', () => {
    it('liefert ihn in der organisatorischen Sicht ohne Verordner:in', async () => {
      const { rows } = await asUser<Zeile>(users.office, ORGANISATORISCH, [patients.erika]);

      const selbstzahler = rows.find((r) => r.id === ERIKA_SELBSTZAHLER);
      expect(selbstzahler?.treatment_basis_kind).toBe('self_pay');
      expect(selbstzahler?.prescriber_name).toBeNull();
      expect(selbstzahler?.prescriber_practice_name).toBeNull();
      // Dieselbe Klammer wie eine Verordnung: mit Positionen und Mengen.
      expect(selbstzahler?.items).toHaveLength(1);
    });

    it('liefert ihn in der klinischen Sicht mit leeren klinischen Feldern', async () => {
      const { rows } = await asUser<Zeile>(users.therapist, KLINISCH, [patients.erika]);

      const selbstzahler = rows.find((r) => r.id === ERIKA_SELBSTZAHLER);
      expect(selbstzahler?.diagnosis).toBeNull();
      expect(selbstzahler?.therapy_goal).toBeNull();
      expect(selbstzahler?.follow_up_recommendation).toBeNull();
    });

    it('weist ein Patientenkonto auch bei ihm ab', async () => {
      // Der Rollenschnitt haengt an der Tabelle, nicht an der Bauart: Eine
      // leere Diagnose macht eine Zeile nicht organisatorisch (ADR-020 Punkt 4).
      await expect(asUser(users.patientMax, ORGANISATORISCH, [patients.erika])).rejects.toThrow(
        /not allowed to read treatment_bases/i,
      );
    });
  });

  it('gibt der Rolle authenticated auf treatment_bases und treatment_base_items ueberhaupt kein Recht', async () => {
    // Deny-by-default ist die tragende Entscheidung dieser Story (VER-001):
    // erreichbar ausschliesslich ueber die Funktionen oben, nie ueber die
    // Tabelle direkt. Dieser Test ist der Regressionsschutz dafuer - eine
    // kuenftige Migration, die versehentlich ein Grant ergaenzt, faellt hier
    // auf, ohne dass jemand die Migrationsdatei erneut lesen muss.
    const { rows } = await asPostgres<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name in ('treatment_bases', 'treatment_base_items')
        and grantee in ('anon', 'authenticated')
    `);
    expect(rows).toEqual([]);

    await expect(asUser(users.office, 'select * from public.treatment_bases')).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asUser(users.office, 'select * from public.treatment_base_items')).rejects.toThrow(
      /permission denied/i,
    );
  });
});
