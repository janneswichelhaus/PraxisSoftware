import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * BEF-124 (ANN-562): Eine Verordnung bleibt mit ihrem Verlauf in der Akte.
 *
 * Jede Änderung hält den Inhalt davor fest - mit Zeitpunkt und Person
 * (§ 630f Abs. 1 BGB, ADR-010 Punkt 15). Eine Grundlage mit Terminen wird
 * nicht mehr gelöscht, und das Übertragen von Terminen steht am Termin.
 */
const { users, patients, organizationId } = SEED;

const ANNA = '55555555-5555-4555-8555-000000000002';
const PRAXIS = '33333333-3333-4333-8333-000000000001';
const PROBST = '77777777-7777-4777-8777-000000000001';
const HAUSARZT = '77777777-7777-4777-8777-000000000002';

const ANLEGEN = `
  select public.create_treatment_basis(
    $1::uuid, $2::uuid, $3, $4::date, $5::integer, $6::jsonb, $7, $8, $9
  ) as id`;
const AENDERN = `
  select public.update_treatment_basis(
    $1::uuid, $2::uuid, $3, $4::date, $5::integer, $6::jsonb, $7, $8, $9
  ) as id`;
const LOESCHEN = 'select public.delete_treatment_basis($1::uuid)';
const VERLAUF = 'select * from public.list_treatment_basis_versions($1::uuid)';
const UEBERTRAGEN =
  'select public.transfer_appointments_to_treatment_basis($1::uuid, $2::uuid[]) as anzahl';
const ICD10 = 'select public.set_treatment_basis_icd10($1::uuid, $2)';

const KG = { remedy: 'Krankengymnastik', prescribed_quantity: 10 };

interface Fassung {
  version_no: number;
  content: {
    appointment_count: number;
    diagnosis: string | null;
    diagnosis_icd10: string | null;
    prescriber_name: string | null;
    items: { remedy: string; prescribed_quantity: number }[];
  };
  replaced_at: string;
  replaced_by_name: string | null;
}

interface Felder {
  prescriber?: string;
  terminzahl?: number;
  items?: object[];
  diagnose?: string | null;
}

function felder(f: Felder = {}): unknown[] {
  return [
    f.prescriber ?? PROBST,
    'first',
    '2026-03-01',
    f.terminzahl ?? 10,
    JSON.stringify(f.items ?? [KG]),
    null,
    null,
    f.diagnose === undefined ? 'Synthetisch: Schulter rechts.' : f.diagnose,
  ];
}

async function anlegen(f: Felder = {}): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
    patients.max,
    ...felder(f),
  ]);
  return rows[0]!.id;
}

async function aendern(id: string, f: Felder = {}, userId: string = users.therapist) {
  await asUserCommitted(userId, AENDERN, [id, ...felder(f)]);
}

async function fassungen(id: string, userId: string = users.therapist): Promise<Fassung[]> {
  const { rows } = await asUserCommitted<Fassung>(userId, VERLAUF, [id]);
  return rows;
}

async function anzahlFassungen(id: string): Promise<number> {
  const { rows } = await asPostgres<{ n: number }>(
    'select count(*)::int as n from public.treatment_basis_versions where treatment_basis_id = $1',
    [id],
  );
  return rows[0]!.n;
}

let versatz = 0;

/** Ein Termin weit in der Zukunft, je Aufruf eine Stunde später (keine Überschneidung). */
async function terminAnlegen(
  grundlageId: string,
  status: 'confirmed' | 'cancelled' = 'confirmed',
): Promise<string> {
  versatz += 1;
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments
       (organization_id, patient_id, staff_member_id, location_id, appointment_type,
        status, starts_at, ends_at, treatment_basis_id, cancelled_at, cancelled_by)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'practice', $5,
             date_trunc('day', now()) + interval '200 days' + make_interval(hours => $7::int),
             date_trunc('day', now()) + interval '200 days' + make_interval(hours => $7::int)
               + interval '30 minutes',
             $6::uuid,
             case when $5 = 'cancelled' then now() end,
             case when $5 = 'cancelled' then $8::uuid end)
     returning id`,
    [organizationId, patients.max, ANNA, PRAXIS, status, grundlageId, versatz, users.office],
  );
  return rows[0]!.id;
}

async function fehler(userId: string, sql: string, params: unknown[]) {
  try {
    await asUser(userId, sql, params);
    return null;
  } catch (f) {
    return f as { code?: string; message: string };
  }
}

describe('BEF-124: Verlauf einer Behandlungsgrundlage', () => {
  beforeEach(resetDatabase);

  it('hält beim Ändern den Inhalt davor fest, mit Zeitpunkt und Person', async () => {
    const id = await anlegen();
    expect(await fassungen(id)).toEqual([]);

    await aendern(id, { terminzahl: 6, diagnose: 'Synthetisch: Schulter links.' }, users.office);

    const verlauf = await fassungen(id);
    expect(verlauf).toHaveLength(1);
    expect(verlauf[0]!.version_no).toBe(1);
    expect(verlauf[0]!.content.appointment_count).toBe(10);
    expect(verlauf[0]!.content.diagnosis).toBe('Synthetisch: Schulter rechts.');
    expect(verlauf[0]!.content.prescriber_name).toContain('Probst');
    expect(verlauf[0]!.content.items).toEqual([KG]);
    expect(verlauf[0]!.replaced_by_name).toBe('Olivia Office');
    expect(verlauf[0]!.replaced_at).toBeTruthy();
  });

  it('schreibt je Speichern genau eine Fassung, auch wenn Kopf und Heilmittel sich ändern', async () => {
    const id = await anlegen();
    await aendern(id, {
      terminzahl: 8,
      items: [KG, { remedy: 'Manuelle Therapie', prescribed_quantity: 8 }],
    });
    expect(await anzahlFassungen(id)).toBe(1);

    await aendern(id, { terminzahl: 8, prescriber: HAUSARZT, items: [KG] });
    const verlauf = await fassungen(id);
    expect(verlauf.map((f) => f.version_no)).toEqual([2, 1]);
    expect(verlauf[0]!.content.items.map((i) => i.remedy)).toEqual([
      'Krankengymnastik',
      'Manuelle Therapie',
    ]);
    expect(verlauf[0]!.content.prescriber_name).toContain('Probst');
  });

  it('hält eine Änderung nur der Heilmittel fest', async () => {
    const id = await anlegen();
    await aendern(id, { items: [{ remedy: 'Krankengymnastik', prescribed_quantity: 6 }] });

    const verlauf = await fassungen(id);
    expect(verlauf).toHaveLength(1);
    expect(verlauf[0]!.content.items).toEqual([KG]);
  });

  it('schreibt keine Fassung, wenn sich am Inhalt nichts ändert', async () => {
    const id = await anlegen();
    await aendern(id);
    expect(await anzahlFassungen(id)).toBe(0);
  });

  it('hält auch den ICD-10-Code fest, den eine eigene Funktion setzt', async () => {
    const id = await anlegen();
    await asUserCommitted(users.therapist, ICD10, [id, 'M75.1']);
    await asUserCommitted(users.therapist, ICD10, [id, 'M75.4']);

    const verlauf = await fassungen(id);
    expect(verlauf.map((f) => f.content.diagnosis_icd10)).toEqual(['M75.1', null]);
  });

  it('zählt genutzte Menge, Patient:in und Bearbeitungszeit nicht als Änderung des Inhalts', async () => {
    const id = await anlegen();
    await asPostgres(
      'update public.treatment_base_items set used_quantity = 3 where treatment_basis_id = $1',
      [id],
    );
    await asPostgres(
      `update public.treatment_bases
          set updated_at = now() + interval '1 minute', patient_id = $2
        where id = $1`,
      [id, patients.erika],
    );
    expect(await anzahlFassungen(id)).toBe(0);
  });

  it('gibt dem Verlauf weder Tabellenrecht noch Änderungsweg', async () => {
    const { rows } = await asPostgres<{ recht: boolean }>(
      `select has_table_privilege('authenticated', 'public.treatment_basis_versions', 'select')
           or has_table_privilege('authenticated', 'public.treatment_basis_versions', 'update')
           or has_table_privilege('authenticated', 'public.treatment_basis_versions', 'delete')
           or has_table_privilege('anon', 'public.treatment_basis_versions', 'select') as recht`,
    );
    expect(rows[0]!.recht).toBe(false);
  });
});

describe('BEF-124: Wer den Verlauf liest', () => {
  beforeEach(resetDatabase);

  it('lässt das Büro lesen (ADR-004 Fassung 2, E15)', async () => {
    const id = await anlegen();
    await aendern(id, { terminzahl: 6 });
    expect(await fassungen(id, users.office)).toHaveLength(1);
  });

  it('weist die Trainingsbetreuung mit null Zeilen und einer Abweisung ab', async () => {
    const id = await anlegen();
    await aendern(id, { terminzahl: 6 });
    await erwarteAbgewiesenenLeseversuch(users.trainer, VERLAUF, [id], 'treatment_basis.viewed');
  });

  it('weist ein Konto ohne Praxisrolle ab', async () => {
    const id = await anlegen();
    await aendern(id, { terminzahl: 6 });
    await erwarteAbgewiesenenLeseversuch(users.patientMax, VERLAUF, [id], 'treatment_basis.viewed');
  });

  it('gibt einem Plattformkonto nichts heraus, auch nicht der eigenen Person', async () => {
    const id = await anlegen();
    await aendern(id, { terminzahl: 6 });
    for (const konto of [users.plattformPaula, users.plattformErika]) {
      const ergebnis = await asUser(konto, VERLAUF, [id]).then(
        (r) => r.rows,
        () => [],
      );
      expect(ergebnis).toEqual([]);
    }
  });

  it('liefert einer fremden Organisation nichts', async () => {
    const fremd = await fremdeOrganisation();
    const id = await anlegen();
    await aendern(id, { terminzahl: 6 });
    expect(await fassungen(id, fremd.owner)).toEqual([]);
  });
});

describe('BEF-124: Löschen nur ohne Termine', () => {
  beforeEach(resetDatabase);

  it('löscht eine Grundlage ohne Termine samt Verlauf', async () => {
    const id = await anlegen();
    await aendern(id, { terminzahl: 6 });
    expect(await anzahlFassungen(id)).toBe(1);

    await asUserCommitted(users.therapist, LOESCHEN, [id]);

    const { rows } = await asPostgres('select 1 from public.treatment_bases where id = $1', [id]);
    expect(rows).toEqual([]);
    expect(await anzahlFassungen(id)).toBe(0);
  });

  it('löscht keine Grundlage, an der ein Termin hängt - auch kein abgesagter', async () => {
    for (const status of ['confirmed', 'cancelled'] as const) {
      const id = await anlegen();
      await terminAnlegen(id, status);

      const f = await fehler(users.ownerTherapist, LOESCHEN, [id]);
      expect(f?.code).toBe('23503');
      expect(f?.message).toMatch(/treatment basis has appointments/);

      const { rows } = await asPostgres('select 1 from public.treatment_bases where id = $1', [id]);
      expect(rows).toHaveLength(1);
    }
  });

  it('hält das Übertragen am Termin fest und sperrt danach das Löschen der alten Grundlage', async () => {
    const alt = await anlegen();
    const neu = await anlegen({ terminzahl: 12 });
    const termin = await terminAnlegen(alt);

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, UEBERTRAGEN, [
      neu,
      [termin],
    ]);
    expect(rows[0]!.anzahl).toBe(1);

    const vermerk = await asPostgres<{
      treatment_basis_id: string;
      previous_treatment_basis_id: string;
      treatment_basis_transferred_by: string;
      treatment_basis_transferred_at: string | null;
    }>(
      `select treatment_basis_id, previous_treatment_basis_id,
              treatment_basis_transferred_by, treatment_basis_transferred_at
         from public.appointments where id = $1`,
      [termin],
    );
    expect(vermerk.rows[0]).toMatchObject({
      treatment_basis_id: neu,
      previous_treatment_basis_id: alt,
      treatment_basis_transferred_by: users.office,
    });
    expect(vermerk.rows[0]!.treatment_basis_transferred_at).not.toBeNull();

    const f = await fehler(users.therapist, LOESCHEN, [alt]);
    expect(f?.message).toMatch(/treatment basis has appointments/);
  });

  it('sperrt das Löschen auch nach zwei Übertragungen hintereinander (Zweitreview)', async () => {
    const a = await anlegen();
    const b = await anlegen({ terminzahl: 12 });
    const c = await anlegen({ terminzahl: 14 });
    const termin = await terminAnlegen(a);
    await asUserCommitted(users.office, UEBERTRAGEN, [b, [termin]]);
    await asUserCommitted(users.office, UEBERTRAGEN, [c, [termin]]);

    for (const id of [a, b]) {
      const f = await fehler(users.therapist, LOESCHEN, [id]);
      expect(f?.message).toMatch(/treatment basis has appointments/);
    }
  });

  it('sperrt das Löschen auch, wenn der Termin selbst gelöscht wurde', async () => {
    const id = await anlegen();
    const termin = await terminAnlegen(id);
    await asPostgres('delete from public.appointments where id = $1', [termin]);
    const f = await fehler(users.therapist, LOESCHEN, [id]);
    expect(f?.message).toMatch(/treatment basis has appointments/);
  });

  it('vermerkt nichts, wenn der Termin schon an der Zielgrundlage hängt', async () => {
    const id = await anlegen();
    const termin = await terminAnlegen(id);
    await asUserCommitted(users.office, UEBERTRAGEN, [id, [termin]]);

    const { rows } = await asPostgres<{ previous_treatment_basis_id: string | null }>(
      `select previous_treatment_basis_id, treatment_basis_transferred_at
         from public.appointments where id = $1`,
      [termin],
    );
    expect(rows[0]).toEqual({
      previous_treatment_basis_id: null,
      treatment_basis_transferred_at: null,
    });
  });

  it('lässt keinen Vermerk ohne Zeitpunkt und Person zu', async () => {
    const id = await anlegen();
    const termin = await terminAnlegen(id);
    await expect(
      asPostgres('update public.appointments set previous_treatment_basis_id = $2 where id = $1', [
        termin,
        id,
      ]),
    ).rejects.toThrow(/appointments_previous_basis_only_after_transfer/);
    await expect(
      asPostgres(
        'update public.appointments set treatment_basis_transferred_at = now() where id = $1',
        [termin],
      ),
    ).rejects.toThrow(/appointments_treatment_basis_transfer_complete/);
  });
});
