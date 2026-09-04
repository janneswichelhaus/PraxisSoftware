import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  KONTEN,
  MITARBEITENDE,
  PATIENTEN,
  anmelden,
  detailWert,
  rpcAufrufen,
  supabaseKonfiguration,
  zugriffstoken,
} from './helpers';

/**
 * Echte Kernflüsse der Mitarbeiterverwaltung (STAFF-001).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Geprüft werden die fachlichen Zusagen des Loops und - wichtiger -
 * dass die Oberfläche keine Zugriffskontrolle ist: die entscheidenden
 * Negativfälle laufen direkt gegen die RPC, also an der Oberfläche vorbei.
 *
 * Ausschließlich synthetische Seed-Konten und -Daten
 * (PROJECT_PRINCIPLES.md 3.1).
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Eigener Namensraum je Lauf: Mitarbeiterdatensätze werden nicht gelöscht. */
function name(suffix: string): string {
  return `Lauf${LAUF % 100000}${suffix}`;
}

/** Bewusst ein anderer Tagesbereich als in den übrigen Spezifikationen. */
function laufTag(versatz = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 700 + (LAUF % 120) + versatz);
  return d.toISOString().slice(0, 10);
}

async function anlegenUeberOberflaeche(page: Page, vorname: string): Promise<string> {
  await page.goto('/praxis/team/neu');
  await page.getByLabel('Vorname *').fill(vorname);
  await page.getByLabel('Nachname *').fill('Testperson');
  await page.getByLabel('Dienstliche E-Mail').fill(`${vorname.toLowerCase()}@praxis.invalid`);
  await page.getByRole('button', { name: 'Mitarbeiter:in anlegen' }).click();
  await expect(page).toHaveURL(/\/praxis\/team\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

/** Stellt sicher, dass die geseedete Therapeutin am Ende wieder aktiv ist. */
async function annaReaktivieren(request: APIRequestContext): Promise<void> {
  const token = await zugriffstoken(request, KONTEN.owner);
  await rpcAufrufen(request, token, 'set_staff_employment_status', {
    p_staff_member_id: MITARBEITENDE.anna,
    p_status: 'active',
    p_acknowledge_future_appointments: true,
  });
}

test.afterAll(async ({ request }) => {
  await annaReaktivieren(request);
});

test.describe('STAFF-001: Anlegen und Bearbeiten', () => {
  test('legt eine Mitarbeiterin an, ohne einen Zugang zu erzeugen', async ({ page, request }) => {
    const vorname = name('Neu');
    await anmelden(page, KONTEN.owner);
    const staffId = await anlegenUeberOberflaeche(page, vorname);

    await expect(page.getByRole('heading', { name: `${vorname} Testperson` })).toBeVisible();
    await expect(detailWert(page, 'Beschäftigung')).toHaveText('Aktiv');

    // Sie steht in der Liste …
    await page.goto('/praxis/team');
    // Der Name stammt aus laufTag/name() dieser Datei, nicht aus einer Eingabe.
    // eslint-disable-next-line security/detect-non-literal-regexp
    await expect(page.getByRole('link', { name: new RegExp(vorname) })).toBeVisible();

    // … ist aber ohne eigenen Zugang mit therapeutischer Rolle nicht als
    // behandelnde Person zuordenbar. Das ist die bestehende Regel aus CAL-001.
    const token = await zugriffstoken(request, KONTEN.owner);
    const antwort = await rpcAufrufen(request, token, 'list_assignable_therapists', {});
    expect(antwort.status()).toBe(200);
    const zuordenbar = (await antwort.json()) as { staff_member_id: string }[];
    expect(zuordenbar.map((z) => z.staff_member_id)).not.toContain(staffId);
  });

  test('ändert die Stammdaten und zeigt sie danach an', async ({ page }) => {
    const vorname = name('Aendern');
    await anmelden(page, KONTEN.owner);
    await anlegenUeberOberflaeche(page, vorname);

    await page.getByRole('link', { name: 'Stammdaten bearbeiten' }).click();
    await page.getByLabel('Diensttelefon').fill('+49 7071 4711');
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();

    await expect(page).toHaveURL(/\/praxis\/team\/[0-9a-f-]{36}$/);
    await expect(detailWert(page, 'Diensttelefon')).toHaveText('+49 7071 4711');
  });
});

test.describe('STAFF-001: Deaktivieren und Reaktivieren', () => {
  test('deaktiviert ohne offene Termine und reaktiviert wieder', async ({ page }) => {
    const vorname = name('Status');
    await anmelden(page, KONTEN.owner);
    await anlegenUeberOberflaeche(page, vorname);

    await page.getByRole('button', { name: 'Als inaktiv führen' }).click();
    await page.getByRole('button', { name: 'Als inaktiv führen' }).click();
    await expect(detailWert(page, 'Beschäftigung')).toHaveText('Inaktiv');

    await page.getByRole('button', { name: 'Wieder als aktiv führen' }).click();
    await page.getByRole('button', { name: 'Wieder als aktiv führen' }).click();
    await expect(detailWert(page, 'Beschäftigung')).toHaveText('Aktiv');
  });

  test('zeigt vor der Deaktivierung die offenen zukünftigen Termine', async ({ page, request }) => {
    const token = await zugriffstoken(request, KONTEN.owner);

    // Ein zukünftiger Termin der geseedeten Therapeutin - über die RPC, damit
    // dieser Test die Terminmaske nicht mitprüft.
    const angelegt = await rpcAufrufen(request, token, 'create_appointment', {
      p_patient_id: PATIENTEN.max,
      p_staff_member_id: MITARBEITENDE.anna,
      p_appointment_type: 'video',
      p_date: laufTag(),
      p_start_time: '10:00',
      p_end_time: '11:00',
      p_location_id: null,
      p_allow_outside_working_hours: true,
    });
    expect(angelegt.status(), 'Vorbereitung: Termin anlegen').toBe(200);
    const terminId = (await angelegt.json()) as string;

    await anmelden(page, KONTEN.owner);
    await page.goto(`/praxis/team/${MITARBEITENDE.anna}`);
    await page.getByRole('button', { name: 'Als inaktiv führen' }).click();
    await page.getByRole('button', { name: 'Als inaktiv führen' }).click();

    // Der Server hat abgewiesen und nichts geschrieben; die Oberfläche zeigt,
    // was offen ist - darunter der eben angelegte Termin. Andere
    // Spezifikationen desselben Laufs hinterlassen ebenfalls Termine für Anna
    // und Max, deshalb wird die Zeile über ihr Datum gefunden, nicht über den
    // Namen allein. Das Datum wird wie in der Oberfläche formatiert.
    await expect(
      page.getByText('Für diese Person sind noch Termine in der Zukunft geplant.'),
    ).toBeVisible();
    const datum = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' }).format(
      new Date(`${laufTag()}T12:00:00Z`),
    );
    const zeile = page
      .getByRole('listitem')
      .filter({ hasText: datum })
      .filter({ hasText: 'Max Mustermann · Video' });
    await expect(zeile.first()).toBeVisible();

    // Abbrechen lässt alles unverändert.
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(detailWert(page, 'Beschäftigung')).toHaveText('Aktiv');

    // Erst die ausdrückliche Bestätigung deaktiviert - und der Termin bleibt.
    await page.getByRole('button', { name: 'Als inaktiv führen' }).click();
    await page.getByRole('button', { name: 'Als inaktiv führen' }).click();
    await page.getByRole('button', { name: 'Trotz offener Termine deaktivieren' }).click();
    await expect(detailWert(page, 'Beschäftigung')).toHaveText('Inaktiv');

    await page.goto(`/termine/${terminId}`);
    await expect(detailWert(page, 'Status')).toHaveText('Geplant');

    await annaReaktivieren(request);
  });
});

test.describe('STAFF-001: Durchsetzung am Server', () => {
  test('weist eine Terminzuweisung an eine inaktive Person ab', async ({ request }) => {
    const ownerToken = await zugriffstoken(request, KONTEN.owner);
    const deaktiviert = await rpcAufrufen(request, ownerToken, 'set_staff_employment_status', {
      p_staff_member_id: MITARBEITENDE.anna,
      p_status: 'inactive',
      p_acknowledge_future_appointments: true,
    });
    expect(deaktiviert.status(), 'Vorbereitung: deaktivieren').toBe(200);

    const officeToken = await zugriffstoken(request, KONTEN.office);
    const versuch = await rpcAufrufen(request, officeToken, 'create_appointment', {
      p_patient_id: PATIENTEN.erika,
      p_staff_member_id: MITARBEITENDE.anna,
      p_appointment_type: 'video',
      p_date: laufTag(5),
      p_start_time: '10:00',
      p_end_time: '11:00',
      p_location_id: null,
      p_allow_outside_working_hours: true,
    });
    expect(versuch.status(), 'inaktive Person darf keinen neuen Termin bekommen').toBe(400);

    await annaReaktivieren(request);
  });

  test('verweigert office das Anlegen, obwohl die Liste lesbar ist', async ({ page, request }) => {
    // Erst die Oberfläche: office sieht die Liste, aber keine Schaltflächen.
    await anmelden(page, KONTEN.office);
    await page.goto('/praxis/team');
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mitarbeiter:in anlegen' })).toHaveCount(0);

    // Und dann an der Oberfläche vorbei: die ausgeblendete Schaltfläche ist
    // keine Zugriffskontrolle (ADR-004, PROJECT_PRINCIPLES.md 4.7).
    const token = await zugriffstoken(request, KONTEN.office);
    const anlegen = await rpcAufrufen(request, token, 'create_staff_member', {
      p_given_name: name('Verboten'),
      p_family_name: 'Testperson',
    });
    expect(anlegen.status(), 'office darf keine Mitarbeiterdatensätze anlegen').toBe(403);

    const status = await rpcAufrufen(request, token, 'set_staff_employment_status', {
      p_staff_member_id: MITARBEITENDE.anna,
      p_status: 'inactive',
      p_acknowledge_future_appointments: true,
    });
    expect(status.status(), 'office darf den Beschäftigungsstatus nicht wechseln').toBe(403);
  });

  test('liefert Privatangaben Dritter gar nicht erst aus', async ({ request }) => {
    const { url, anonKey } = supabaseKonfiguration();
    const token = await zugriffstoken(request, KONTEN.office);

    const antwort = await request.get(
      `${url}/rest/v1/staff_directory?select=id,given_name,private_email,date_of_birth&id=eq.${MITARBEITENDE.anna}`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
    );
    expect(antwort.status()).toBe(200);
    const zeilen = (await antwort.json()) as Record<string, unknown>[];
    expect(zeilen).toHaveLength(1);
    // Nicht ausgeliefert und im Client ausgeblendet, sondern gar nicht geliefert.
    expect(zeilen[0]!.private_email).toBeNull();
    expect(zeilen[0]!.date_of_birth).toBeNull();
  });
});
