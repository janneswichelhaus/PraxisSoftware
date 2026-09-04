import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from '@playwright/test';

/**
 * Hilfsfunktionen für die echten Abläufe hinter der Anmeldung.
 *
 * Diese Tests sprechen ausschließlich mit einem lokalen beziehungsweise in CI
 * gestarteten Supabase-Stack: Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC
 * → PostgreSQL. Es wird nichts gestubbt; ein grüner Lauf belegt damit den
 * vollständigen Pfad und nicht nur die Oberfläche.
 *
 * Es werden ausschließlich synthetische Seed-Konten und Seed-Patienten
 * verwendet (PROJECT_PRINCIPLES.md 3.1). Der `service_role`-Schlüssel kommt
 * hier bewusst nirgends vor - alle Zugriffe laufen mit dem öffentlichen anon
 * key und einem echten Benutzertoken, also genau mit den Rechten, die eine
 * angemeldete Person tatsächlich hat.
 */

/**
 * Entwicklungskennwort der lokalen Wegwerf-Instanz aus `supabase/seed.sql`.
 * Kein Secret im Sinne von PROJECT_PRINCIPLES.md 3.3 - es öffnet ausschließlich
 * synthetische Konten in einer Datenbank ohne reale Daten.
 */
export const TESTKENNWORT = 'LokalerTestzugang!2026';

/** Synthetische Seed-Konten (siehe docs/DEVELOPMENT.md, "Testkonten"). */
export const KONTEN = {
  /** owner - einzige Rolle, die Mitarbeiterdatensätze verwalten darf (STAFF-001). */
  owner: 'jannes.test@praxis.invalid',
  /** office - darf Stammdaten ändern und den Versorgungsstatus wechseln. */
  office: 'olivia.office@praxis.invalid',
  /** therapist - darf die Akte lesen, aber den Status NICHT wechseln. */
  therapist: 'anna.beispiel@praxis.invalid',
} as const;

/** Feste Mitarbeiter-IDs aus `supabase/seed.sql` - rein synthetisch. */
export const MITARBEITENDE = {
  /** Anna Beispiel - therapist, im Seed aktiv und zuordenbar. */
  anna: '55555555-5555-4555-8555-000000000002',
  /** Olivia Office - office, im Seed aktiv, aber nicht zuordenbar. */
  olivia: '55555555-5555-4555-8555-000000000003',
} as const;

/** Feste Patienten-IDs aus `supabase/seed.sql` - rein synthetisch. */
export const PATIENTEN = {
  /** Max Mustermann, im Seed aktiv. */
  max: '66666666-6666-4666-8666-000000000001',
  /** Erika Beispiel, im Seed aktiv, Ort "Tuebingen". */
  erika: '66666666-6666-4666-8666-000000000002',
} as const;

interface SupabaseKonfiguration {
  url: string;
  anonKey: string;
}

/**
 * Verbindungswerte der lokalen Instanz. Sie stehen niemals im Repository,
 * sondern kommen aus `supabase status` (siehe docs/DEVELOPMENT.md).
 */
export function supabaseKonfiguration(): SupabaseKonfiguration {
  const url = process.env.E2E_SUPABASE_URL;
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'E2E_SUPABASE_URL und E2E_SUPABASE_ANON_KEY fehlen. Siehe docs/DEVELOPMENT.md.',
    );
  }
  return { url, anonKey };
}

/** Meldet über die echte Anmeldemaske an - GoTrue, kein Stub. */
export async function anmelden(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail-Adresse').fill(email);
  // exact grenzt das Feld gegen den Sichtbar-Schalter ab.
  await page.getByLabel('Kennwort', { exact: true }).fill(TESTKENNWORT);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('button', { name: 'Abmelden' })).toBeVisible();
}

/**
 * Bestätigt die Rückfrage „Außerhalb der Arbeitszeit", falls sie erscheint.
 *
 * Seit CAL-005 hinterlegt der Seed einen Wochenplan (Montag bis Freitag,
 * 08:00-12:00 und 13:00-18:00). Die Spezifikationen ausserhalb von CAL-005
 * pruefen andere Zusagen - Anlegen, Kalender, Bearbeiten, Abschliessen - und
 * benutzen dafuer Zeiten ueber den ganzen Tag und Kalendertage, die auch auf
 * ein Wochenende fallen koennen. Ob ein Zeitraum in der Arbeitszeit liegt, ist
 * dort nicht die Frage; die Rueckfrage selbst hat eigene Tests in
 * scheduling-workflows.spec.ts.
 *
 * Bewusst kein blindes Warten: es wird auf genau eines von beidem gewartet -
 * den erwarteten Folgezustand oder die Rueckfrage.
 */
export async function arbeitszeitBestaetigen(
  page: Page,
  knopf: 'Termin trotzdem anlegen' | 'Änderung trotzdem speichern',
  weiter: RegExp,
): Promise<void> {
  const rueckfrage = page.getByRole('group', { name: 'Außerhalb der Arbeitszeit' });

  // Kurzes Fenster: die Antwort des Servers kommt lokal in Millisekunden.
  // Tritt weder der Folgezustand noch die Rueckfrage ein, ist der Vorgang aus
  // einem anderen Grund abgewiesen worden - das prueft der Test danach selbst.
  await Promise.race([
    page.waitForURL(weiter, { timeout: 5_000 }),
    rueckfrage.waitFor({ state: 'visible', timeout: 5_000 }),
  ]).catch(() => undefined);

  if (await rueckfrage.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: knopf }).click();
  }
}

/**
 * Die Kachel EINES bestimmten Termins im Kalender.
 *
 * Bewusst ueber die Zieladresse und nicht ueber den Patientennamen: alle
 * Ablaeufe nutzen denselben synthetischen Patienten, und ein Kalendertag kann
 * mehrere seiner Termine tragen - etwa nach einem Wiederholungslauf. Ein
 * Namensfilter traf dann zwei Kacheln und brach im Strict Mode ab.
 */
export function terminKachel(page: Page, appointmentId: string): Locator {
  return page.locator(`a[href="/termine/${appointmentId}"]`);
}

/** Wert einer Zeile der Detailansicht, adressiert über ihre Beschriftung. */
export function detailWert(page: Page, bezeichnung: string): Locator {
  return page.locator('dl > div').filter({ hasText: bezeichnung }).locator('dd');
}

/** Holt ein echtes Zugriffstoken bei GoTrue - Grundlage der RPC-Nachweise. */
export async function zugriffstoken(request: APIRequestContext, email: string): Promise<string> {
  const { url, anonKey } = supabaseKonfiguration();
  const antwort = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: { email, password: TESTKENNWORT },
  });
  expect(antwort.status(), 'Anmeldung des synthetischen Testkontos').toBe(200);
  const { access_token: token } = (await antwort.json()) as { access_token?: string };
  if (!token) throw new Error('GoTrue lieferte kein Zugriffstoken.');
  return token;
}

function autorisiert(token: string): Record<string, string> {
  const { anonKey } = supabaseKonfiguration();
  return { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** Ruft eine RPC über PostgREST mit einem echten Benutzertoken auf. */
export function rpcAufrufen(
  request: APIRequestContext,
  token: string,
  name: string,
  argumente: Record<string, unknown>,
): Promise<APIResponse> {
  const { url } = supabaseKonfiguration();
  return request.post(`${url}/rest/v1/rpc/${name}`, {
    headers: autorisiert(token),
    data: argumente,
  });
}

/** Liest den Status eines Patienten über den regulären Lesepfad. */
export async function statusUeberApi(
  request: APIRequestContext,
  token: string,
  patientId: string,
): Promise<string> {
  const { url } = supabaseKonfiguration();
  const antwort = await request.get(
    `${url}/rest/v1/patient_directory?select=id,status&id=eq.${patientId}`,
    { headers: autorisiert(token) },
  );
  expect(antwort.status(), 'Lesen der Akte').toBe(200);
  const zeilen = (await antwort.json()) as { id: string; status: string }[];
  expect(zeilen, 'genau eine Akte').toHaveLength(1);
  return zeilen[0]!.status;
}

/** Versucht ein direktes Tabellenupdate am Fachvorgang vorbei. */
export function direktesUpdateVersuchen(
  request: APIRequestContext,
  token: string,
  patientId: string,
  status: string,
): Promise<APIResponse> {
  const { url } = supabaseKonfiguration();
  return request.patch(`${url}/rest/v1/patients?id=eq.${patientId}`, {
    headers: autorisiert(token),
    data: { status },
  });
}

/** Versucht, einen Termin direkt in die Tabelle zu schreiben - am Fachvorgang vorbei. */
export function direktesEinfuegenVersuchen(
  request: APIRequestContext,
  token: string,
  zeile: Record<string, unknown>,
): Promise<APIResponse> {
  const { url } = supabaseKonfiguration();
  return request.post(`${url}/rest/v1/appointments`, {
    headers: autorisiert(token),
    data: zeile,
  });
}

/** Liest einen Termin über den regulären Lesepfad. */
export async function terminUeberApi(
  request: APIRequestContext,
  token: string,
  appointmentId: string,
): Promise<Record<string, unknown> | null> {
  const { url } = supabaseKonfiguration();
  const antwort = await request.get(
    `${url}/rest/v1/appointment_directory?select=id,status,appointment_type,starts_at,ends_at&id=eq.${appointmentId}`,
    { headers: autorisiert(token) },
  );
  expect(antwort.status(), 'Lesen des Termins').toBe(200);
  const zeilen = (await antwort.json()) as Record<string, unknown>[];
  return zeilen[0] ?? null;
}
