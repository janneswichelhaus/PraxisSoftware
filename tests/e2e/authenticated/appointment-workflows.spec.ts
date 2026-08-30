import { expect, test } from '@playwright/test';
import {
  arbeitszeitBestaetigen,
  KONTEN,
  PATIENTEN,
  anmelden,
  detailWert,
  direktesEinfuegenVersuchen,
  rpcAufrufen,
  terminUeberApi,
  zugriffstoken,
} from './helpers';

/**
 * Echter Kernfluss der Terminanlage hinter der Anmeldung (CAL-001).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL. Nichts ist
 * gestubbt; ein grüner Lauf belegt den vollständigen Pfad einschließlich
 * Zeitzonenumrechnung, Überschneidungsschutz und RLS.
 *
 * Ein angelegter Termin lässt sich in diesem Stand fachlich nicht wieder
 * entfernen - Absagen kommt erst mit CAL-003, und ein physisches Löschen soll
 * es bewusst nie geben. Damit ein wiederholter Lauf denselben Ausgangspunkt
 * vorfindet, belegt jeder Lauf einen eigenen, kollisionsfreien Zeitraum.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Kalendertag weit in der Zukunft, je Lauf verschieden. */
function laufTag(versatz = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60 + (LAUF % 200) + versatz);
  return d.toISOString().slice(0, 10);
}

/** Uhrzeit innerhalb der Praxiszeiten, je Lauf verschieden. */
function laufZeit(offsetMinuten = 0): string {
  const start = 8 * 60 + (LAUF % 120) + offsetMinuten;
  const h = String(Math.floor(start / 60)).padStart(2, '0');
  const m = String(start % 60).padStart(2, '0');
  return `${h}:${m}`;
}

const TAG = laufTag();
const BEGINN = laufZeit();
const ENDE = laufZeit(45);

test.describe('CAL-001: Termin anlegen', () => {
  test('legt einen Praxistermin an, der das Neuladen überlebt', async ({ page }) => {
    await anmelden(page, KONTEN.office);

    // Einstieg aus der Akte - der Patient ist damit vorausgewählt.
    await page.goto(`/patienten/${PATIENTEN.max}`);
    await expect(page.getByRole('heading', { name: 'Max Mustermann' })).toBeVisible();

    await page.getByRole('link', { name: 'Termin anlegen' }).click();
    await expect(page.getByRole('heading', { name: 'Termin anlegen' })).toBeVisible();

    // Der Patient steht als Kontext und ist nicht wechselbar. exact grenzt das
    // Kontextfeld gegen die Seitenbeschreibung ab, die den Namen ebenfalls nennt.
    await expect(page.getByText('Max Mustermann', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Patient:in')).toHaveCount(0);

    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
    await page.getByLabel('Terminart *').selectOption('practice');
    await page.getByLabel('Datum *').fill(TAG);
    await page.getByLabel('Beginn *').fill(BEGINN);
    await page.getByLabel('Ende *').fill(ENDE);
    // Bei genau einem Standort ist er vorausgewählt.
    await expect(page.getByLabel('Standort *')).toHaveValue(/.+/);

    await page.getByRole('button', { name: 'Termin anlegen' }).click();
    await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);

    // Erfolg: Wechsel in die Detailansicht des neuen Termins.
    await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: /Termin – Max Mustermann/ })).toBeVisible();

    await expect(detailWert(page, 'Behandelnde Person')).toContainText('Anna Beispiel');
    await expect(detailWert(page, 'Art')).toContainText('Praxis');
    await expect(detailWert(page, 'Status')).toContainText('Geplant');
    await expect(detailWert(page, 'Zeit')).toContainText(`${BEGINN}–${ENDE}`);
    await expect(detailWert(page, 'Standort')).toContainText('Hauptstandort');

    // Nach dem Neuladen weiterhin sichtbar - der Termin kommt aus der
    // Datenbank und nicht aus dem Zustand der Anwendung.
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(detailWert(page, 'Status')).toContainText('Geplant');
    await expect(detailWert(page, 'Zeit')).toContainText(`${BEGINN}–${ENDE}`);
  });

  test('hält die Uhrzeit in der Praxiszeitzone fest, nicht in UTC', async ({ page, request }) => {
    await anmelden(page, KONTEN.office);

    await page.goto(`/patienten/${PATIENTEN.erika}/termine/neu`);
    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Tim Teamleitung' });
    await page.getByLabel('Terminart *').selectOption('video');
    await page.getByLabel('Datum *').fill(TAG);
    await page.getByLabel('Beginn *').fill(BEGINN);
    await page.getByLabel('Ende *').fill(ENDE);
    await page.getByRole('button', { name: 'Termin anlegen' }).click();
    await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);

    await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
    const appointmentId = page.url().split('/').pop()!;

    // Die Oberfläche zeigt die Ortszeit …
    await expect(detailWert(page, 'Zeit')).toContainText(`${BEGINN}–${ENDE}`);

    // … und die Datenbank hält denselben Moment als timestamptz mit Zonenbezug.
    const token = await zugriffstoken(request, KONTEN.office);
    const termin = await terminUeberApi(request, token, appointmentId);
    expect(termin, 'Termin über den regulären Lesepfad').not.toBeNull();

    const gespeichert = new Date(termin!.starts_at as string);
    const alsOrtszeit = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    }).format(gespeichert);
    expect(alsOrtszeit).toBe(BEGINN);
  });

  test('verhindert eine Überschneidung derselben behandelnden Person', async ({ page }) => {
    await anmelden(page, KONTEN.office);

    // Derselbe Zeitraum und dieselbe Person wie im ersten Test.
    await page.goto(`/patienten/${PATIENTEN.erika}/termine/neu`);
    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
    await page.getByLabel('Terminart *').selectOption('video');
    await page.getByLabel('Datum *').fill(TAG);
    await page.getByLabel('Beginn *').fill(laufZeit(15));
    await page.getByLabel('Ende *').fill(laufZeit(60));
    await page.getByRole('button', { name: 'Termin anlegen' }).click();
    await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);

    // Verständliche Meldung, kein Wechsel in eine Detailansicht.
    await expect(page.getByText(/hat die behandelnde Person bereits einen Termin/)).toBeVisible();
    await expect(page).toHaveURL(/\/termine\/neu$/);
  });

  test('erlaubt einen direkt angrenzenden Termin', async ({ page }) => {
    await anmelden(page, KONTEN.office);

    await page.goto(`/patienten/${PATIENTEN.erika}/termine/neu`);
    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
    await page.getByLabel('Terminart *').selectOption('home_visit');
    await page.getByLabel('Datum *').fill(TAG);
    // Beginnt exakt zum Ende des ersten Termins - halboffenes Intervall.
    await page.getByLabel('Beginn *').fill(ENDE);
    await page.getByLabel('Ende *').fill(laufZeit(90));

    // Die Adresse wird aus den Stammdaten übernommen und nicht erfragt.
    await expect(page.getByText('Adresse des Hausbesuchs')).toBeVisible();

    await page.getByRole('button', { name: 'Termin anlegen' }).click();
    await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);

    await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
    await expect(detailWert(page, 'Art')).toContainText('Hausbesuch');
    await expect(detailWert(page, 'Anschrift')).toContainText('Testweg');
  });
});

test.describe('CAL-001: Autorisierung am Server, nicht in der Oberfläche', () => {
  test('weist ein Patientenkonto an der RPC ab', async ({ request }) => {
    const token = await zugriffstoken(request, 'max.mustermann@patient.invalid');

    const antwort = await rpcAufrufen(request, token, 'create_appointment', {
      p_patient_id: PATIENTEN.max,
      p_staff_member_id: '55555555-5555-4555-8555-000000000002',
      p_appointment_type: 'video',
      p_date: laufTag(5),
      p_start_time: '09:00',
      p_end_time: '10:00',
      p_location_id: null,
    });

    // Nicht 200: die ausgeblendete Schaltfläche ist ausdrücklich nicht der
    // Nachweis - der Server entscheidet.
    expect(antwort.status()).toBe(403);
  });

  test('weist ein direktes Tabellen-INSERT ab, auch für berechtigte Rollen', async ({
    request,
  }) => {
    const token = await zugriffstoken(request, KONTEN.office);

    const antwort = await direktesEinfuegenVersuchen(request, token, {
      organization_id: '22222222-2222-4222-8222-000000000001',
      patient_id: PATIENTEN.max,
      staff_member_id: '55555555-5555-4555-8555-000000000002',
      appointment_type: 'video',
      status: 'scheduled',
      starts_at: '2027-05-12T07:00:00Z',
      ends_at: '2027-05-12T08:00:00Z',
    });

    expect(antwort.status(), 'kein direktes Schreibrecht auf appointments').toBeGreaterThanOrEqual(
      400,
    );
  });

  test('zeigt einem Patientenkonto keine Termine der Praxis', async ({ request }) => {
    const token = await zugriffstoken(request, 'max.mustermann@patient.invalid');
    const { url, anonKey } = await import('./helpers').then((m) => m.supabaseKonfiguration());

    const antwort = await request.get(`${url}/rest/v1/appointment_directory?select=id`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });

    expect(antwort.status()).toBe(200);
    expect(await antwort.json()).toEqual([]);
  });
});
