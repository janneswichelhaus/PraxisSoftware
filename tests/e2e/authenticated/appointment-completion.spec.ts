import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  TAGESFENSTER,
  anmelden,
  arbeitszeitBestaetigen,
  detailWert,
  supabaseKonfiguration,
  tagImFenster,
  terminKachel,
  terminUeberApi,
  terminUeberOberflaeche,
  zeitImLauf,
  zugriffstoken,
} from './helpers';

/**
 * Abschliessen und Wiederoeffnen im echten Ablauf (CAL-004).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Wie in den uebrigen Spezifikationen belegt jeder Lauf einen
 * eigenen Zeitraum: ein angelegter Termin laesst sich fachlich nicht
 * entfernen.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Kalendertag im eigenen Tagesfenster dieser Spezifikation (siehe helpers.ts). */
function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.appointmentCompletion, LAUF, versatz);
}

const zeit = (minutenAbAcht: number) => zeitImLauf(LAUF, minutenAbAcht);

const terminAnlegen = (page: Page, opts: { tag: string; von: string; bis: string }) =>
  terminUeberOberflaeche(page, opts);

test.describe('CAL-004: Termin abschliessen', () => {
  test('schliesst einen Termin ab und haelt den Abschluss fest', async ({ page }) => {
    const tag = laufTag();

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });

    await page.getByRole('button', { name: 'Termin abschließen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');
    await expect(detailWert(page, 'Abgeschlossen am')).not.toBeEmpty();

    // Und der Abschluss ueberlebt das Neuladen.
    await page.reload();
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');
  });

  test('verlangt keine Behandlungsdokumentation und markiert nichts als fehlend', async ({
    page,
  }) => {
    const tag = laufTag(1);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });
    await page.getByRole('button', { name: 'Termin abschließen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');

    // Keine Rueckfrage nach Inhalten. Den lesenden Abschnitt
    // "Behandlungsdokumentation" sieht office seit E15 trotzdem - er ist keine
    // Aufforderung und bietet office keinen Weg zum Dokumentieren.
    const abschnitt = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Behandlungsdokumentation' }) });
    await expect(
      abschnitt.getByText('Für diesen Termin ist noch keine Behandlungsdokumentation hinterlegt.'),
    ).toBeVisible();
    expect(await page.getByText(/dokumentation/i).count()).toBe(
      await abschnitt.getByText(/dokumentation/i).count(),
    );
    await expect(page.getByRole('link', { name: 'Dokumentation anlegen' })).toHaveCount(0);
    await expect(page.getByText(/fehlt|unvollständig/i)).toHaveCount(0);
  });

  test('bietet am abgeschlossenen Termin weder Bearbeiten noch Absagen an', async ({ page }) => {
    const tag = laufTag(2);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });
    await page.getByRole('button', { name: 'Termin abschließen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');

    await expect(page.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin absagen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin wieder öffnen' })).toBeVisible();
  });

  test('haelt den Zeitraum eines abgeschlossenen Termins weiter belegt', async ({ page }) => {
    const tag = laufTag(3);
    const von = zeit(0);
    const bis = zeit(60);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von, bis });
    await page.getByRole('button', { name: 'Termin abschließen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');

    // Anders als bei einer Absage bleibt der Zeitraum belegt: der Termin hat
    // stattgefunden, es laesst sich nicht rueckwirkend darueber buchen.
    await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Anna Beispiel' });
    await page.getByLabel('Terminart *').selectOption('practice');
    await page.getByLabel('Datum *').fill(tag);
    await page.getByLabel('Beginn *').fill(von);
    await page.getByRole('button', { name: 'Termin anlegen' }).click();
    await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);

    await expect(page.getByText(/hat die behandelnde Person bereits einen Termin/)).toBeVisible();
  });

  test('zeigt den abgeschlossenen Termin weiter im Kalender', async ({ page }) => {
    const tag = laufTag(4);

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });
    await page.getByRole('button', { name: 'Termin abschließen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');

    // Ohne Zutun, also im Standardfilter - ein abgehakter Termin darf nicht
    // aus dem Tag verschwinden.
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    const eintrag = terminKachel(page, terminId);
    await expect(eintrag).toBeVisible();
    await expect(eintrag).toContainText('Abgeschlossen');
    // Die Kachel fuehrt zu genau diesem Termin. Seit UX-012b haengt der
    // Rueckweg in die Kalenderansicht daran (`?zurueck=`); zugesichert ist
    // deshalb der Pfad, nicht die ganze Adresse.
    const ziel = new URL((await eintrag.getAttribute('href'))!, 'http://ort.invalid');
    expect(ziel.pathname).toBe(`/termine/${terminId}`);
  });
});

test.describe('CAL-004: Termin wieder oeffnen', () => {
  test('oeffnet einen Termin wieder und macht ihn erneut bearbeitbar', async ({ page }) => {
    const tag = laufTag(5);
    const neuVon = zeit(120);
    const neuBis = zeit(180);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });
    await page.getByRole('button', { name: 'Termin abschließen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');

    await page.getByRole('button', { name: 'Termin wieder öffnen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Bestätigt');
    // Der Abschlusszeitpunkt ist mit dem Status verschwunden.
    await expect(page.getByText('Abgeschlossen am')).toHaveCount(0);

    // Und der Termin laesst sich jetzt wieder verschieben.
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await page.getByLabel('Beginn *').fill(neuVon);
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await arbeitszeitBestaetigen(page, 'Änderung trotzdem speichern', /\/termine\/[0-9a-f-]{36}$/);
    await expect(detailWert(page, 'Zeit')).toContainText(`${neuVon}–${neuBis}`);
  });

  test('kann einen abgesagten Termin weder abschliessen noch wieder oeffnen', async ({ page }) => {
    const tag = laufTag(6);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });
    await page.getByRole('button', { name: 'Termin absagen' }).click();
    await page.getByLabel('Absagegrund').selectOption('patient_request');
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');

    await expect(page.getByRole('button', { name: 'Termin abschließen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin wieder öffnen' })).toHaveCount(0);
  });
});

test.describe('CAL-004: Serverseitige Grenzen', () => {
  test('weist ein Patientenkonto an beiden Schreibpfaden ab', async ({ request }) => {
    const token = await zugriffstoken(request, 'max.mustermann@patient.invalid');
    const { url, anonKey } = supabaseKonfiguration();
    const kopf = {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    for (const rpc of ['complete_appointment', 'reopen_appointment']) {
      const antwort = await request.post(`${url}/rest/v1/rpc/${rpc}`, {
        headers: kopf,
        data: {
          p_appointment_id: '77777777-7777-4777-8777-000000000001',
          p_expected_updated_at: '2027-01-01T00:00:00+00',
        },
      });
      expect(antwort.status(), `${rpc} weist das Patientenkonto ab`).toBe(403);
    }
  });

  test('weist das Absagen eines abgeschlossenen Termins auch ueber die API ab', async ({
    page,
    request,
  }) => {
    const tag = laufTag(7);

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(60) });
    await page.getByRole('button', { name: 'Termin abschließen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Abgeschlossen');

    // Die Oberflaeche blendet die Absage aus - verbindlich ist aber der Server
    // (PROJECT_PRINCIPLES.md: ausgeblendete Elemente sind keine Zugriffskontrolle).
    const token = await zugriffstoken(request, KONTEN.office);
    const { url, anonKey } = supabaseKonfiguration();
    const kopf = {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const gelesen = await request.get(
      `${url}/rest/v1/appointment_directory?select=updated_at&id=eq.${terminId}`,
      { headers: kopf },
    );
    expect(gelesen.status()).toBe(200);
    const [stand] = (await gelesen.json()) as { updated_at: string }[];

    // Vollstaendige Signatur, sonst findet PostgREST die Funktion nicht und
    // die Antwort waere 404 statt der gesuchten Zustandspruefung (CAL-014b).
    const abgesagt = await request.post(`${url}/rest/v1/rpc/cancel_appointment`, {
      headers: kopf,
      data: {
        p_appointment_id: terminId,
        p_expected_updated_at: stand!.updated_at,
        p_reason: 'other',
        p_received_on: null,
        p_received_time: null,
      },
    });
    expect(abgesagt.status()).toBe(400);
    expect(await abgesagt.text()).toContain('must be reopened first');

    const termin = await terminUeberApi(request, token, terminId);
    expect(termin?.status).toBe('completed');
  });
});
