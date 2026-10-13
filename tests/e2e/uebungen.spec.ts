import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';

/**
 * Die Übungsbibliothek im echten Browser (UEB-EPIC-001, Welle B).
 *
 * Die Komponententests prüfen Inhalt, Rollen und Wege, `pnpm test:db` die
 * Regeln am Server. Hier geht es um das, was jsdom nicht misst: kein
 * waagerechtes Scrollen bei 375 px - auch aufgeklappt und mit langen
 * Bezeichnungen -, Tippziele von 44 px, die Bilder im Browser und die
 * Prüfung mit axe.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/uebungen.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
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

async function hoehe(page: Page, name: string): Promise<number> {
  const knopf = page.getByRole('button', { name, exact: true }).first();
  await expect(knopf).toBeVisible();
  return (await knopf.boundingBox())?.height ?? 0;
}

test.describe('Übungsbibliothek', () => {
  for (const breite of [375, 1280]) {
    test(`Liste mit Bildern, Suche und Filterchips bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(PRUEFSEITE);

      await expect(page.getByRole('heading', { level: 1, name: 'Übungen' })).toBeVisible();
      await expect(page.getByRole('link', { name: /^Kniebeuge/ })).toBeVisible();
      // Jede Zeile ist ein Ziel von mindestens 44 px, mit Vorschaubild davor.
      const zeile = page.getByRole('link', { name: /^Kniestreckung im Sitz/ });
      expect((await zeile.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect(zeile.locator('svg').first()).toBeVisible();
      await expect(zeile).toContainText('Knie · Kraft · Leicht, mit Halt · ungeprüft');

      // Suche auch ohne Umlaute.
      await page.getByRole('searchbox', { name: 'Suche' }).fill('gelaender');
      await expect(page.getByRole('status')).toHaveText('1 von 6 Übungen');
      await page.getByRole('searchbox', { name: 'Suche' }).fill('halb in die hocke');
      await expect(page.getByRole('status')).toHaveText('1 von 6 Übungen');
      await expect(
        page.getByText(
          'Gefunden in: Kniebeuge am Geländer, halbe Tiefe, Kniebeuge freistehend, halbe Tiefe',
        ),
      ).toBeVisible();

      await page.getByRole('searchbox', { name: 'Suche' }).fill('');
      // Am Telefon stehen die Filter hinter „Filter“, ab 640 px offen.
      if (breite < 640) await page.getByRole('button', { name: 'Filter', exact: true }).click();
      const hilfsmittel = page.getByRole('group', { name: 'Hilfsmittel' });
      await hilfsmittel.getByRole('button', { name: 'Theraband gelb' }).click();
      await expect(page.getByRole('status')).toHaveText('2 von 6 Übungen');
      for (const chip of await page
        .getByRole('group', { name: 'Ziel' })
        .getByRole('button')
        .all()) {
        expect((await chip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      for (const zusammenfassung of await page.locator('summary').all()) {
        if ((await zusammenfassung.locator('..').getAttribute('open')) === null) {
          await zusammenfassung.click();
        }
      }
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Katalogübung mit Bild, Dosierung und Anleitung bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=katalog&rolle=owner`);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kniestreckung im Sitz (Long Arc Quad)' }),
      ).toBeVisible();
      await expect(
        page.getByRole('img', {
          name: 'Im Sitz das Knie strecken: Bewegung von der Ausgangs- zur Endstellung',
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('img', { name: 'Im Sitz das Knie strecken: Ausgangsstellung' }),
      ).toBeVisible();
      await expect(page.getByText('je Seite, 3 s halten')).toBeVisible();
      await expect(page.getByText('Schritt 1:', { exact: false }).first()).toBeAttached();
      for (const name of ['Bearbeiten', 'Als durchgesehen markieren', 'Variante anlegen']) {
        expect(await hoehe(page, name)).toBeGreaterThanOrEqual(44);
      }
      // Abspielen nur auf Tippen; bei reduzierter Bewegung der Wechsel der Stellung.
      await page
        .getByRole('button', { name: /Bewegung abspielen|Endstellung zeigen/ })
        .first()
        .click();
      for (const zusammenfassung of await page.locator('summary').all()) {
        await zusammenfassung.click();
      }
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Übung mit Varianten und Verbindungen bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=uebung&rolle=owner`);

      await expect(page.getByRole('heading', { level: 1, name: 'Kniebeuge' })).toBeVisible();
      await expect(
        page.getByRole('link', { name: /Kniebeuge freistehend, halbe Tiefe/ }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: /Ausfallschritt: Ausfallschritt am Stuhl/ }),
      ).toHaveCount(0);

      // Pflege: Tippziele mindestens 44 px (Oberflächen-Checkliste Punkt 1).
      for (const name of ['Bearbeiten', 'Variante anlegen']) {
        expect(await hoehe(page, name)).toBeGreaterThanOrEqual(44);
      }

      // Alles aufgeklappt, das Formular zum Verbinden offen - nichts läuft über.
      await page.getByText('Pflege', { exact: true }).click();
      await page.getByRole('button', { name: 'Verbinden', exact: true }).click();
      await expect(page.getByLabel('Achse *')).toBeVisible();
      for (const zusammenfassung of await page.locator('summary').all()) {
        if ((await zusammenfassung.locator('..').getAttribute('open')) === null) {
          await zusammenfassung.click();
        }
      }
      await expect(
        page.getByText('Mit beiden Händen am Geländer festhalten.').last(),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }

  test('springt von einer Verbindung zur Variante dort', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${PRUEFSEITE}?seite=uebung`);
    await page
      .getByRole('link', { name: /Kniebeuge freistehend, volle Tiefe/ })
      .first()
      .click();
    await expect(page.getByText('Alltagssprache: Frei tief in die Hocke')).toBeVisible();
    await page.getByRole('link', { name: /Ausfallschritt: Ausfallschritt am Stuhl/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ausfallschritt' })).toBeVisible();
  });
});
