import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * VER-003: Verordnung anlegen, ändern und löschen.
 *
 * Zwei Dinge stehen hier im Mittelpunkt: dass Kopf und Positionen atomar
 * entstehen und dass die Positionen serverseitig geprüft werden — ein
 * Kontingent, das über seine Verordnung hinausläuft, wäre ein
 * Abrechnungsfehler (PROJECT_PRINCIPLES.md §13).
 */
const { users, patients } = SEED;

const ANLEGEN = `
  select public.create_prescription(
    $1::uuid, $2::uuid, $3, $4::date, $5::jsonb, $6, $7, $8, $9, $10, $11
  ) as id`;

const AENDERN = `
  select public.update_prescription(
    $1::uuid, $2::uuid, $3, $4::date, $5::jsonb, $6, $7, $8, $9, $10, $11
  ) as id`;

const LOESCHEN = 'select public.delete_prescription($1::uuid)';
const HOLEN = 'select * from public.get_prescription($1::uuid)';
const KLINISCH = 'select * from public.list_patient_prescriptions_clinical($1::uuid)';

const PROBST = '77777777-7777-4777-8777-000000000001';
const HAUSARZT = '77777777-7777-4777-8777-000000000002';
const FREMDE_ID = '99999999-9999-4999-8999-00000000000f';

const POSITIONEN = JSON.stringify([
  { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 0 },
]);

interface Position {
  id: string;
  sort_order: number;
  remedy: string;
  prescribed_quantity: number;
  used_quantity: number;
  remaining_quantity: number;
}

function argumente(items: string = POSITIONEN, rest: (string | null)[] = []) {
  return [
    patients.max,
    PROBST,
    'first',
    '2026-03-01',
    items,
    ...(rest.length > 0 ? rest : [null, null, null, null, null, null]),
  ];
}

async function anlegen(userId: string, items: string = POSITIONEN, rest: (string | null)[] = []) {
  const { rows } = await asUserCommitted<{ id: string }>(userId, ANLEGEN, argumente(items, rest));
  return rows[0]!.id;
}

async function positionen(prescriptionId: string): Promise<Position[]> {
  const { rows } = await asPostgres<{ items: Position[] }>(
    'select app.prescription_items_json($1::uuid) as items',
    [prescriptionId],
  );
  return rows[0]!.items;
}

describe('VER-003: Verordnung anlegen, aendern und loeschen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    // Nur die im Test erzeugten Verordnungen entfernen; der Seed-Bestand
    // bleibt, damit die Reihenfolge-Tests etwas zum Einordnen haben.
    await asPostgres("delete from public.audit_log where subject_type = 'prescription'");
  });

  it('legt Kopf und Positionen in einer Transaktion an', async () => {
    const id = await anlegen(
      users.therapist,
      JSON.stringify([
        { remedy: 'Manuelle Therapie', prescribed_quantity: 6, used_quantity: 2 },
        { remedy: 'Waermetherapie', prescribed_quantity: 6, used_quantity: 0 },
      ]),
      ['1x pro Woche', 'Synthetisch: Bemerkung.', 'Synthetisch: Diagnose.', null, null, null],
    );

    const items = await positionen(id);
    expect(items.map((i) => [i.sort_order, i.remedy, i.remaining_quantity])).toEqual([
      [1, 'Manuelle Therapie', 4],
      [2, 'Waermetherapie', 6],
    ]);
  });

  it('protokolliert das Anlegen ohne klinische Inhalte (ADR-010)', async () => {
    const id = await anlegen(users.therapist, POSITIONEN, [
      null,
      null,
      'Synthetisch: Diagnose Schulter.',
      null,
      null,
      null,
    ]);

    const { rows } = await asPostgres<{ subject_id: string; context: Record<string, unknown> }>(
      `select subject_id, context from public.audit_log
        where action = 'prescription.created'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_id).toBe(id);
    expect(rows[0]?.context).toMatchObject({ surface: 'web', patient_id: patients.max });
    expect(JSON.stringify(rows[0]?.context)).not.toMatch(/Schulter/i);
  });

  it('laesst office weder anlegen noch aendern noch loeschen (ANN-011)', async () => {
    await expect(asUser(users.office, ANLEGEN, argumente())).rejects.toThrow(
      /not allowed to write prescriptions/i,
    );
    await expect(asUser(users.patientMax, ANLEGEN, argumente())).rejects.toThrow(
      /not allowed to write prescriptions/i,
    );

    const id = await anlegen(users.therapist);
    await expect(asUser(users.office, LOESCHEN, [id])).rejects.toThrow(
      /not allowed to write prescriptions/i,
    );
  });

  it('verlangt mindestens eine Position', async () => {
    await expect(asUser(users.therapist, ANLEGEN, argumente('[]'))).rejects.toThrow(
      /at least one prescription item/i,
    );
  });

  it('weist eine genutzte Menge ueber der verordneten ab', async () => {
    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente(
          JSON.stringify([
            { remedy: 'Krankengymnastik', prescribed_quantity: 6, used_quantity: 7 },
          ]),
        ),
      ),
    ).rejects.toThrow(/used quantity out of range/i);
  });

  it('weist eine leere Bezeichnung und unsinnige Mengen ab', async () => {
    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente(JSON.stringify([{ remedy: '   ', prescribed_quantity: 6 }])),
      ),
    ).rejects.toThrow(/remedy is required/i);

    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente(JSON.stringify([{ remedy: 'Krankengymnastik', prescribed_quantity: 0 }])),
      ),
    ).rejects.toThrow(/prescribed quantity out of range/i);

    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente(JSON.stringify([{ remedy: 'Krankengymnastik', prescribed_quantity: 'viele' }])),
      ),
    ).rejects.toThrow(/quantities must be numbers/i);
  });

  it('weist ein Ausstellungsdatum in der Zukunft ab', async () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await expect(
      asUser(users.therapist, ANLEGEN, [
        patients.max,
        PROBST,
        'first',
        morgen,
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/issued_on must not be in the future/i);
  });

  it('unterscheidet fremde nicht von unbekannten IDs', async () => {
    await expect(
      asUser(users.therapist, ANLEGEN, [
        patients.max,
        FREMDE_ID,
        'first',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/prescriber not found/i);

    await expect(
      asUser(users.therapist, ANLEGEN, [
        FREMDE_ID,
        PROBST,
        'first',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/patient not found/i);
  });

  it('behaelt bestehende Positionen beim Aendern und entfernt weggefallene', async () => {
    const id = await anlegen(
      users.therapist,
      JSON.stringify([
        { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 3 },
        { remedy: 'Waermetherapie', prescribed_quantity: 10, used_quantity: 1 },
      ]),
    );
    const vorher = await positionen(id);

    // Erste Position behalten (mit id), zweite weglassen, dritte neu.
    await asUserCommitted(users.therapist, AENDERN, [
      id,
      HAUSARZT,
      'follow_up',
      '2026-04-02',
      JSON.stringify([
        {
          id: vorher[0]!.id,
          remedy: 'Krankengymnastik',
          prescribed_quantity: 12,
          used_quantity: 3,
        },
        { remedy: 'Manuelle Therapie', prescribed_quantity: 4, used_quantity: 0 },
      ]),
      null,
      null,
      null,
      null,
      null,
      null,
    ]);

    const nachher = await positionen(id);
    expect(nachher).toHaveLength(2);
    // Dieselbe Zeile, nicht neu angelegt.
    expect(nachher[0]?.id).toBe(vorher[0]?.id);
    expect(nachher[0]?.prescribed_quantity).toBe(12);
    expect(nachher[1]?.remedy).toBe('Manuelle Therapie');
    expect(nachher.map((i) => i.sort_order)).toEqual([1, 2]);

    const { rows } = await asPostgres<{ prescriber_id: string; prescription_kind: string }>(
      'select prescriber_id, prescription_kind from public.prescriptions where id = $1',
      [id],
    );
    expect(rows[0]?.prescriber_id).toBe(HAUSARZT);
    expect(rows[0]?.prescription_kind).toBe('follow_up');
  });

  it('nimmt eine fremde Positions-ID nicht als Hebel auf andere Verordnungen', async () => {
    const eine = await anlegen(users.therapist);
    const andere = await anlegen(users.therapist);
    const fremdePosition = (await positionen(andere))[0]!;

    await asUserCommitted(users.therapist, AENDERN, [
      eine,
      PROBST,
      'first',
      '2026-03-01',
      JSON.stringify([
        { id: fremdePosition.id, remedy: 'Uebernommen', prescribed_quantity: 3, used_quantity: 0 },
      ]),
      null,
      null,
      null,
      null,
      null,
      null,
    ]);

    // Die fremde Position ist unveraendert; bei "eine" ist eine neue entstanden.
    const unveraendert = (await positionen(andere))[0]!;
    expect(unveraendert.remedy).toBe('Krankengymnastik');
    expect(unveraendert.prescribed_quantity).toBe(10);

    const neue = (await positionen(eine))[0]!;
    expect(neue.id).not.toBe(fremdePosition.id);
    expect(neue.remedy).toBe('Uebernommen');
  });

  it('nimmt die Patientin nicht als Parameter entgegen - eine Verordnung wechselt nicht die Akte', async () => {
    const { rows } = await asPostgres<{ args: string }>(`
      select pg_get_function_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'update_prescription'
    `);
    expect(rows[0]?.args ?? '').not.toMatch(/patient/i);
    expect(rows[0]?.args ?? '').not.toMatch(/organization/i);
  });

  it('liefert get_prescription nur den therapeutischen Rollen und protokolliert', async () => {
    const id = await anlegen(users.therapist);
    await asPostgres("delete from public.audit_log where subject_type = 'prescription'");

    const { rows } = await asUserCommitted<{ id: string; patient_id: string }>(
      users.teamLead,
      HOLEN,
      [id],
    );
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.patient_id).toBe(patients.max);

    const { rows: audit } = await asPostgres(
      `select id from public.audit_log where action = 'prescription.viewed'`,
    );
    expect(audit).toHaveLength(1);

    await expect(asUser(users.office, HOLEN, [id])).rejects.toThrow(
      /not allowed to read clinical prescription data/i,
    );
  });

  it('gibt fuer eine unbekannte Verordnung nichts zurueck und protokolliert nichts', async () => {
    const { rows } = await asUserCommitted(users.therapist, HOLEN, [FREMDE_ID]);
    expect(rows).toEqual([]);

    const { rows: audit } = await asPostgres(
      `select id from public.audit_log where action = 'prescription.viewed'`,
    );
    expect(audit).toEqual([]);
  });

  it('loescht endgueltig samt Positionen und haelt den Vorgang im Auditlog fest', async () => {
    const id = await anlegen(users.therapist);
    await asPostgres("delete from public.audit_log where subject_type = 'prescription'");

    await asUserCommitted(users.ownerTherapist, LOESCHEN, [id]);

    const { rows } = await asPostgres('select id from public.prescriptions where id = $1', [id]);
    expect(rows).toEqual([]);
    // on delete cascade: kein verwaister Rest (ADR-008 Punkt 10).
    const { rows: reste } = await asPostgres(
      'select id from public.prescription_items where prescription_id = $1',
      [id],
    );
    expect(reste).toEqual([]);

    const { rows: audit } = await asPostgres<{ subject_id: string }>(
      `select subject_id from public.audit_log where action = 'prescription.deleted'`,
    );
    expect(audit[0]?.subject_id).toBe(id);
  });

  it('meldet eine unbekannte Verordnung beim Loeschen und beim Aendern gleich', async () => {
    await expect(asUser(users.therapist, LOESCHEN, [FREMDE_ID])).rejects.toThrow(
      /prescription not found/i,
    );
    await expect(
      asUser(users.therapist, AENDERN, [
        FREMDE_ID,
        PROBST,
        'first',
        '2026-03-01',
        POSITIONEN,
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    ).rejects.toThrow(/prescription not found/i);
  });

  it('erscheint eine neue Verordnung sofort in der Akte', async () => {
    const id = await anlegen(users.therapist, POSITIONEN, [
      null,
      null,
      null,
      null,
      null,
      'Synthetisch: Empfehlung der Therapeutin.',
    ]);

    const { rows } = await asUserCommitted<{ id: string; follow_up_recommendation: string }>(
      users.therapist,
      KLINISCH,
      [patients.max],
    );
    const gefunden = rows.find((r) => r.id === id);
    expect(gefunden?.follow_up_recommendation).toBe('Synthetisch: Empfehlung der Therapeutin.');
  });
});
