import { asPostgres } from './db';

// Eine Wiederherstellung im Test (ADR-008 Punkt 8): Zeilen sichern, nach dem Löschen so
// zurückspielen, wie eine Sicherung es täte, und das Journal nachziehen lassen.

export const NACHZIEHEN = 'select public.reapply_deletion_journal() as anzahl';

/** Die Zeilen einer Tabelle, wie eine Sicherung sie hätte. */
export async function sichern(
  tabelle: string,
  bedingung: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const { rows } = await asPostgres<{ zeilen: Record<string, unknown>[] }>(
    `select coalesce(json_agg(x), '[]'::json) as zeilen from public.${tabelle} x where ${bedingung}`,
    params,
  );
  return rows[0]!.zeilen;
}

/**
 * Spielt gesicherte Zeilen zurück wie ein Restore: Zeilen derselben Kennung weichen dem Stand der
 * Sicherung, ohne Auslöser und ohne Fremdschlüsselprüfung.
 */
export async function zurueckspielen(
  tabelle: string,
  zeilen: Record<string, unknown>[],
  schluessel = 'id',
): Promise<void> {
  if (zeilen.length === 0) return;
  // Berechnete Spalten rechnet die Datenbank beim Einspielen selbst.
  const { rows } = await asPostgres<{ spalten: string }>(
    `select string_agg(quote_ident(column_name), ', ' order by ordinal_position) as spalten
       from information_schema.columns
      where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER'`,
    [tabelle],
  );
  const spalten = rows[0]!.spalten;
  const sicherung = `$sicherung$${JSON.stringify(zeilen)}$sicherung$::json`;
  await asPostgres(`
    set session_replication_role = replica;
    delete from public.${tabelle}
     where ${schluessel} in (select ${schluessel}
                               from json_populate_recordset(null::public.${tabelle}, ${sicherung}));
    insert into public.${tabelle} (${spalten}) overriding system value
    select ${spalten} from json_populate_recordset(null::public.${tabelle}, ${sicherung});
    set session_replication_role = origin;`);
}

/** Wie viele der gesicherten Zeilen gerade stehen. */
export async function stehen(
  tabelle: string,
  zeilen: Record<string, unknown>[],
  schluessel = 'id',
): Promise<number> {
  const { rows } = await asPostgres<{ n: number }>(
    `select count(*)::int as n from public.${tabelle} where ${schluessel} = any($1::uuid[])`,
    [zeilen.map((z) => z[schluessel])],
  );
  return rows[0]!.n;
}

export interface Journaleintrag {
  target_id: string;
  retention_class: string;
  reapplied_at: string | null;
}

/** Die Einträge im Löschjournal zu Zeilen einer Tabelle. */
export async function journal(tabelle: string, ids: unknown[]): Promise<Journaleintrag[]> {
  const { rows } = await asPostgres<Journaleintrag>(
    `select target_id, retention_class, reapplied_at from public.deletion_journal
      where target_table = $1 and target_id = any($2::uuid[]) order by target_id`,
    [tabelle, ids],
  );
  return rows;
}

/**
 * Ob die Einträge zu Zeilen tageweise stehen wie jede Löschung von Hand (ANN-752): mit der
 * Tageskennung der Praxis, fällig und gelöscht um Mitternacht. In der Reihenfolge der Kennungen.
 */
export async function tageweise(tabelle: string, ids: unknown[]): Promise<boolean[]> {
  const { rows } = await asPostgres<{ tageweise: boolean }>(
    `select j.run_id = md5('tageweise:' || j.organization_id::text || ':'
                           || j.deleted_at::date::text)::uuid
            and j.deleted_at = date_trunc('day', j.deleted_at) and j.due_at = j.deleted_at
              as tageweise
       from public.deletion_journal j
      where j.target_table = $1 and j.target_id = any($2::uuid[])
      order by j.target_id`,
    [tabelle, ids],
  );
  return rows.map((r) => r.tageweise);
}
