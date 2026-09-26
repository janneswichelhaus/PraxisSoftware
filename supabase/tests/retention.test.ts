import { beforeAll, describe, expect, it } from 'vitest';
import { asPostgres, asUser, resetDatabase, SEED } from './helpers/db';
import {
  ANKER_TEXTE,
  DATENKLASSEN,
  GRUNDLAGE_TEXTE,
  OBERGRENZE_TEXTE,
} from '@/features/retention/klassen';

/**
 * Retention Schedule (LOE-001a, ADR-008).
 *
 * Der wichtigste Test hier ist der erste: Jede Tabelle in `public` gehoert zu
 * einer Datenklasse. ADR-008 nennt eine Datenklasse ohne Fristzuordnung einen
 * Mangel; ohne diesen Test bliebe das eine Absichtserklaerung, die die naechste
 * Migration still verletzt.
 */
describe('Retention Schedule', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('ordnet jede Tabelle in public einer Datenklasse zu (ADR-008)', async () => {
    const { rows } = await asPostgres<{ tablename: string }>(`
      select t.tablename
      from pg_tables t
      where t.schemaname = 'public'
        and not exists (
          select 1 from public.retention_assignments a where a.table_name = t.tablename
        )
      order by t.tablename
    `);
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it('zeigt auf keine Tabelle, die es nicht gibt', async () => {
    const { rows } = await asPostgres<{ table_name: string }>(`
      select a.table_name
      from public.retention_assignments a
      where not exists (
        select 1 from pg_tables t where t.schemaname = 'public' and t.tablename = a.table_name
      )
      order by a.table_name
    `);
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it('haelt Frist und Anker konsistent: keine Frist genau dann, wenn kein Anker', async () => {
    const { rows } = await asPostgres<{ key: string }>(`
      select key from public.retention_classes
      where (anchor = 'none') <> (retention_interval is null)
    `);
    expect(rows).toEqual([]);
  });

  it('begruendet jede Frist ohne gesetzliche Grundlage mit einer Annahme (ANN-001)', async () => {
    // Eine interne Frist ohne Eintrag im Register waere genau die Luecke, die
    // ANN-001 schliessen soll: die Datenschutzpruefung wuesste nicht, was sie
    // zu validieren hat. Klassen ohne Frist (anchor 'none') sind ausgenommen,
    // soweit sie ueberhaupt keinen Personenbezug tragen.
    const { rows } = await asPostgres<{ key: string }>(`
      select key from public.retention_classes
      where basis in ('intern', 'offen')
        and assumption_key is null
        and key not in ('stammdaten_praxis')
      order by key
    `);
    expect(rows.map((r) => r.key)).toEqual([]);
  });

  it('liefert die Frist ausschliesslich ueber app.retention_interval (ANN-001)', async () => {
    const { rows } = await asPostgres<{ akte: string; offen: string | null }>(`
      select app.retention_interval('patientenakte')::text as akte,
             app.retention_interval('beschaeftigtendaten')::text as offen
    `);
    expect(rows[0]?.akte).toContain('10 years');
    expect(rows[0]?.offen).toBeNull();
  });

  it('weist eine unbekannte Datenklasse zurueck, statt leer zu antworten', async () => {
    await expect(asPostgres(`select app.retention_interval('gibt_es_nicht')`)).rejects.toThrow(
      /unknown retention class/,
    );
  });

  it('beschriftet jede Datenklasse, jeden Anker und jede Grundlage in der Oberflaeche', async () => {
    const { rows } = await asPostgres<{ key: string; anchor: string; basis: string }>(
      `select key, anchor, basis from public.retention_classes order by key`,
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !DATENKLASSEN[r.key]).map((r) => r.key)).toEqual([]);
    expect(rows.filter((r) => !ANKER_TEXTE[r.anchor]).map((r) => r.anchor)).toEqual([]);
    expect(rows.filter((r) => !GRUNDLAGE_TEXTE[r.basis]).map((r) => r.basis)).toEqual([]);

    // Die Obergrenze (ADR-017 Punkt 38) steht ebenso in Worten da.
    const { rows: obergrenzen } = await asPostgres<{ upper_bound_anchor: string }>(
      `select distinct upper_bound_anchor from public.retention_classes
       where upper_bound_anchor is not null`,
    );
    expect(obergrenzen.length).toBeGreaterThan(0);
    expect(
      obergrenzen
        .filter((r) => !OBERGRENZE_TEXTE[r.upper_bound_anchor])
        .map((r) => r.upper_bound_anchor),
    ).toEqual([]);

    // Umgekehrt ebenso: eine Beschriftung ohne Klasse in der Datenbank waere
    // ein Rest aus einer frueheren Fassung.
    const schluessel = new Set(rows.map((r) => r.key));
    expect(Object.keys(DATENKLASSEN).filter((k) => !schluessel.has(k))).toEqual([]);
  });

  it('ist fuer Praxisrollen lesbar und fuer ein Patientenkonto nicht', async () => {
    const { rows: fuerTherapeutin } = await asUser(
      SEED.users.therapist,
      `select key from public.retention_classes`,
    );
    expect(fuerTherapeutin.length).toBeGreaterThan(0);

    const { rows: fuerPatient } = await asUser(
      SEED.users.patientMax,
      `select key from public.retention_classes`,
    );
    expect(fuerPatient).toEqual([]);

    const { rows: zuordnung } = await asUser(
      SEED.users.patientMax,
      `select table_name from public.retention_assignments`,
    );
    expect(zuordnung).toEqual([]);
  });

  it('erlaubt keiner Anwendungsrolle, eine Frist zu aendern (ADR-013)', async () => {
    await expect(
      asUser(
        SEED.users.ownerTherapist,
        `update public.retention_classes set retention_interval = interval '1 day' where key = 'patientenakte'`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
