import { Client } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asPostgres, resetDatabase, testDatabaseUrl } from './helpers/db';

/**
 * Praxispfade verweigern Plattformkonten, bewiesen für alle (ADR-023 Punkt 21).
 *
 * Ein Plattformkonto meldet sich an und geht **jede** Tabelle und Sicht aus
 * `public` und `storage` sowie **jede** an `authenticated` freigegebene
 * Funktion in `public` und `app` durch. Erwartet ist: keine Zeile, jeder
 * Aufruf abgewiesen oder leer. Eine neue Tabelle oder Funktion ist damit
 * automatisch geprüft, so wie `retention.test.ts` jede neue Tabelle an ihre
 * Datenklasse bindet.
 *
 * Aufgerufen wird mit `null` für jedes Argument. Das reicht: Ohne Profil ist
 * `app.current_organization_id()` leer, und jeder Praxispfad bricht ab, bevor
 * er eine Kennung aus dem Aufruf ansieht. Wo ein Pfad auf eine Kennung
 * angewiesen wäre, um überhaupt etwas zu zeigen, zeigt er mit `null` ohnehin
 * nichts — die Negativfälle mit echten Kennungen stehen bei den Projektionen.
 *
 * **Die Ausnahmeliste ist Teil des Reviews** (Punkt 21): Ein Eintrag heißt,
 * dass die Funktion einem Plattformkonto etwas antworten darf. Jeder trägt
 * seinen Grund.
 */

const AUSNAHMEN: Readonly<Record<string, string>> = {
  // Für jedes Konto, nicht nur für die Praxis.
  'public.claim_staff_invitation':
    'Annahme einer Praxiseinladung (ANN-025); ohne offene Einladung abgewiesen (P0002)',
  'public.log_account_security_event':
    'Vermerk eines eigenen Sicherheitsereignisses (STAFF-004); prüft nur die Eingabe',
  // Reine Hilfsfunktionen ohne Datenzugriff: Konstanten, Eingabeprüfungen,
  // Wertkonstruktoren. Sie stehen in Policies und müssen deshalb für
  // `authenticated` ausführbar sein.
  'app.assert_geocode_result': 'Eingabeprüfung ohne Datenzugriff',
  'app.assert_staff_role_keys': 'Eingabeprüfung ohne Datenzugriff',
  'app.assert_text_snippet_input': 'Eingabeprüfung ohne Datenzugriff',
  'app.patient_file_access_grant_ttl': 'Konstante',
  'app.patient_file_bucket': 'Konstante',
  'app.patient_file_bucket_for': 'Konstante je Dokumentart',
  'app.patient_file_max_bytes': 'Konstante',
  'app.patient_photo_bucket': 'Konstante',
  'app.patient_search_min_length': 'Konstante',
  'app.retention_interval': 'Frist einer Datenklasse aus dem Katalog, ohne Personenbezug',
  'app.timemultirange': 'Wertkonstruktor',
  'app.timerange': 'Wertkonstruktor',
  'app.working_hour_action': 'Wertkonstruktor',
};

/** Tabellen, die ein Plattformkonto sehen darf, mit Grund. */
const TABELLEN_AUSNAHMEN: Readonly<Record<string, string>> = {
  'storage.buckets':
    'Katalog der Ablagen ohne Personenbezug; die Testnachbildung gibt ihn frei, der Anmeldedienst sperrt ihn per RLS ohne Policy',
};

interface Funktion {
  name: string;
  aufruf: string;
}

interface Befund {
  gegenstand: string;
  ergebnis: string;
}

/** Ein Wert, der nichts verrät: leer, `null`, `false` oder eine leere Liste. */
function istLeer(wert: unknown): boolean {
  return (
    wert === null ||
    wert === '' ||
    wert === false ||
    wert === '0' ||
    wert === 0 ||
    (Array.isArray(wert) && wert.length === 0)
  );
}

async function tabellen(): Promise<string[]> {
  const { rows } = await asPostgres<{ name: string }>(`
    select format('%I.%I', schemaname, tablename) as name
    from pg_tables where schemaname in ('public', 'storage')
    union all
    select format('%I.%I', schemaname, viewname)
    from pg_views where schemaname = 'public'
    order by 1
  `);
  return rows.map((r) => r.name);
}

async function funktionen(): Promise<Funktion[]> {
  const { rows } = await asPostgres<Funktion>(`
    select n.nspname || '.' || p.proname as name,
           format('select * from %I.%I(%s)', n.nspname, p.proname, coalesce((
             select string_agg(
                      case when p.provariadic <> 0 and a.i = p.pronargs then 'variadic ' else '' end
                        || 'null::' || format_type(a.t, null),
                      ', ' order by a.i)
             from unnest(p.proargtypes::oid[]) with ordinality as a (t, i)
           ), '')) as aufruf
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app')
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1, 2
  `);
  return rows;
}

/**
 * Meldet ein Konto an und prüft alles in **einer** Transaktion, jede Anweisung
 * hinter einem eigenen Sicherungspunkt. Am Ende wird zurückgerollt: Auch ein
 * Schreibpfad, der wider Erwarten durchginge, hinterließe nichts.
 */
async function pruefe(
  userId: string,
  mitFunktionen: boolean,
): Promise<{ tabellen: Befund[]; funktionen: Befund[]; geprueft: number }> {
  const alleTabellen = await tabellen();
  const alleFunktionen = mitFunktionen ? await funktionen() : [];
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  const tabellenBefunde: Befund[] = [];
  const funktionsBefunde: Befund[] = [];
  try {
    await client.query('begin');
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);

    for (const tabelle of alleTabellen) {
      if (tabelle in TABELLEN_AUSNAHMEN) continue;
      await client.query('savepoint probe');
      try {
        const { rows } = await client.query(`select count(*)::int as n from ${tabelle}`);
        const n = (rows[0] as { n: number }).n;
        if (n !== 0) tabellenBefunde.push({ gegenstand: tabelle, ergebnis: `${n} Zeilen` });
      } catch (fehler) {
        // Ohne Grant ist die Tabelle gar nicht lesbar - das ist die strengste
        // Form von "keine Zeile".
        if ((fehler as { code?: string }).code !== '42501') {
          tabellenBefunde.push({ gegenstand: tabelle, ergebnis: (fehler as Error).message });
        }
      }
      await client.query('rollback to savepoint probe');
    }

    for (const funktion of alleFunktionen) {
      if (funktion.name in AUSNAHMEN) continue;
      await client.query('savepoint probe');
      try {
        const { rows } = await client.query(funktion.aufruf);
        const werte = rows.flatMap((zeile: Record<string, unknown>) => Object.values(zeile));
        const verraten = werte.filter((wert) => !istLeer(wert));
        if (verraten.length > 0) {
          funktionsBefunde.push({
            gegenstand: funktion.name,
            ergebnis: `liefert ${JSON.stringify(verraten).slice(0, 120)}`,
          });
        }
      } catch (fehler) {
        const code = (fehler as { code?: string }).code;
        if (code !== '42501') {
          funktionsBefunde.push({
            gegenstand: funktion.name,
            ergebnis: `${code}: ${(fehler as Error).message}`,
          });
        }
      }
      await client.query('rollback to savepoint probe');
    }
    await client.query('rollback');
  } finally {
    await client.end();
  }
  return {
    tabellen: tabellenBefunde,
    funktionen: funktionsBefunde,
    geprueft: alleTabellen.length + alleFunktionen.length,
  };
}

/** Ein Konto beim Anmeldedienst ohne Profil und ohne Rolle. */
const OHNE_PROFIL = '99999999-9999-4999-8999-000000000001';

describe('Abschottung der Praxis gegen Plattformkonten (ADR-023 Punkt 21)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await asPostgres(
      `insert into auth.users (id, aud, role, email)
       values ($1, 'authenticated', 'authenticated', 'ohne.profil@patient.invalid')`,
      [OHNE_PROFIL],
    );
  }, 120_000);

  it('zeigt einem Konto ohne Profil keine Zeile und weist jeden Aufruf ab', async () => {
    const befund = await pruefe(OHNE_PROFIL, true);
    expect(befund.tabellen).toEqual([]);
    expect(befund.funktionen).toEqual([]);
    // Eine Probe, die nichts prüft, wäre grün, ohne etwas zu sagen.
    expect(befund.geprueft).toBeGreaterThan(300);
  }, 120_000);

  it('zeigt einem Konto mit Profil, aber ohne Praxisrolle keine Zeile (Punkt 20)', async () => {
    // Bis POR-001 las dieses Konto über den Selbstzugriff seine eigene Akte,
    // Person und Anschrift. Das eigene Profil ist die eine Ausnahme: Ohne es
    // könnte die Anwendung "gesperrt" nicht von "nie eingerichtet"
    // unterscheiden (STAFF-003).
    const befund = await pruefe(SEED.users.patientMax, false);
    expect(befund.tabellen).toEqual([{ gegenstand: 'public.user_profiles', ergebnis: '1 Zeilen' }]);
  }, 120_000);

  it('führt keine Zeile in user_roles mit der Rolle patient (Punkt 3)', async () => {
    const { rows } = await asPostgres(`select 1 from public.user_roles where role_key = 'patient'`);
    expect(rows).toEqual([]);
    await expect(
      asPostgres(
        `insert into public.user_roles (user_id, organization_id, role_key) values ($1, $2, 'patient')`,
        [SEED.users.patientMax, SEED.organizationId],
      ),
    ).rejects.toThrow(/user_roles_no_patient_role/);
  });

  it('nennt nur Ausnahmen, die es gibt', async () => {
    const vorhanden = new Set((await funktionen()).map((f) => f.name));
    expect(Object.keys(AUSNAHMEN).filter((name) => !vorhanden.has(name))).toEqual([]);
  });
});
