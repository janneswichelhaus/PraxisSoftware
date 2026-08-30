import { expect, test, type Page } from '@playwright/test';
import {
  arbeitszeitBestaetigen,
  KONTEN,
  PATIENTEN,
  anmelden,
  detailWert,
  supabaseKonfiguration,
  terminUeberApi,
  zugriffstoken,
} from './helpers';

/**
 * Echte Kernflüsse für Bearbeiten, Verschieben und Absagen (CAL-003).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Jeder Lauf belegt eigene Zeiträume: ein angelegter Termin lässt
 * sich fachlich nicht entfernen, und das soll auch so bleiben.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Bewusst ein anderer Tagesbereich als in den übrigen Spezifikationen. */
function laufTag(versatz = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 520 + (LAUF % 150) + versatz);
  return d.toISOString().slice(0, 10);
}

function zeit(minutenAbAcht: number): string {
  const gesamt = 8 * 60 + ((LAUF % 60) + minutenAbAcht);
  const h = String(Math.floor(gesamt / 60)).padStart(2, '0');
  const m = String(gesamt % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** Legt einen Termin über die echte Oberfläche an und liefert seine Kennung. */
async function terminAnlegen(
  page: Page,
  opts: { tag: string; von: string; bis: string; person?: string },
): Promise<string> {
  await page.goto(`/patienten/${PATIENTEN.max}/termine/neu`);
  await page
    .getByLabel('Behandelnde Person *')
    .selectOption({ label: opts.person ?? 'Anna Beispiel' });
  await page.getByLabel('Terminart *').selectOption('practice');
  await page.getByLabel('Datum *').fill(opts.tag);
  await page.getByLabel('Beginn *').fill(opts.von);
  await page.getByLabel('Ende *').fill(opts.bis);
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
  await arbeitszeitBestaetigen(page, 'Termin trotzdem anlegen', /\/termine\/[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/\/termine\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

test.describe('CAL-003: Bearbeiten und Verschieben', () => {
  test('verschiebt einen Termin dauerhaft', async ({ page }) => {
    const tag = laufTag();
    const von = zeit(0);
    const bis = zeit(45);
    const neuVon = zeit(120);
    const neuBis = zeit(165);

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });

    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(page.getByRole('heading', { name: 'Termin bearbeiten' })).toBeVisible();

    // Vorbefüllt mit dem bestehenden Stand.
    await expect(page.getByLabel('Beginn *')).toHaveValue(von);
    await expect(page.getByLabel('Datum *')).toHaveValue(tag);

    await page.getByLabel('Beginn *').fill(neuVon);
    await page.getByLabel('Ende *').fill(neuBis);
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await arbeitszeitBestaetigen(page, 'Änderung trotzdem speichern', /\/termine\/[0-9a-f-]{36}$/);

    await expect(page).toHaveURL((u) => u.pathname === `/termine/${terminId}`);
    await expect(detailWert(page, 'Zeit')).toContainText(`${neuVon}–${neuBis}`);

    // Und die Änderung überlebt das Neuladen.
    await page.reload();
    await expect(detailWert(page, 'Zeit')).toContainText(`${neuVon}–${neuBis}`);
    await expect(detailWert(page, 'Status')).toContainText('Geplant');
  });

  test('wechselt die behandelnde Person und die Terminart', async ({ page }) => {
    const tag = laufTag(1);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(45) });

    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await page.getByLabel('Behandelnde Person *').selectOption({ label: 'Tim Teamleitung' });
    await page.getByLabel('Terminart *').selectOption('home_visit');

    // Die Adresse wird übernommen und nicht erfragt.
    await expect(page.getByText('Adresse des Hausbesuchs')).toBeVisible();
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await arbeitszeitBestaetigen(page, 'Änderung trotzdem speichern', /\/termine\/[0-9a-f-]{36}$/);

    await expect(detailWert(page, 'Behandelnde Person')).toContainText('Tim Teamleitung');
    await expect(detailWert(page, 'Art')).toContainText('Hausbesuch');
    await expect(detailWert(page, 'Anschrift')).toContainText('Beispielstrasse');
  });

  test('verhindert eine Überschneidung beim Verschieben', async ({ page }) => {
    const tag = laufTag(2);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(45) });
    await terminAnlegen(page, { tag, von: zeit(120), bis: zeit(165) });

    // Der zweite Termin soll auf den ersten geschoben werden.
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await page.getByLabel('Beginn *').fill(zeit(15));
    await page.getByLabel('Ende *').fill(zeit(60));
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await arbeitszeitBestaetigen(page, 'Änderung trotzdem speichern', /\/termine\/[0-9a-f-]{36}$/);

    await expect(page.getByText(/hat die behandelnde Person bereits einen Termin/)).toBeVisible();
    await expect(page).toHaveURL(/\/bearbeiten$/);
  });

  test('meldet einen Bearbeitungskonflikt und lässt den Termin unverändert', async ({
    page,
    request,
  }) => {
    const tag = laufTag(3);
    const von = zeit(0);
    const bis = zeit(45);

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von, bis });

    // Formular öffnen - es hält jetzt den aktuellen Stand fest.
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(page.getByLabel('Beginn *')).toHaveValue(von);

    // Zwischenzeitlich ändert jemand anderes denselben Termin.
    const token = await zugriffstoken(request, KONTEN.therapist);
    const { url, anonKey } = supabaseKonfiguration();
    const kopf = {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const gelesen = await request.get(
      `${url}/rest/v1/appointment_directory?select=updated_at,staff_member_id&id=eq.${terminId}`,
      { headers: kopf },
    );
    expect(gelesen.status()).toBe(200);
    const [stand] = (await gelesen.json()) as { updated_at: string; staff_member_id: string }[];

    const fremdeAenderung = await request.post(`${url}/rest/v1/rpc/update_appointment`, {
      headers: kopf,
      data: {
        p_appointment_id: terminId,
        p_expected_updated_at: stand!.updated_at,
        p_staff_member_id: stand!.staff_member_id,
        p_appointment_type: 'video',
        p_date: tag,
        p_start_time: von,
        p_end_time: bis,
        p_location_id: null,
      },
    });
    expect(fremdeAenderung.status(), 'die zwischenzeitliche Änderung greift').toBe(200);

    // Jetzt speichert das offene Formular auf einem veralteten Stand.
    await page.getByLabel('Beginn *').fill(zeit(240));
    await page.getByLabel('Ende *').fill(zeit(285));
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await arbeitszeitBestaetigen(page, 'Änderung trotzdem speichern', /\/termine\/[0-9a-f-]{36}$/);

    await expect(page.getByText(/zwischenzeitlich von einer anderen Person/)).toBeVisible();

    // Der Termin trägt weiterhin die fremde Änderung, nicht die verworfene.
    const pruefToken = await zugriffstoken(request, KONTEN.office);
    const termin = await terminUeberApi(request, pruefToken, terminId);
    expect(termin?.appointment_type).toBe('video');
  });
});

test.describe('CAL-003: Absagen', () => {
  test('sagt einen Termin ab und bleibt im Kalender nachvollziehbar', async ({ page }) => {
    const tag = laufTag(4);

    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page, { tag, von: zeit(0), bis: zeit(45) });

    // Eine Absage darf kein versehentlicher Einzelklick auslösen.
    await page.getByRole('button', { name: 'Termin absagen' }).click();
    const rueckfrage = page.getByRole('group', { name: 'Termin absagen' });
    await expect(rueckfrage).toBeVisible();
    await expect(rueckfrage).toContainText('Max Mustermann');
    await expect(rueckfrage).toContainText(/bleibt vollständig erhalten/);

    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();

    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');
    await page.reload();
    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');

    // Keine Aktionen mehr an einem abgesagten Termin.
    await expect(page.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Termin absagen' })).toHaveCount(0);

    // Im Kalender standardmäßig ausgeblendet …
    await page.goto(`/kalender?ansicht=tag&datum=${tag}`);
    await expect(page.getByRole('link', { name: /Max Mustermann/ })).toHaveCount(0);

    // … über den Statusfilter aber nachvollziehbar.
    await page.goto(`/kalender?ansicht=tag&datum=${tag}&status=all`);
    const eintrag = page.getByRole('link', { name: /Max Mustermann/ });
    await expect(eintrag).toBeVisible();
    await expect(eintrag).toContainText('Abgesagt');
    await expect(eintrag).toHaveAttribute('href', `/termine/${terminId}`);
  });

  test('gibt den Zeitraum eines abgesagten Termins wieder frei', async ({ page }) => {
    const tag = laufTag(5);
    const von = zeit(0);
    const bis = zeit(45);

    await anmelden(page, KONTEN.office);
    await terminAnlegen(page, { tag, von, bis });

    await page.getByRole('button', { name: 'Termin absagen' }).click();
    await page.getByRole('button', { name: 'Ja, Termin absagen' }).click();
    await expect(detailWert(page, 'Status')).toContainText('Abgesagt');

    // Derselbe Zeitraum ist wieder belegbar.
    const neuer = await terminAnlegen(page, { tag, von, bis });
    expect(neuer).toMatch(/^[0-9a-f-]{36}$/);
    await expect(detailWert(page, 'Status')).toContainText('Geplant');
  });

  test('weist ein Patientenkonto an beiden Schreibpfaden ab', async ({ request }) => {
    const token = await zugriffstoken(request, 'max.mustermann@patient.invalid');
    const { url, anonKey } = supabaseKonfiguration();
    const kopf = {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const geaendert = await request.post(`${url}/rest/v1/rpc/update_appointment`, {
      headers: kopf,
      data: {
        p_appointment_id: '77777777-7777-4777-8777-000000000001',
        p_expected_updated_at: '2027-01-01T00:00:00+00',
        p_staff_member_id: '55555555-5555-4555-8555-000000000002',
        p_appointment_type: 'video',
        p_date: laufTag(6),
        p_start_time: '09:00',
        p_end_time: '10:00',
        p_location_id: null,
      },
    });
    expect(geaendert.status()).toBe(403);

    const abgesagt = await request.post(`${url}/rest/v1/rpc/cancel_appointment`, {
      headers: kopf,
      data: {
        p_appointment_id: '77777777-7777-4777-8777-000000000001',
        p_expected_updated_at: '2027-01-01T00:00:00+00',
      },
    });
    expect(abgesagt.status()).toBe(403);
  });
});
