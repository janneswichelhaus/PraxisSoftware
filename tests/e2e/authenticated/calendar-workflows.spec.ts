import { expect, test, type Page } from '@playwright/test';
import {
  KONTEN,
  TAGESFENSTER,
  anmelden,
  detailWert,
  supabaseKonfiguration,
  tagImFenster,
  terminKachel,
  terminUeberOberflaeche,
  zugriffstoken,
} from './helpers';

/**
 * Echter Kalenderfluss hinter der Anmeldung (CAL-002).
 *
 * Browser → GoTrue → PostgREST → SECURITY-DEFINER-RPC → PostgreSQL, nichts
 * gestubbt. Geprüft wird der Weg, den eine bedienende Person tatsächlich geht:
 * anmelden, Kalender öffnen, den Termin finden, ihn öffnen.
 *
 * Wie bei CAL-001 belegt jeder Lauf einen eigenen Zeitraum: ein angelegter
 * Termin lässt sich in diesem Stand fachlich nicht entfernen.
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();

/** Kalendertag im eigenen Tagesfenster dieser Spezifikation (siehe helpers.ts). */
function laufTag(versatz = 0): string {
  return tagImFenster(TAGESFENSTER.calendar, LAUF, versatz);
}

function laufZeit(offsetMinuten = 0): string {
  // Der Beginn muss auf dem Praxisraster liegen (CAL-005; im Seed 5 Minuten).
  const start = 9 * 60 + (LAUF % 20) * 5 + offsetMinuten;
  const h = String(Math.floor(start / 60)).padStart(2, '0');
  const m = String(start % 60).padStart(2, '0');
  return `${h}:${m}`;
}

const TAG = laufTag();
const BEGINN = laufZeit();
const ENDE = laufZeit(60);

const terminAnlegen = (page: Page) => terminUeberOberflaeche(page, { tag: TAG, von: BEGINN });

test.describe('CAL-002: Kalender', () => {
  test('findet den Termin im Kalender und öffnet seine Detailansicht', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    const terminId = await terminAnlegen(page);

    // Über die Navigation in den Kalender, dann gezielt auf den Tag. Der
    // Arbeitsbereich heisst "Kalender"; der erste Treffer ist sein Eintrag in
    // der seitlichen Navigation, nicht der gleichnamige Punkt im Untermenue.
    await page.getByRole('link', { name: 'Kalender' }).first().click();
    await expect(page.getByRole('heading', { name: 'Kalender' })).toBeVisible();

    await page.goto(`/kalender?ansicht=tag&datum=${TAG}`);

    const eintrag = terminKachel(page, terminId);
    await expect(eintrag).toBeVisible();
    await expect(eintrag).toContainText(`${BEGINN}–${ENDE}`);
    // Seit CAL-006 hat jede behandelnde Person eine eigene Spalte; ihr Name
    // steht einmal am Spaltenkopf statt in jeder Kachel. Geprueft wird
    // deshalb, dass der Termin in IHRER Spalte liegt.
    await expect(page.getByRole('gridcell', { name: 'Anna Beispiel' })).toContainText(
      'Max Mustermann',
    );

    await eintrag.click();
    await expect(page).toHaveURL((u) => u.pathname === `/termine/${terminId}`);
    await expect(detailWert(page, 'Status')).toContainText('Bestätigt');
  });

  test('behält Ansicht, Datum und Filter beim Neuladen', async ({ page, request }) => {
    await anmelden(page, KONTEN.office);

    // Die Kennung der behandelnden Person kommt aus dem echten Lesepfad.
    const token = await zugriffstoken(request, KONTEN.office);
    const { url, anonKey } = supabaseKonfiguration();
    const antwort = await request.post(`${url}/rest/v1/rpc/list_assignable_therapists`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(antwort.status()).toBe(200);
    const personen = (await antwort.json()) as { staff_member_id: string; display_name: string }[];
    const anna = personen.find((p) => p.display_name === 'Anna Beispiel');
    expect(anna, 'Anna Beispiel ist zuordenbar').toBeTruthy();

    const adresse = `/kalender?ansicht=tag&datum=${TAG}&person=${anna!.staff_member_id}&status=all`;
    await page.goto(adresse);
    await expect(page.getByLabel('Behandelnde Person')).toHaveValue(anna!.staff_member_id);
    await expect(page.getByLabel('Status')).toHaveValue('all');

    await page.reload();
    await expect(page).toHaveURL((u) => u.searchParams.get('datum') === TAG);
    await expect(page.getByLabel('Behandelnde Person')).toHaveValue(anna!.staff_member_id);
    await expect(page.getByLabel('Status')).toHaveValue('all');
  });

  test('fällt bei verstellter Adresszeile sicher auf die Standardansicht zurück', async ({
    page,
  }) => {
    await anmelden(page, KONTEN.office);
    await page.goto('/kalender?ansicht=monat&datum=2027-02-30&person=nicht-uuid&status=deleted');

    // Keine Fehlerseite, sondern die Wochenansicht mit Standardfiltern.
    await expect(page.getByRole('heading', { name: 'Kalender' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Woche' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Standardfilter ist seit CAL-004 "active": geplante UND abgeschlossene
    // Termine belegen den Tag.
    await expect(page.getByLabel('Status')).toHaveValue('active');
    // Seit CAL-006 steht in der Woche immer genau eine Person im Gitter; der
    // unsinnige Wert aus der Adresszeile ist verworfen.
    await expect(page.getByLabel('Behandelnde Person')).not.toHaveValue('nicht-uuid');
  });

  test('blättert vor und zurück', async ({ page }) => {
    await anmelden(page, KONTEN.office);
    await page.goto(`/kalender?ansicht=tag&datum=${TAG}`);

    await page.getByRole('button', { name: 'Nächster Zeitraum' }).click();
    await expect(page).not.toHaveURL((u) => u.searchParams.get('datum') === TAG);

    await page.getByRole('button', { name: 'Vorheriger Zeitraum' }).click();
    await expect(page).toHaveURL((u) => u.searchParams.get('datum') === TAG);
    // Hier zaehlt nur, dass der Tag nach dem Zurueckblaettern wieder belegt
    // ist - welcher Termin es genau ist, prueft der Ablauf weiter oben.
    await expect(page.getByRole('link', { name: /Max Mustermann/ }).first()).toBeVisible();
  });

  test('läuft bei 375 px ohne horizontales Scrollen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    await anmelden(page, KONTEN.office);

    for (const ansicht of ['woche', 'tag']) {
      await page.goto(`/kalender?ansicht=${ansicht}&datum=${TAG}`);
      await expect(page.getByRole('heading', { name: 'Kalender' })).toBeVisible();

      const ueberlauf = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(
        ueberlauf,
        `kein horizontaler Ueberlauf in der Ansicht ${ansicht}`,
      ).toBeLessThanOrEqual(0);

      // Die Filter bleiben auf schmalen Displays erreichbar.
      await expect(page.getByLabel('Behandelnde Person')).toBeVisible();
    }
  });
});

test.describe('CAL-002: Lesepfad ist serverseitig abgesichert', () => {
  test('weist ein Patientenkonto am Kalenderlesepfad ab', async ({ request }) => {
    const token = await zugriffstoken(request, 'max.mustermann@patient.invalid');
    const { url, anonKey } = supabaseKonfiguration();

    const antwort = await request.post(`${url}/rest/v1/rpc/list_appointments`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { p_from: TAG, p_to: TAG, p_status: 'all' },
    });

    expect(antwort.status()).toBe(403);
  });

  test('weist ein unangemessen grosses Zeitfenster ab', async ({ request }) => {
    const token = await zugriffstoken(request, KONTEN.office);
    const { url, anonKey } = supabaseKonfiguration();

    const antwort = await request.post(`${url}/rest/v1/rpc/list_appointments`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { p_from: '2027-01-01', p_to: '2027-12-31', p_status: 'all' },
    });

    expect(antwort.status()).toBeGreaterThanOrEqual(400);
  });
});
