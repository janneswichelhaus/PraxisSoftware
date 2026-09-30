import { expect, test, type Page } from '@playwright/test';

/**
 * Bereich Training im echten Browser (TRN-EPIC-001).
 *
 * Die Komponententests prüfen Inhalt und Wege. Hier geht es um das, was jsdom
 * nicht misst: kein waagerechtes Scrollen bei 375 px, auch mit langen Namen
 * und Adressen, und Tippziele von 44 px.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/training.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Training', () => {
  for (const breite of [375, 1280]) {
    test(`Liste, Anlegen und Detail laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=liste`);
      await expect(
        page.getByRole('heading', { name: 'Trainingskund:innen', level: 1 }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: /Tina Trainingskundin/ })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=neu`);
      await expect(page.getByLabel('Vorname *')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=detail`);
      await expect(page.getByRole('heading', { name: 'Tina Trainingskundin' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('button', { name: 'Vertrag beenden' }).click();
      await expect(page.getByLabel('Letzter Vertragstag')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  // TRN-EPIC-002: Trainingstermin, Anlegen, Vereinbarungen und Termine.
  for (const breite of [375, 1280]) {
    test(`Trainingstermin und Anlegen laufen bei ${breite} px nicht über`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=termin`);
      await expect(page.getByRole('heading', { name: 'Trainingstermin', level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Tina Trainingskundin' })).toBeVisible();
      await expect(page.getByText('7 Termine von 10')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('button', { name: 'Termin absagen' }).click();
      await expect(page.getByLabel('Absagegrund')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=termin-neu`);
      await expect(page.getByLabel('Vereinbarung')).toBeVisible();
      await expect(page.getByLabel('Betreuende Person *')).toHaveValue(
        '55555555-5555-4555-8555-000000000006',
      );
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=detail`);
      await expect(page.getByRole('heading', { name: 'Vereinbarungen' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Termine' })).toBeVisible();
      await page.getByRole('button', { name: 'Vereinbarung anlegen' }).click();
      await expect(page.getByLabel('Vereinbarte Einheiten')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  // TRN-EPIC-004: Trainingsprotokoll am Termin und die Einheiten der Kundin.
  for (const breite of [375, 1280]) {
    test(`Trainingsprotokoll und Einheiten laufen bei ${breite} px nicht über`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });

      await page.goto(`${PRUEFSEITE}?seite=termin`);
      await expect(page.getByRole('heading', { name: 'Trainingsprotokoll' })).toBeVisible();
      await expect(page.getByLabel('Was in der Einheit gemacht wurde')).toHaveValue(
        /Kniebeugen 3 × 10/,
      );
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('button', { name: 'Protokoll abschließen' }).click();
      await expect(page.getByText(/lässt sich danach nicht mehr ändern/)).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=termin-dokumentiert`);
      await expect(page.getByText(/Rudern am Kabelzug/)).toBeVisible();
      await expect(page.getByText(/Abgeschlossen am/)).toBeVisible();
      await expect(page.getByLabel('Was in der Einheit gemacht wurde')).toHaveCount(0);
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=detail`);
      await expect(page.getByRole('heading', { name: 'Einheiten' })).toBeVisible();
      await expect(page.getByText(/Absprache: nächste Woche/)).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('Listenzeilen und Knöpfe sind mindestens 44 px hoch', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${PRUEFSEITE}?seite=liste`);
    const zeile = await page.getByRole('link', { name: /Tina Trainingskundin/ }).boundingBox();
    expect(zeile!.height).toBeGreaterThanOrEqual(44);
    const anlegen = await page
      .getByRole('link', { name: 'Trainingskund:in anlegen' })
      .boundingBox();
    expect(anlegen!.height).toBeGreaterThanOrEqual(44);

    await page.goto(`${PRUEFSEITE}?seite=detail`);
    const beenden = await page.getByRole('button', { name: 'Vertrag beenden' }).boundingBox();
    expect(beenden!.height).toBeGreaterThanOrEqual(44);

    await page.goto(`${PRUEFSEITE}?seite=termin`);
    for (const name of [
      'Verschieben',
      'Termin absagen',
      'Entwurf speichern',
      'Protokoll abschließen',
    ]) {
      const knopf = await page
        .getByRole(name === 'Verschieben' ? 'link' : 'button', { name })
        .boundingBox();
      expect(knopf!.height, name).toBeGreaterThanOrEqual(44);
    }
  });
});
