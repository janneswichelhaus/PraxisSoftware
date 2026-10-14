import { expect, test, type Page } from '@playwright/test';

/**
 * Am Termin steht, was man vor der Tür wissen muss - im echten Browser
 * (PRX-EPIC-002).
 *
 * Die Komponententests prüfen Inhalt, Wege und Rollen. Hier geht es um das,
 * was jsdom nicht misst: ob das Fenster „Aktionen“ mit Kurzblick, Zähler und
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
      await page.locator('summary', { hasText: 'Zugang, Besonderheit' }).click();
      await expect(page.getByText(/Theraband gelb mitgegeben/)).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('der Kurzblick beginnt zugeklappt und hat einen 44-px-Kopf', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=behandelnd`);
    const kopf = page.locator('summary', { hasText: 'Zugang, Besonderheit' });
    await expect(page.getByText(/Theraband gelb mitgegeben/)).toHaveCount(0);
    expect((await kopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await kopf.click();
    await expect(page.getByText('Theraband, Kinesiotape, Übungsplan ausgedruckt')).toBeVisible();
  });

  // B7 (BEF-157): Die Leistung steht zur Kontrolle da; abgehakt wird nur der
  // Termin, keine Heilmittel (ersetzt ANN-475).
  test('die Behandelnde sieht Zähler und Leistung, hakt keine Heilmittel ab und sieht kein Geld', async ({
    page,
  }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=behandelnd`);
    await expect(page.getByText('Termin 8 von 10')).toBeVisible();
    await expect(
      page.getByText('8. von 10 Terminen · Krankengymnastik, Wärmetherapie'),
    ).toBeVisible();
    await expect(page.getByText(/Erbracht$/)).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Heilmittel bestätigen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'In die Abrechnung stellen' })).toHaveCount(0);
    await expect(page.getByText('Offene Rechnungen')).toHaveCount(0);
  });

  test('das Büro sieht Empfänger und offene Rechnungen', async ({ page }) => {
    await page.goto(`${PRUEFSEITE}?ansicht=buero`);
    await expect(page.getByText('Beihilfestelle')).toBeVisible();
    await expect(page.getByText(/1 Rechnung, 90,00\s€ offen – davon überfällig/)).toBeVisible();
  });

  for (const breite of [375, 1280]) {
    test(`ist die Verordnung vollständig, schlägt der Termin die Abrechnung vor (${breite} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?ansicht=bestaetigt`);
      // Den Stand nennt die Zeile der Leistung; der Vorschlag ist nur der Knopf.
      await expect(page.getByText(/^10\. von 10 Terminen/)).toBeVisible();
      const knopf = page.getByRole('button', { name: 'In die Abrechnung stellen' });
      await expect(knopf).toBeVisible();
      expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole('button', { name: 'Heilmittel bestätigen' })).toHaveCount(0);
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }
});

// UI-Redesign Schritt 4 (Design-Handoff 2026-10-01, Abschnitt 6).
test.describe('Termin: Anordnung nach dem Design-Handoff', () => {
  for (const ansicht of ['hausbesuch', 'praxis', 'abgesagt', 'fremd']) {
    test(`${ansicht} läuft bei 375 px nicht waagerecht über`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${PRUEFSEITE}?ansicht=${ansicht}`);
      await expect(page.getByRole('heading', { level: 2, name: 'Max Mustermann' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  // Im Fenster einspaltig: Die Abrechnung steht unter der Metazeile, am
  // Telefon wie am Rechner.
  for (const breite of [375, 1280]) {
    test(`die Abrechnung steht unter der Metazeile (${breite} px)`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?ansicht=buero`);
      const abrechnung = (await page.getByRole('heading', { name: 'Abrechnung' }).boundingBox())!;
      const kachel = (await page.getByText('Termin 8 von 10').boundingBox())!;
      expect(abrechnung.y).toBeGreaterThan(kachel.y);
    });
  }

  test('am Hausbesuch: Handlungen in der Auswahl, die Absage leise am Ende', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PRUEFSEITE}?ansicht=hausbesuch`);
    // Der Abschluss steht als eigene Gruppe vor den Zeilen (BEF-055): „Doku“
    // als Hauptknopf, daneben seit B4 (BEF-154) „Abhaken“ als eigener Schritt
    // und „Niemand öffnet?“.
    const abschluss = page.getByRole('group', { name: 'Abschluss' });
    const niemand = abschluss.getByRole('button', { name: 'Niemand öffnet?' });
    await expect(niemand).toBeVisible();
    expect((await niemand.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(abschluss.getByRole('link', { name: 'Doku schreiben' })).toBeVisible();
    const haken = abschluss.getByRole('button', { name: 'Abhaken', exact: true });
    await expect(haken).toBeVisible();
    expect((await haken.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const auswahl = page.getByRole('group', { name: 'Aktionen' });
    const absage = page.getByRole('button', { name: 'Termin absagen' });
    await absage.scrollIntoViewIfNeeded();
    const oben = (await auswahl.boundingBox())!;
    expect((await absage.boundingBox())!.y).toBeGreaterThan(oben.y);
    expect((await absage.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
