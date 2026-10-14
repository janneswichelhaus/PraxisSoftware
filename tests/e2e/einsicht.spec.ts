import { expect, test, type Page } from '@playwright/test';

/**
 * Die Einsicht der Praxis in die Plattform einer Person im echten Browser
 * (E-001, DSN-001 D7, Befund B11).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: Die Leiste steht oben und sagt „nur lesen“, die Plattform
 * steht bei 375 px über die ganze Breite und bei 1280 px in einem Telefon,
 * ihre Reiterleiste unten in diesem Telefon, ohne waagerechtes Scrollen, in
 * 18 px - und kein Knopf schreibt. Gelesen wird nur über `platform_preview`;
 * jede andere Anfrage bricht der Test ab und meldet sie.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/einsicht.html';
const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000002';
const ERIKA = '66666666-6666-4666-8666-000000000002';

const inTagen = (tage: number, stunde: number) => {
  const tag = new Date(Date.now() + tage * 86_400_000);
  tag.setUTCHours(stunde, 0, 0, 0);
  return tag.toISOString();
};

/** Die Antworten des Verteilers je Projektion - synthetisch, Erika Beispiel. */
const ANTWORTEN: Record<string, unknown> = {
  platform_context: [
    {
      access_id: ZUGANG,
      organization_name: 'Test Praxis Tuebingen',
      relationship_kind: 'treatment',
      status: 'active',
      readable: true,
      read_until: null,
      access_kind: 'self',
      represented_name: null,
      relationship_id: ERIKA,
      person_name: 'Erika Beispiel',
    },
  ],
  platform_onboarding: [{ pending: true, finished_at: null, skipped_at: null }],
  platform_appointments: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
      starts_at: inTagen(3, 8),
      ends_at: inTagen(3, 9),
      appointment_type: 'home_visit',
      status: 'confirmed',
      staff_name: 'Anna Beispiel',
      location_name: null,
      visit_street: 'Lange Gasse mit sehr langem Straßennamen',
      visit_house_number: '12a',
      visit_postal_code: '72070',
      visit_city: 'Tübingen',
      late_notice: false,
      open_request_kind: null,
    },
  ],
  platform_appointment_requests: [],
  platform_questionnaire: [],
  platform_invoices: [],
  platform_files: [
    {
      id: 'f1f1f1f1-f1f1-4f1f-8f1f-000000000001',
      document_type: 'arztbrief',
      display_name: 'Arztbrief Knie.pdf',
      mime_type: 'application/pdf',
      byte_size: 52_000,
      released_at: '2026-10-08T10:00:00Z',
    },
  ],
  platform_consents: [
    {
      purpose: 'email_contact',
      state: 'granted',
      occurred_on: '2026-10-01',
      source: 'platform',
      can_grant: true,
    },
  ],
  platform_representatives: [],
  platform_exercise_plans: { today: '2026-10-14', plans: [] },
  platform_messages: {
    response_workdays: 2,
    can_write: true,
    health_topics: true,
    messages: [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-000000000002',
        topic: 'exercise',
        reference_label: 'Kniebeuge am Geländer',
        status: 'answered',
        due_on: null,
        created_at: '2026-10-09T08:00:00Z',
        last_entry_at: '2026-10-09T12:00:00Z',
        closed_at: null,
        closed_by_side: null,
        entries: [
          {
            id: 'eeeeeeee-dddd-4ddd-8ddd-000000000001',
            side: 'person',
            body: 'Wie tief soll ich gehen?',
            created_at: '2026-10-09T08:00:00Z',
            author: 'you',
            author_label: null,
          },
          {
            id: 'eeeeeeee-dddd-4ddd-8ddd-000000000002',
            side: 'practice',
            body: 'Nur so tief, wie es ohne Schmerz geht.',
            created_at: '2026-10-09T12:00:00Z',
            author: 'practice',
            author_label: null,
          },
        ],
      },
    ],
  },
};

/**
 * Nichts verlässt den Browser: `platform_preview` beantwortet der Test, jede
 * andere Anfrage an den Server bricht er ab und hält sie fest.
 */
async function ohneServer(page: Page): Promise<{ gelesen: string[]; fremd: string[] }> {
  const gelesen: string[] = [];
  const fremd: string[] = [];
  await page.route(/\/(rest|auth|storage|functions)\/v1\//, (route) => {
    fremd.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });
  // Später angemeldet, also zuerst gefragt (Playwright).
  await page.route('**/rest/v1/rpc/platform_preview', (route) => {
    const { p_access_id, p_function } = route.request().postDataJSON() as {
      p_access_id: string;
      p_function: string;
    };
    gelesen.push(p_function);
    if (p_access_id !== ZUGANG) return route.fulfill({ status: 403, body: 'null' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ANTWORTEN[p_function] ?? null),
    });
  });
  return { gelesen, fremd };
}

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Einsicht der Praxis (E-001)', () => {
  for (const breite of [375, 1280]) {
    test(`zeigt Erikas Plattform lesend, mit Leiste, bei ${breite} px`, async ({ page }) => {
      const anfragen = await ohneServer(page);
      await page.setViewportSize({ width: breite, height: 860 });
      await page.goto(PRUEFSEITE);

      const leiste = page.getByRole('region', { name: 'Einsicht der Praxis' });
      await expect(leiste).toContainText(
        'Einsicht · So sieht Erika Beispiel die Plattform · nur lesen',
      );
      const zurueck = leiste.getByRole('link', { name: 'Zurück zur Akte' });
      await expect(zurueck).toBeVisible();
      expect((await zurueck.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await leiste.boundingBox())!.y).toBe(0);

      // Die Übersicht statt des Einstiegs, mit dem Satz, dass er aussteht.
      await expect(page.getByText(/Der Einstieg steht noch aus/)).toBeVisible();
      await expect(page.getByText('Nächster Termin')).toBeVisible();
      await expect(page.getByText(/Schritt 1 von/)).toHaveCount(0);

      // Die Plattform in 18 px, die Reiterleiste unten im Rahmen.
      const inhalt = page.locator('main#inhalt');
      expect(await inhalt.evaluate((el) => getComputedStyle(el).fontSize)).toBe('18px');
      const reiter = page.getByRole('navigation', { name: 'Plattform' });
      await expect(reiter).toBeVisible();
      const rahmen = await inhalt.evaluate((el) => {
        const box = el.closest('.transform-gpu')!.getBoundingClientRect();
        return { x: box.x, breite: box.width, unten: box.bottom };
      });
      const reiterBox = (await reiter.boundingBox())!;
      expect(reiterBox.width).toBeLessThanOrEqual(rahmen.breite + 1);
      expect(Math.abs(reiterBox.y + reiterBox.height - rahmen.unten)).toBeLessThanOrEqual(1);
      if (breite >= 640) {
        // Am breiten Bildschirm ein Telefon von 390 px, mittig.
        expect(Math.round(rahmen.breite)).toBe(390);
        expect(Math.abs(rahmen.x + rahmen.breite / 2 - breite / 2)).toBeLessThanOrEqual(1);
      } else {
        expect(Math.round(rahmen.breite)).toBe(breite);
      }
      expect(await ueberlaeuft(page)).toBe(false);

      // Termine: lesen, nicht wünschen.
      await reiter.getByRole('link', { name: 'Termine' }).click();
      await expect(page.getByRole('heading', { name: 'Termine', level: 1 })).toBeVisible();
      await expect(page.getByText(/Anna Beispiel/).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Termin wünschen' })).toHaveCount(0);
      expect(await ueberlaeuft(page)).toBe(false);

      // Nachrichten: lesen, nicht schreiben.
      await reiter.getByRole('link', { name: 'Nachrichten' }).click();
      await expect(page.getByText(/Kniebeuge am Geländer/)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Neue Nachricht' })).toHaveCount(0);
      await page.getByText(/Kniebeuge am Geländer/).click();
      await expect(page.getByText('Nur so tief, wie es ohne Schmerz geht.')).toBeVisible();
      await expect(page.getByRole('textbox')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Senden|erledigt/ })).toHaveCount(0);
      expect(await ueberlaeuft(page)).toBe(false);

      // Ich: kein Abmelden, Dokumente ohne Öffnen.
      await page.getByRole('link', { name: 'Ich', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Ich', level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: /bmelden/ })).toHaveCount(0);
      await page.getByRole('link', { name: 'Dokumente' }).click();
      await expect(page.getByText('Arztbrief Knie.pdf')).toBeVisible();
      await expect(page.getByText('In der Akte unter Dateien öffnen.')).toBeVisible();
      await expect(page.getByRole('button', { name: /Ansehen|Herunterladen/ })).toHaveCount(0);
      expect(await ueberlaeuft(page)).toBe(false);

      // Gelesen nur über den Verteiler; sonst hat die Seite nichts gefragt.
      expect(anfragen.fremd).toEqual([]);
      expect(anfragen.gelesen).toContain('platform_context');
      expect(anfragen.gelesen).toContain('platform_files');
    });
  }
});
