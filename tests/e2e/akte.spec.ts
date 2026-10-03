import { expect, test, type Page } from '@playwright/test';

/**
 * Die Patientenakte nach dem Design-Handoff vom 2026-10-01 (Abschnitt 7) in
 * einem echten Browser: Kacheln im Kopf, Kontextspalte ab 900 px
 * Inhaltsbreite, Kacheln im Terminbereich und Stammdaten ohne Silbenspalten.
 * Was jsdom nicht misst - Breiten, Lage, Überlauf -, steht hier.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/akte.html';

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

for (const abfrage of [
  '',
  '?bereich=stammdaten',
  '?bereich=doku',
  '?bereich=verordnungen',
  '?rolle=office',
  '?leer=1',
]) {
  test(`läuft bei 375 px nicht waagerecht über (${abfrage || 'Termine'})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(PRUEFSEITE + abfrage);
    await expect(page.getByRole('heading', { level: 1, name: 'Max Mustermann' })).toBeVisible();
    expect(await ueberlaeuft(page)).toBe(false);
  });
}

// AKTE-007: Abzeichen, Hinweiszeile und die eingeklappten Hinweise.
test('am Telefon stehen Abzeichen, „Anmeldebogen fehlt" und die Hinweise im ersten Bildschirm', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PRUEFSEITE);
  const art = page.getByText('Privat · mit Verordnung', { exact: true });
  const liege = page.getByText('Liege mitnehmen', { exact: true });
  await expect(art).toBeInViewport();
  await expect(liege).toBeInViewport();
  // Badge 28 px, 14/600 (Design).
  const box = (await art.boundingBox())!;
  expect(Math.round(box.height)).toBe(28);
  expect(await art.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600');

  await expect(page.getByText(/Anmeldebogen fehlt/)).toBeInViewport();
  const hinweise = page.locator('summary', { hasText: 'Hinweise' });
  await expect(hinweise).toBeInViewport();
  await expect(hinweise).toContainText('Zugang · Besonderheit');
  // Standardmäßig zu - der Zugangshinweis steht erst nach dem Aufklappen da.
  await expect(page.getByText('Zugangshinweis', { exact: true })).toBeHidden();
  await hinweise.click();
  await expect(page.getByText('Zugangshinweis', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Bereiche der Akte' })).toContainText(
    'TermineDokuBehandlungsgrundlagenStammdaten',
  );
  expect(await ueberlaeuft(page)).toBe(false);
});

// Akte entschlacken (2026-10-03): Kontakt steht in den Stammdaten, die
// Grundlage hat ihren eigenen Bereich - keine Kontextspalte mehr.
for (const breite of [375, 1280]) {
  test(`führt keine Kontextspalte und nutzt die volle Breite (${breite} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto(PRUEFSEITE);
    await expect(page.getByText('Nächster Termin')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Zur Person' })).toHaveCount(0);
    expect(await ueberlaeuft(page)).toBe(false);
  });
}

// Akte entschlacken (2026-10-03, Entwurf 5i/5j): Karten ab 340 px
// nebeneinander - lesbar bleiben sie dabei (PAT-B01).
for (const [breite, nebeneinander] of [
  [375, false],
  [1280, true],
] as const) {
  test(`die Stammdaten stehen als Karten und bleiben lesbar (PAT-B01, ${breite} px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto(`${PRUEFSEITE}?bereich=stammdaten`);
    const person = (await page.getByRole('heading', { name: 'Person' }).boundingBox())!;
    const kontakt = (await page.getByRole('heading', { name: 'Kontakt' }).boundingBox())!;
    const hausbesuch = (await page.getByRole('heading', { name: 'Hausbesuch' }).boundingBox())!;
    if (nebeneinander) {
      // Kontakt und Hausbesuch in derselben Reihe, Kanten auf einer Höhe.
      expect(Math.abs(kontakt.y - hausbesuch.y)).toBeLessThan(2);
      expect(hausbesuch.x).toBeGreaterThan(kontakt.x + 300);
    } else {
      expect(kontakt.y).toBeGreaterThan(person.y);
      expect(Math.abs(kontakt.x - person.x)).toBeLessThan(2);
    }
    // Die Anschrift steht nicht Silbe für Silbe.
    const adresse = (await page.getByText('Beispielstrasse 12, 72070 Tuebingen').boundingBox())!;
    expect(adresse.height).toBeLessThan(nebeneinander ? 30 : 50);
    expect(await ueberlaeuft(page)).toBe(false);
  });
}

test('ohne Hinweise, Grundlage und Kontakt gibt es weder Hinweise noch Spalte', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${PRUEFSEITE}?leer=1`);
  await expect(page.getByRole('heading', { level: 1, name: 'Max Mustermann' })).toBeVisible();
  await expect(page.locator('summary', { hasText: 'Hinweise' })).toHaveCount(0);
  await expect(page.getByText(/Anmeldebogen fehlt/)).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Zur Person' })).toHaveCount(0);
});

// Design-Handoff 2026-10-01, Abschnitt 7: Behandlungsverlauf nach Monat.
test.describe('Akte: Behandlungsverlauf nach Monat', () => {
  for (const breite of [375, 1280]) {
    test(`hält die Monats-Chips unter der Kopfzeile und läuft nicht über (${breite} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto('/tests/e2e/fixtures/akte.html?bereich=doku');
      const leiste = page.getByRole('navigation', { name: 'Springen zu' });
      await expect(leiste).toBeVisible();
      await page.getByRole('link', { name: 'Juli 2026' }).click();
      await expect(page.getByRole('heading', { level: 3, name: 'Juli 2026' })).toBeInViewport();
      // Die Leiste steht unter der Kopfzeile (56 px), nicht von ihr verdeckt.
      // Am Telefon klebt sie direkt darunter. Am Rechner rollt die kurze
      // Prüfseite mit den kompakten Zeilen (2026-10-03) nicht weit genug, um
      // die Leiste anzuheben - dort gilt nur: nie verdeckt.
      const box = (await leiste.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(55);
      if (breite === 375) expect(box.y).toBeLessThanOrEqual(60);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
      ).toBe(false);
    });
  }
});

// Akte entschlacken (2026-10-03): die Behandlungsgrundlagen als Kachelleiste.
test.describe('Akte: Behandlungsgrundlagen als Kacheln', () => {
  for (const [breite, kachel] of [
    [375, 156],
    [1280, 188],
  ] as const) {
    test(`Foto zuerst, abgeschlossen zuletzt, ${kachel} × 216 px (${breite} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?bereich=verordnungen`);
      const leiste = page.getByRole('region', { name: /Behandlungsgrundlagen/ }).getByRole('list');
      const kacheln = leiste.getByRole('button');
      await expect(kacheln).toHaveCount(4);
      await expect(kacheln.first()).toContainText('Daten fehlen');
      await expect(kacheln.last()).toContainText('Abgeschlossen');
      const box = (await kacheln.nth(1).boundingBox())!;
      expect(Math.round(box.width)).toBe(kachel);
      expect(Math.round(box.height)).toBe(216);
      expect(await ueberlaeuft(page)).toBe(false);

      await kacheln.first().click();
      await expect(page.getByRole('dialog', { name: 'Daten übertragen' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }
});
