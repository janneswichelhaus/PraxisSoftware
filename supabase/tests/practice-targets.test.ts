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
 * Zielwerte der Praxisfuehrung (STA-002). Allein owner liest und setzt; jede
 * Aenderung steht im Protokoll, ein Leeren loescht den Wert, und niemand
 * erreicht die Tabelle an den Funktionen vorbei.
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

async function protokoll(): Promise<Array<{ context: Record<string, unknown> }>> {
  return (
    await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
       where action = 'organization.practice_target_changed' and outcome = 'success'
       order by occurred_at, id`,
    )
  ).rows;
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

  it('setzt jeden Zielwert einzeln und protokolliert alten und neuen Wert', async () => {
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

    const eintraege = await protokoll();
    expect(eintraege).toHaveLength(6);
    expect(eintraege.at(-1)!.context).toEqual({
      surface: 'web',
      target: 'revenue_cents',
      previous: 1_200_000,
      value: 1_500_000,
    });
  });

  it('schreibt ohne Aenderung keinen Eintrag', async () => {
    await setze('absences', 4);
    await setze('absences', 4);
    expect(await protokoll()).toHaveLength(1);
  });

  it('legt beim Leeren eines leeren Ziels keine Zeile an', async () => {
    await setze('absences', null);
    const { rows } = await asPostgres('select 1 from public.practice_targets');
    expect(rows).toHaveLength(0);
    expect(await protokoll()).toHaveLength(0);
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
    expect((await protokoll()).at(-1)!.context).toMatchObject({ previous: 80, value: null });
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
