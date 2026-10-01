import { expect, test, type Page } from '@playwright/test';

/**
 * Am Termin steht, was man vor der Tür wissen muss - im echten Browser
 * (PRX-EPIC-002).
 *
 * Die Komponententests prüfen Inhalt, Wege und Rollen. Hier geht es um das,
 * was jsdom nicht misst: ob die Terminseite mit Kurzblick, Zähler und
 * Heilmitteln bei 375 px ohne waagerechtes Scrollen auskommt, ob der
 * Kurzblick zugeklappt beginnt und ob die Bedienelemente Tippziele sind.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/termin.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Termin: Kurzblick, Zähler und Heilmittel', () => {
  for (const ansicht of ['behandelnd', 'buero', 'bestaetigt']) {
    test(`${ansicht} läuft bei 375 px nicht waagerecht über`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${PRUEFSEITE}?ansicht=${ansicht}`);
      await expect(
        page.getByText('Termin 8 von 10').or(page.getByText('Termin 10 von 10')),
      ).toBeVisible();
      await page.locator('summary', { hasText: 'Vor der Tür' }).click();
      await expect(page.getByText(/Theraband gelb mitgegeben/)).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('der Kurzblick beginnt zugeklappt und hat einen 44-px-Kopf', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=behandelnd`);
    const kopf = page.locator('summary', { hasText: 'Vor der Tür' });
    await expect(page.getByText(/Theraband gelb mitgegeben/)).toHaveCount(0);
    expect((await kopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await kopf.click();
    await expect(page.getByText('Theraband, Kinesiotape, Übungsplan ausgedruckt')).toBeVisible();
  });

  test('die Behandelnde sieht Zähler und Heilmittel, aber keine Zahlungsangaben', async ({
    page,
  }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=behandelnd`);
    await expect(page.getByText('Termin 8 von 10')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Krankengymnastik' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Manuelle Therapie' })).not.toBeChecked();
    await expect(page.getByText('Offene Rechnungen')).toHaveCount(0);
    await page.getByRole('button', { name: 'Heilmittel bestätigen' }).click();
    await expect(page.getByRole('group', { name: 'Heilmittel bestätigen' })).toContainText(
      'Korrigieren lässt sich das danach nur im Büro',
    );
  });

  test('das Büro sieht Empfänger und offene Rechnungen', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=buero`);
    await expect(page.getByText('Beihilfestelle')).toBeVisible();
    await expect(page.getByText(/1 Rechnung, 90,00\s€ offen – davon überfällig/)).toBeVisible();
  });

  test('nach dem Bestätigen: kein Knopf zum Zurücknehmen, Hinweis bei ausgeschöpfter Grundlage', async ({
    page,
  }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=bestaetigt`);
    await expect(page.getByText('Bestätigt von Anna Beispiel.')).toBeVisible();
    await expect(page.getByText(/Die Grundlage ist damit ausgeschöpft/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Heilmittel bestätigen' })).toHaveCount(0);
  });
});

// UI-Redesign Schritt 4 (Design-Handoff 2026-10-01, Abschnitt 6).
test.describe('Termin: Anordnung nach dem Design-Handoff', () => {
  for (const ansicht of ['hausbesuch', 'praxis', 'abgesagt', 'fremd']) {
    test(`${ansicht} läuft bei 375 px nicht waagerecht über`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${PRUEFSEITE}?ansicht=${ansicht}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Max Mustermann' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('am Rechner steht die Abrechnung rechts neben den Kacheln', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${PRUEFSEITE}?ansicht=buero`);
    const abrechnung = page.getByRole('heading', { name: 'Abrechnung' });
    const kacheln = page.getByText('Termin 8 von 10');
    await expect(abrechnung).toBeVisible();
    const rechts = (await abrechnung.boundingBox())!;
    const links = (await kacheln.boundingBox())!;
    expect(rechts.x).toBeGreaterThan(links.x + links.width);
  });

  test('am Telefon steht die Abrechnung unter den Kacheln', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=buero`);
    const abrechnung = (await page.getByRole('heading', { name: 'Abrechnung' }).boundingBox())!;
    const kachel = (await page.getByText('Termin 8 von 10').boundingBox())!;
    expect(abrechnung.y).toBeGreaterThan(kachel.y);
  });

  test('am Hausbesuch: Handlungen in „Nach dem Termin", die Absage leise am Ende', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=hausbesuch`);
    const karte = page.locator('div', {
      has: page.getByRole('heading', { name: 'Nach dem Termin' }),
    });
    await expect(karte.getByRole('button', { name: 'Niemand öffnet?' }).first()).toBeVisible();
    const absage = page.getByRole('button', { name: 'Termin absagen' });
    const nachDemTermin = (await page
      .getByRole('heading', { name: 'Nach dem Termin' })
      .boundingBox())!;
    expect((await absage.boundingBox())!.y).toBeGreaterThan(nachDemTermin.y);
    expect((await absage.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
