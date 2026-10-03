import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Zielwerte der Praxisfuehrung (STA-002). Allein owner liest und setzt; wer
 * zuletzt geaendert hat, steht am Datensatz (updated_by/updated_at,
 * LOG-EPIC-001), ein Leeren loescht den Wert, und niemand erreicht die
 * Tabelle an den Funktionen vorbei.
 */
const { users, organizationId } = SEED;

const LESEN = 'select * from public.get_practice_targets()';
const SETZEN = 'select public.set_practice_target($1::text, $2::int) as wert';

interface Ziele {
  revenue_cents: number | null;
  open_items_cents: number | null;
  utilization_percent: number | null;
  ending_bases: number | null;
  absences: number | null;
}

async function ziele(konto: string = users.ownerTherapist): Promise<Ziele> {
  const { rows } = await asUser<Ziele>(konto, LESEN);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function setze(kennzahl: string, wert: number | null, konto: string = users.ownerTherapist) {
  return asUserCommitted<{ wert: number | null }>(konto, SETZEN, [kennzahl, wert]);
}

interface Stand {
  updated_by: string | null;
  updated_at: string;
}

/** Wer und wann der letzten Aenderung, mikrosekundengenau (LOG-EPIC-001). */
async function stand(): Promise<Stand[]> {
  return (
    await asPostgres<Stand>(
      `select updated_by, to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') as updated_at
         from public.practice_targets where organization_id = $1`,
      [organizationId],
    )
  ).rows;
}

/** Erfolgreiche Auditeintraege: Das Setzen eines Ziels schreibt keinen mehr. */
async function auditErfolge(): Promise<number> {
  const { rows } = await asPostgres<{ n: number }>(
    "select count(*)::int as n from public.audit_log where outcome = 'success'",
  );
  return rows[0]!.n;
}

describe('Zielwerte der Praxisfuehrung (STA-002)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('liefert ohne gespeicherte Ziele eine leere Zeile - die Software raet kein Ziel', async () => {
    expect(await ziele()).toMatchObject({
      revenue_cents: null,
      open_items_cents: null,
      utilization_percent: null,
      ending_bases: null,
      absences: null,
    });
  });

  it('setzt jeden Zielwert einzeln und haelt wer/wann am Datensatz fest (LOG-EPIC-001)', async () => {
    const auditVorher = await auditErfolge();
    await setze('revenue_cents', 1_200_000);
    await setze('open_items_cents', 300_000);
    await setze('utilization_percent', 85);
    await setze('ending_bases', 2);
    await setze('absences', 4);
    await setze('revenue_cents', 1_500_000);

    expect(await ziele()).toMatchObject({
      revenue_cents: 1_500_000,
      open_items_cents: 300_000,
      utilization_percent: 85,
      ending_bases: 2,
      absences: 4,
    });

    const zeilen = await stand();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.updated_by).toBe(users.ownerTherapist);
    expect(await auditErfolge()).toBe(auditVorher);
  });

  it('schreibt ohne Aenderung nichts (LOG-EPIC-001)', async () => {
    await setze('absences', 4);
    const vorher = await stand();
    const auditVorher = await auditErfolge();
    await setze('absences', 4);
    expect(await stand()).toEqual(vorher);
    expect(await auditErfolge()).toBe(auditVorher);
  });

  it('legt beim Leeren eines leeren Ziels keine Zeile an', async () => {
    const auditVorher = await auditErfolge();
    await setze('absences', null);
    const { rows } = await asPostgres('select 1 from public.practice_targets');
    expect(rows).toHaveLength(0);
    expect(await auditErfolge()).toBe(auditVorher);
  });

  it('faellt mit der Organisation (Loeschpfad)', async () => {
    // Eine leere Organisation ohne weitere Daten: Andere Tabellen halten ihre
    // Organisation mit `restrict`, die Zielwerte fallen mit ihr.
    const LEER = '22222222-2222-4222-8222-0000000000ee';
    await asPostgres(`
      insert into public.organizations (id, name, time_zone)
        values ('${LEER}', 'Leere Praxis', 'Europe/Berlin');
      insert into public.practice_targets (organization_id, absences) values ('${LEER}', 2);
    `);
    await asPostgres(`delete from public.organizations where id = '${LEER}'`);
    const { rows } = await asPostgres(
      'select 1 from public.practice_targets where organization_id = $1',
      [LEER],
    );
    expect(rows).toHaveLength(0);
  });

  it('loescht einen Zielwert durch Leeren', async () => {
    await setze('utilization_percent', 80);
    await setze('utilization_percent', null);
    expect((await ziele()).utilization_percent).toBeNull();
    const zeilen = await stand();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.updated_by).toBe(users.ownerTherapist);
  });

  it('weist eine unbekannte Kennzahl und Werte ausserhalb des Bereichs ab', async () => {
    await expect(setze('gewinn', 1)).rejects.toThrow(/unknown practice target/);
    await expect(setze('utilization_percent', 101)).rejects.toThrow(/out of range/);
    await expect(setze('absences', -1)).rejects.toThrow(/out of range/);
  });

  it('laesst allein owner lesen und schreiben', async () => {
    await setze('absences', 3);
    for (const konto of [
      users.office,
      users.therapist,
      users.teamLead,
      users.trainer,
      users.patientMax,
    ]) {
      await erwarteAbgewiesenenLeseversuch(konto, LESEN, [], 'statistics.read');
      await expect(setze('absences', 9, konto), konto).rejects.toThrow(
        /not allowed to change practice targets/,
      );
    }
    expect((await ziele()).absences).toBe(3);
    await expect(asAnon(LESEN)).rejects.toThrow(/permission denied/i);
    await expect(asAnon(SETZEN, ['absences', 1])).rejects.toThrow(/permission denied/i);
  });

  it('endet an der Organisationsgrenze', async () => {
    await setze('absences', 3);
    const fremd = await fremdeOrganisation();
    expect((await ziele(fremd.owner)).absences).toBeNull();
    await setze('absences', 7, fremd.owner);
    expect((await ziele()).absences).toBe(3);
  });

  it('ist an den Funktionen vorbei weder lesbar noch schreibbar', async () => {
    await setze('absences', 3);
    for (const sql of [
      'select * from public.practice_targets',
      `update public.practice_targets set absences = 99`,
      `delete from public.practice_targets`,
      `insert into public.practice_targets (organization_id) values ('${organizationId}')`,
    ]) {
      await expect(asUser(users.ownerTherapist, sql), sql).rejects.toThrow(/permission denied/i);
    }
  });
});
