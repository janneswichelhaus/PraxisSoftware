import { Client } from 'pg';
import { expect } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  jwtClaims,
  tagInTagen,
  testDatabaseUrl,
} from './db';

// Gemeinsames Werkzeug für die Prüffunktionen, die nur das AI Gateway fragt: Jede antwortet Ja
// oder Nein, schreibt bei einer Rolle ohne Recht `access.denied` und sonst nichts.

const { users, organizationId, patients, trainingRelationships } = SEED;

const ANNA = '55555555-5555-4555-8555-000000000002';
const TOM = '55555555-5555-4555-8555-000000000006';
const STANDORT = '33333333-3333-4333-8333-000000000001';

/** Weit voraus: Die Seed-Termine liegen heute, die Tests brauchen freie Zeit. */
const TAG = tagInTagen(75);

export interface TerminFelder {
  kind?: 'therapy' | 'training' | 'internal';
  status?: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  /** Stunde des Beginns - je Termin eine eigene, sonst greift der Überschneidungsschutz. */
  stunde: number;
  organisation?: 'eigene' | 'fremde';
  patient?: string;
}

/** Legt einen Termin unmittelbar an - ohne RPC, ohne Policy. */
export async function legeTerminAn({
  kind = 'therapy',
  status = 'confirmed',
  stunde,
  organisation = 'eigene',
  patient = patients.max,
}: TerminFelder): Promise<string> {
  const fremd = organisation === 'fremde';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, training_relationship_id, staff_member_id, location_id,
       appointment_type, kind, title, event_group_id, status, starts_at, ends_at,
       visit_street, visit_house_number, visit_postal_code, visit_city,
       completed_at, completed_by, cancelled_at, cancelled_by,
       no_show_recorded_at, no_show_recorded_by
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       ($11::date + make_time($12, 0, 0)) at time zone 'Europe/Berlin',
       ($11::date + make_time($12, 45, 0)) at time zone 'Europe/Berlin',
       $13, $14, $15, $16,
       case when $10 = 'completed' then now() end,
       case when $10 = 'completed' then $17::uuid end,
       case when $10 = 'cancelled' then now() end,
       case when $10 = 'cancelled' then $17::uuid end,
       case when $10 = 'no_show' then now() end,
       case when $10 = 'no_show' then $17::uuid end
     ) returning id`,
    [
      fremd ? FREMDE_ORGANISATION.organizationId : organizationId,
      kind === 'therapy' ? (fremd ? FREMDE_ORGANISATION.patient : patient) : null,
      kind === 'training' ? trainingRelationships.tina : null,
      fremd ? FREMDE_ORGANISATION.staffMember : kind === 'training' ? TOM : ANNA,
      fremd ? null : STANDORT,
      fremd ? 'home_visit' : 'practice',
      kind,
      kind === 'internal' ? 'Teambesprechung' : null,
      kind === 'internal' ? '77777777-7777-4777-8777-0000000000e1' : null,
      status,
      TAG,
      stunde,
      fremd ? 'Beispielweg' : null,
      fremd ? '3' : null,
      fremd ? '72070' : null,
      fremd ? 'Tuebingen' : null,
      fremd ? FREMDE_ORGANISATION.owner : users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/** Eine Prüffunktion mit ihrer Signatur und der Operation ihrer Abweisung. */
export interface Pruefpfad {
  /** `select public.<name>(…) as erlaubt` mit Platzhaltern. */
  readonly sql: string;
  /** `public.<name>(<Typen>)` für die Rechteprüfung. */
  readonly signatur: string;
  readonly name: string;
  readonly operation: string;
  /** Die Meldung, mit der ein Konto ohne Organisation abgewiesen wird. */
  readonly meldung: RegExp;
}

export async function gefragt(
  pfad: Pruefpfad,
  konto: string | null,
  argumente: readonly unknown[],
): Promise<boolean> {
  const { rows } = await asUser<{ erlaubt: boolean }>(konto, pfad.sql, [...argumente]);
  return rows[0]!.erlaubt;
}

/** Die Summe der Abweisungen eines Kontos unter dieser Operation (Zähler je Eintrag). */
async function abweisungen(konto: string, operation: string): Promise<number> {
  const { rows } = await asPostgres<{ summe: number }>(
    `select coalesce(sum(coalesce((context ->> 'count')::integer, 1)), 0)::integer as summe
       from public.audit_log
      where action = 'access.denied' and actor_user_id = $1 and context ->> 'operation' = $2`,
    [konto, operation],
  );
  return rows[0]!.summe;
}

export async function auditzeilen(): Promise<number> {
  const { rows } = await asPostgres<{ n: number }>(
    'select count(*)::integer as n from public.audit_log',
  );
  return rows[0]!.n;
}

/** Erlaubt, bestätigt und ohne eine einzige neue Zeile im Auditlog (ADR-010 Punkt 15). */
export async function erwarteErlaubtOhneSpur(
  pfad: Pruefpfad,
  konto: string,
  argumente: readonly unknown[],
): Promise<void> {
  const vorher = await auditzeilen();
  const { rows } = await asUserCommitted<{ erlaubt: boolean }>(konto, pfad.sql, [...argumente]);
  expect(rows[0]!.erlaubt).toBe(true);
  expect(await auditzeilen()).toBe(vorher);
}

/** Abgewiesen ohne Spur: Die Rolle stimmt, der Gegenstand nicht - kein Eintrag. */
export async function erwarteNeinOhneSpur(
  pfad: Pruefpfad,
  konto: string,
  argumente: readonly unknown[],
): Promise<void> {
  const vorher = await auditzeilen();
  const { rows } = await asUserCommitted<{ erlaubt: boolean }>(konto, pfad.sql, [...argumente]);
  expect(rows[0]!.erlaubt).toBe(false);
  expect(await auditzeilen()).toBe(vorher);
}

/**
 * Rolle ohne Recht: `false` und genau eine weitere Abweisung, die die bestätigte Transaktion
 * überlebt - an der Organisation, nie an einer Kennung aus dem Aufruf.
 */
export async function erwarteAbweisungMitEintrag(
  pfad: Pruefpfad,
  konto: string,
  argumente: readonly unknown[],
): Promise<void> {
  const vorher = await abweisungen(konto, pfad.operation);
  const { rows } = await asUserCommitted<{ erlaubt: boolean }>(konto, pfad.sql, [...argumente]);
  expect(rows[0]!.erlaubt).toBe(false);
  expect(await abweisungen(konto, pfad.operation)).toBe(vorher + 1);

  const { rows: eintraege } = await asPostgres<{
    subject_type: string;
    subject_id: string;
    context: Record<string, unknown>;
  }>(
    `select subject_type, subject_id, context from public.audit_log
      where action = 'access.denied' and actor_user_id = $1 and context ->> 'operation' = $2
      order by occurred_at, id`,
    [konto, pfad.operation],
  );
  const eintrag = eintraege.at(-1)!;
  expect(eintrag.subject_type).toBe('organization');
  expect(eintrag.subject_id).toBe(organizationId);
  expect(eintrag.context).toMatchObject({
    surface: 'api',
    reason: 'role',
    operation: pfad.operation,
  });
  for (const argument of argumente) {
    if (typeof argument === 'string') {
      expect(JSON.stringify(eintrag.context)).not.toContain(argument);
    }
  }
}

/** Ein Plattformkonto hat keine Organisation: abgewiesen mit 42501, nie ein Ergebnis. */
export async function erwartePlattformAbgewiesen(
  pfad: Pruefpfad,
  konto: string,
  argumente: readonly unknown[],
): Promise<void> {
  await expect(gefragt(pfad, konto, argumente)).rejects.toThrow(pfad.meldung);
}

/** Nicht angemeldet, ohne Konto im Token und mit gesperrter Sitzung (ADR-025 Punkt 6). */
export async function erwarteOhneSitzungAbgewiesen(
  pfad: Pruefpfad,
  konto: string,
  argumente: readonly unknown[],
): Promise<void> {
  await expect(asAnon(pfad.sql, [...argumente])).rejects.toThrow(/permission denied/i);
  await expect(gefragt(pfad, null, argumente)).rejects.toThrow(/not authenticated/);

  // Angemeldet vor zwei Stunden: Die Frist von 60 Minuten ist vorbei.
  const gesperrt = JSON.parse(jwtClaims(konto)) as Record<string, unknown>;
  gesperrt.amr = [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 7200 }];
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(gesperrt),
    ]);
    await expect(client.query(pfad.sql, [...argumente])).rejects.toThrow(pfad.meldung);
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

/** Nur `authenticated` führt aus; SECURITY DEFINER mit leerem `search_path`, nicht STABLE. */
export async function erwartePrueffunktion(pfad: Pruefpfad): Promise<void> {
  const { rows: rechte } = await asPostgres<{ anon: boolean; angemeldet: boolean }>(
    `select has_function_privilege('anon', $1, 'execute') as anon,
            has_function_privilege('authenticated', $1, 'execute') as angemeldet`,
    [pfad.signatur],
  );
  expect(rechte[0]).toEqual({ anon: false, angemeldet: true });

  const { rows } = await asPostgres<{
    prosecdef: boolean;
    proconfig: string[] | null;
    provolatile: string;
  }>(
    `select p.prosecdef, p.proconfig, p.provolatile
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [pfad.name],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]!.prosecdef).toBe(true);
  expect(rows[0]!.proconfig).toContain('search_path=""');
  // Der Abweisungseintrag ist ein Schreibvorgang.
  expect(rows[0]!.provolatile).toBe('v');
}
