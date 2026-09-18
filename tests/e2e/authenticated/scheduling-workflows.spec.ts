import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  laufTagImFenster,
  supabaseKonfiguration,
  zugriffstoken,
} from './helpers';

/**
 * Praxisraster und Arbeitszeiten im echten Ablauf (CAL-005).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Der Seed hinterlegt Montag bis Freitag 08:00-12:00 und 13:00-18:00
 * für die behandelnden Personen; Samstag und Sonntag sind bewusst leer.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Nächster Kalendertag mit dem gewünschten ISO-Wochentag, weit in der Zukunft. */
function naechster(isoWochentag: number, versatzWochen = 0): string {
  // Startpunkt aus dem eigenen Tagesfenster dieser Spezifikation (helpers.ts);
  // die Ausrichtung auf den Wochentag schiebt hoechstens sechs Tage weiter und
  // bleibt damit in der Reserve des Fensters.
  const d = laufTagImFenster(TAGESFENSTER.scheduling, LAUF, versatzWochen * 7);
  while (((d.getUTCDay() + 6) % 7) + 1 !== isoWochentag) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/** Volle Stunde innerhalb der Seed-Arbeitszeit, je Lauf eine andere. */
function innen(versatz = 0): string {
  const stunde = 8 + ((LAUF + versatz) % 4);
  return `${String(stunde).padStart(2, '0')}:00`;
}

async function terminFormular(
  page: Page,
  opts: { tag: string; von: string; bis: string; person?: string },
) {
  await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
  await page
    .getByLabel('Behandelnde Person *')
    .selectOption({ label: opts.person ?? 'Anna Beispiel' });
  await page.getByLabel('Terminart *').selectOption('video');
  await page.getByLabel('Datum *').fill(opts.tag);
  await page.getByLabel('Beginn *').fill(opts.von);
  // Das Ende ist seit CAL-010a eine Ableitung aus dem Beginn (8.1) und kein
  // Feld mehr. Geprueft wird es trotzdem - sonst waere `bis` nur noch Zierde.
  await expect(page.getByText(`${opts.bis} Uhr`)).toBeVisible();
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
}

test.describe('CAL-005: Praxisraster', () => {
  test('zeigt die Rastereinstellung nur owner', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await page.goto('/praxis/planung');
    await expect(page.getByRole('heading', { name: 'Wochenplan' })).toBeVisible();
    await expect(page.getByLabel('Minutenraster')).toHaveCount(0);
  });

  test('laesst office das Praxisraster nicht setzen', async ({ request }) => {
    // Die Oberflaeche blendet die Einstellung aus; verbindlich ist der Server.
    const token = await zugriffstoken(request, KONTEN.office);
    const { url, anonKey } = supabaseKonfiguration();

    const antwort = await request.post(`${url}/rest/v1/rpc/set_appointment_grid`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { p_minutes: 15 },
    });
    // office darf das Raster nicht setzen.
    expect(antwort.status()).toBe(403);
  });

  test('setzt das Feld "Beginn" auf die Schrittweite der Praxis', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
    // Der Seed startet bei 5 Minuten - also 300 Sekunden.
    await expect(page.getByLabel('Beginn *')).toHaveAttribute('step', '300');

    // Das Ende ist seit CAL-010a kein Feld mehr, sondern eine Ableitung aus
    // dem Beginn: 8.1 legt die Laenge fest, und ein beschreibbares Ende waere
    // eine Falle.
    await expect(page.getByLabel('Ende *')).toHaveCount(0);
    await page.getByLabel('Beginn *').fill('09:05');
    await expect(page.getByText('Ende: 10:05 Uhr')).toBeVisible();

    // Die Regellaengen 60 (vorbelegt) und 45 bleiben der kurze Weg; seit
    // CAL-020 (8.1 in der Fassung 0.11) oeffnet "Andere Laenge" ein Minutenfeld
    // in der Schrittweite des Rasters. Das Ende steht als Hinweis daran.
    const dauer = page.getByLabel('Dauer');
    await expect(dauer).toHaveValue('60');
    await expect(dauer.getByRole('option')).toHaveText([
      '60 Minuten',
      '45 Minuten',
      'Andere Länge …',
    ]);

    await dauer.selectOption('45');
    await expect(page.getByText('Ende: 09:50 Uhr')).toBeVisible();

    await dauer.selectOption('frei');
    const laenge = page.getByLabel('Länge in Minuten');
    await expect(laenge).toHaveAttribute('step', '5');
    await laenge.fill('30');
    await expect(page.getByText('Ende: 09:35 Uhr')).toBeVisible();
    await expect(page.getByText(/Weicht von 45 und 60 Minuten ab/)).toBeVisible();
  });
});

test.describe('CAL-005: Arbeitszeiten', () => {
  test('zeigt den Wochenplan aus dem Seed', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await page.goto('/praxis/planung');

    await expect(page.getByRole('heading', { name: 'Wochenplan' })).toBeVisible();
    await expect(page.getByText('08:00–12:00, 13:00–18:00').first()).toBeVisible();
  });

  test('laesst therapist lesen, aber nicht pflegen', async ({ page }) => {
    await anmelden(page, KONTEN.therapist);
    await page.goto('/praxis/planung');

    await expect(page.getByText('08:00–12:00, 13:00–18:00').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Montag speichern' })).toHaveCount(0);
    await expect(page.getByText(/fehlt Ihrem Zugang die Berechtigung/)).toBeVisible();
  });

  test('weist therapist auch an der Schnittstelle ab', async ({ request }) => {
    const token = await zugriffstoken(request, KONTEN.therapist);
    const { url, anonKey } = supabaseKonfiguration();

    const antwort = await request.post(`${url}/rest/v1/rpc/set_staff_working_hours`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        p_staff_member_id: '55555555-5555-4555-8555-000000000002',
        p_weekday: 1,
        p_blocks: [{ von: '08:00', bis: '12:00' }],
      },
    });
    expect(antwort.status()).toBe(403);
  });

  test('gibt einem Patientenkonto keine Arbeitszeiten', async ({ request }) => {
    const token = await zugriffstoken(request, 'max.mustermann@patient.invalid');
    const { url, anonKey } = supabaseKonfiguration();

    const antwort = await request.get(`${url}/rest/v1/staff_working_hours?select=id`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    expect(antwort.status()).toBe(200);
    expect(await antwort.json()).toEqual([]);
  });
});

test.describe('CAL-005: Rueckfrage ausserhalb der Arbeitszeit', () => {
  test('legt einen Termin innerhalb der Arbeitszeit ohne Rueckfrage an', async ({ page }) => {
    const tag = naechster(3);
    const von = innen();
    const bis = `${String(Number(von.slice(0, 2)) + 1).padStart(2, '0')}:00`;

    await anmelden(page, KONTEN.office);
    await terminFormular(page, { tag, von, bis });

    await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('group', { name: 'Außerhalb der Arbeitszeit' })).toHaveCount(0);
  });

  test('fragt bei einer Randzeit nach und legt zunaechst nichts an', async ({ page }) => {
    const tag = naechster(3, 1);

    await anmelden(page, KONTEN.office);
    await terminFormular(page, { tag, von: '19:00', bis: '20:00' });

    const rueckfrage = page.getByRole('group', { name: 'Außerhalb der Arbeitszeit' });
    await expect(rueckfrage).toBeVisible();
    await expect(rueckfrage).toContainText(/noch nicht gespeichert/);
    // Kein Wechsel in die Detailansicht: es wurde nichts geschrieben.
    await expect(page).toHaveURL(/\/termine\/neu$/);
  });

  test('legt den Termin nach ausdruecklicher Bestaetigung an', async ({ page }) => {
    const tag = naechster(3, 2);

    await anmelden(page, KONTEN.office);
    await terminFormular(page, { tag, von: '19:00', bis: '20:00' });
    await expect(page.getByRole('group', { name: 'Außerhalb der Arbeitszeit' })).toBeVisible();

    await page.getByRole('button', { name: 'Termin trotzdem anlegen' }).click();
    await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
  });

  test('fragt an einem Tag ohne hinterlegte Arbeitszeit ebenfalls nach', async ({ page }) => {
    // Samstag steht im Seed nicht - fehlende Angabe ist keine Zusage.
    const samstag = naechster(6, 3);

    await anmelden(page, KONTEN.office);
    await terminFormular(page, { tag: samstag, von: '09:00', bis: '10:00' });

    await expect(page.getByRole('group', { name: 'Außerhalb der Arbeitszeit' })).toBeVisible();
  });

  test('umgeht mit der Bestaetigung den Ueberschneidungsschutz nicht', async ({ page }) => {
    const tag = naechster(3, 4);

    await anmelden(page, KONTEN.office);
    await terminFormular(page, { tag, von: '19:00', bis: '20:00' });
    await page.getByRole('button', { name: 'Termin trotzdem anlegen' }).click();
    await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);

    // Derselbe Zeitraum, erneut bestaetigt: die Ueberschneidung bleibt.
    await terminFormular(page, { tag, von: '19:00', bis: '20:00' });
    await page.getByRole('button', { name: 'Termin trotzdem anlegen' }).click();

    await expect(page.getByText(/hat die behandelnde Person bereits einen Termin/)).toBeVisible();
  });
});
