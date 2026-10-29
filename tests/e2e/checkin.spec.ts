import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Check-in und Angaben im echten Browser (TRK-EPIC-001, TRK-EPIC-002).
 *
 * Komponententests prüfen Inhalt und Wege, `pnpm test:db` die Regeln am
 * Server. Hier: kein waagerechtes Scrollen bei 375 px, Stufen der Skala
 * mindestens 44 × 44 px (am Handy zwei Reihen), axe ohne Verstoß, und keine
 * Farbe als Bewertung an einem Wert (ADR-006 Punkt 11).
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plattform.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** Gezeichnete Linien im Inhalt außer dem Pfeil einer Zeile: ein Verlauf als Linie deutete. */
async function linienbilder(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll('main polyline, main path')].filter(
        (linie) => !linie.closest('[data-pfeil]'),
      ).length,
  );
}

async function axeVerstoesse(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof AxeCore }).axe;
    const ergebnis = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return ergebnis.violations.map(
      (v) => `${v.id}: ${v.help} – ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`,
    );
  });
}

test.describe('Check-in (TRK-EPIC-001)', () => {
  for (const breite of [375, 1280]) {
    test(`Fragen mit Skala bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=checkin`);
      const ruhe = page.getByRole('group', { name: 'Wie stark sind Ihre Schmerzen in Ruhe?' });
      await expect(ruhe).toBeVisible();
      await expect(page.getByText('Ihre letzte Angabe: 3').first()).toBeVisible();
      // Jede Stufe ein eigenes Ziel von mindestens 44 × 44 px.
      const stufen = ruhe.getByRole('button');
      await expect(stufen).toHaveCount(11);
      for (const stufe of await stufen.all()) {
        const box = (await stufe.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await stufen.nth(4).click();
      await expect(stufen.nth(4)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('gewählt: 4')).toHaveCount(1);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Zeile und Dank auf der Übersicht bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=checkin-uebersicht`);
      await expect(page.getByText('3 kurze Fragen', { exact: false })).toBeVisible();
      // Seit Schritt 1e die Hauptsache: der ganze Knopf ist das Ziel.
      const zeile = page.getByRole('link', { name: /Check-in beantworten/ });
      await expect(zeile).toBeVisible();
      expect((await zeile.boundingBox())!.height).toBeGreaterThanOrEqual(56);
      expect(await ueberlaeuft(page)).toBe(false);

      await page.goto(`${PRUEFSEITE}?seite=checkin-danke`);
      // Die Rückmeldung, nicht der Satz der Hauptsache darunter (Schritt 1e).
      await expect(
        page.getByText(/Danke\. Ihre Therapeut:in sieht Ihre Angaben beim nächsten Termin/),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: /Check-in beantworten/ })).toHaveCount(0);
    });

    test(`Meine Angaben bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=angaben`);
      await expect(page.getByRole('heading', { level: 1, name: 'Meine Angaben' })).toBeVisible();
      // Je Frage eine Zeile mit dem letzten Wert und seinem Tag, mindestens 72 hoch.
      const ruhe = page.getByRole('link', { name: /^Schmerz in Ruhe\s*, 3 von 10, zuletzt am / });
      await expect(ruhe).toBeVisible();
      expect((await ruhe.boundingBox())!.height).toBeGreaterThanOrEqual(72);
      await expect(page.getByRole('heading', { name: 'Nach den Übungen' })).toBeVisible();
      expect(await linienbilder(page)).toBe(0);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
      // Der Wert steht neben dem Namen; bei 200 % (188 px) passt er nicht mehr und rückt darunter.
      const lage = async () => ({
        name: (await ruhe.getByText('Schmerz in Ruhe', { exact: true }).boundingBox())!,
        wert: (await ruhe.locator('span[aria-hidden="true"]').boundingBox())!,
      });
      const breit = await lage();
      expect(breit.wert.x).toBeGreaterThan(breit.name.x + breit.name.width);
      await page.setViewportSize({ width: 188, height: 900 });
      const schmal = await lage();
      expect(schmal.wert.y).toBeGreaterThan(schmal.name.y + schmal.name.height);
      expect(await ueberlaeuft(page)).toBe(false);
      await page.setViewportSize({ width: breite, height: 900 });

      // Die Seite der Frage: jede Antwort als Zeile mit Balken und Zahl, die jüngste oben.
      await ruhe.click();
      await expect(page.getByRole('heading', { level: 1, name: 'Schmerz in Ruhe' })).toBeVisible();
      const antworten = page
        .getByRole('list', { name: 'Ihre Angaben zu Schmerz in Ruhe' })
        .getByRole('listitem');
      await expect(antworten).toHaveCount(4);
      await expect(antworten.first()).toContainText(': 3');
      await expect(antworten.nth(1)).toContainText('Vertretung');
      expect(await linienbilder(page)).toBe(0);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      // Zurück und zu allen Antworten: Die Tabelle rollt in sich, nicht die Seite.
      await page.getByRole('link', { name: '← Meine Angaben' }).click();
      await page.getByRole('link', { name: 'Alle Antworten als Tabelle' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Alle Antworten' })).toBeVisible();
      const tabelle = page.getByRole('table', { name: /Meine Angaben aus dem Check-in/ });
      await expect(tabelle.getByRole('row', { name: /Schmerzart/ })).toContainText('stechend');
      await expect(page.getByText('Ein Strich heißt: nicht angegeben.')).toHaveCount(2);
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Zwischen den Terminen in der Praxis bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=zwischen`);
      await expect(page.getByText('Check-in: alle 7 Tage')).toBeVisible();
      // TRK-006: Check-ins und Einheiten je Größe über die Zeit.
      const checkins = page.getByRole('table', { name: /Angaben aus den Check-ins/ });
      await expect(
        checkins.getByRole('row', { name: /Schmerzmittel in 24 Stunden/ }),
      ).toContainText('nein');
      const einheiten = page.getByRole('table', { name: /Angaben nach den Einheiten/ });
      await expect(einheiten.getByRole('row', { name: /Bewegungssicherheit/ })).toContainText('7');
      // OUT-001: Punktbilder mit nummerierten Ereignissen und Planwechseln.
      const bild = page.getByRole('figure').filter({ hasText: 'Schmerz in Ruhe' }).first();
      await expect(bild).toContainText('Ereignisse: 1 Plan zugewiesen · 2 Erkrankung');
      await expect(bild.locator('polyline, path')).toHaveCount(0);
      await expect(page.getByText('Erkrankung · Erkältung')).toBeVisible();
      // Ein hoher Wert sieht aus wie ein niedriger: keine Farbe als Bewertung.
      const farben = await checkins
        .getByRole('cell')
        .evaluateAll((zellen) => zellen.map((z) => getComputedStyle(z).backgroundColor));
      expect(new Set(farben).size).toBe(1);
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('button', { name: 'Check-in ändern' }).click();
      await expect(page.getByLabel('Wie oft?')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }
});

test.describe('Assessments im Training (OUT-EPIC-001)', () => {
  for (const breite of [375, 1280]) {
    test(`Messungen, Seitenvergleich und Wiederholung bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=assessments`);
      const tabelle = page.getByRole('table', { name: /Messungen Sprungtests Knie/ });
      await expect(tabelle.getByRole('row', { name: /Einbeinsprung/ })).toContainText(
        'kleinere Seite 86 % der größeren',
      );
      await expect(page.getByText(/Sprungtests Knie · geplant am/)).toBeVisible();
      // Die Tabelle scrollt in sich, nicht die Seite.
      expect(await ueberlaeuft(page)).toBe(false);
      await page.getByRole('button', { name: /Wiederholen wie am/ }).click();
      const formular = page.getByRole('form', { name: 'Assessment festhalten' });
      await expect(formular.getByLabel('Test', { exact: false }).first()).toHaveValue(
        'Sprungtests Knie',
      );
      for (const knopf of await formular.getByRole('button').all()) {
        expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }
});
